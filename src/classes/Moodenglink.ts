/**
 * The Moodenglink manager — the entry point that ties nodes and players together.
 * @module classes/Moodenglink
 */

import { Collection } from "@discordjs/collection";
import { EventEmitter } from "node:events";
import type { ManagerEvents, ManagerOptions, SearchQuery } from "../types/Moodenglink";
import type {
	LoadType,
	PlaylistInfo,
	SearchResult,
	Track,
	TrackData,
	UnresolvedQuery,
	UnresolvedTrack,
	VoicePacket,
	VoiceServer,
	VoiceState,
	PlayerOptions,
} from "../types/Player";
import leastUsedNode from "../sorter/leastUsedNode";
import { buildSearchIdentifier, type SearchPlatform } from "../utils/sources";
import { TTLCache } from "../utils/cache";
import { buildAutoplaySeed, buildTrack, partialTrack, pickClosestTrack } from "../utils/utils";
import { Node } from "./Node";
import { Player } from "./Player";
import { Structure } from "./Structure";
import type { Plugin } from "./Plugin";

// Strongly typed EventEmitter surface.
export interface Moodenglink {
	on<E extends keyof ManagerEvents>(event: E, listener: (...args: ManagerEvents[E]) => void): this;
	once<E extends keyof ManagerEvents>(event: E, listener: (...args: ManagerEvents[E]) => void): this;
	off<E extends keyof ManagerEvents>(event: E, listener: (...args: ManagerEvents[E]) => void): this;
	emit<E extends keyof ManagerEvents>(event: E, ...args: ManagerEvents[E]): boolean;
}

export class Moodenglink extends EventEmitter {
	public readonly options: ManagerOptions;
	public readonly nodes = new Collection<string, Node>();
	public readonly players = new Collection<string, Player>();
	public readonly plugins = new Collection<string, Plugin>();

	public initialized = false;

	/** Optional search-result cache (enabled via `options.searchCache`). */
	private readonly searchCache: TTLCache<string, SearchResult> | null;

	constructor(options: ManagerOptions) {
		super();
		if (!options?.nodes?.length) throw new Error("Moodenglink requires at least one node.");
		if (typeof options.send !== "function") throw new Error("Moodenglink requires a `send` function.");

		this.options = {
			shards: 1,
			clientName: "Moodenglink/1.0.0",
			autoPlay: false,
			autoMove: true,
			autoResume: false,
			defaultSearchPlatform: "youtube",
			trackPartial: [],
			...options,
		};

		if (options.searchCache) {
			const cfg = options.searchCache === true ? {} : options.searchCache;
			this.searchCache = new TTLCache(cfg.ttl ?? 30_000, cfg.maxSize ?? 100);
		} else {
			this.searchCache = null;
		}

		for (const nodeOptions of this.options.nodes) {
			const node = new (Structure.get("Node"))(this, nodeOptions);
			this.nodes.set(node.id, node);
			this.emit("nodeCreate", node);
		}
	}

	/**
	 * Registers the bot's client id and connects every node.
	 * Call this once your Discord client is ready.
	 */
	public init(clientId?: string): this {
		if (this.initialized) return this;
		if (clientId) this.options.clientId = clientId;
		if (!this.options.clientId) throw new Error("A clientId is required to initialise Moodenglink.");

		for (const node of this.nodes.values()) node.connect();
		this.initialized = true;
		this.emit("debug", `[Moodenglink] Initialised with ${this.nodes.size} node(s).`);
		return this;
	}

	/* ------------------------------- nodes ------------------------------- */

	/** Adds and connects a node at runtime. */
	public addNode(options: ManagerOptions["nodes"][number]): Node {
		const node = new (Structure.get("Node"))(this, options);
		this.nodes.set(node.id, node);
		this.emit("nodeCreate", node);
		if (this.initialized) node.connect();
		return node;
	}

	/** The best available node according to the configured sorter. */
	public get idealNode(): Node {
		const sorter = this.options.sorter ?? leastUsedNode;
		const sorted = sorter(this.nodes.filter((n) => n.connected && n.options.playback));
		const node = sorted.first();
		if (!node) throw new Error("No connected nodes are available.");
		return node;
	}

	private searchNode(): Node {
		const sorter = this.options.sorter ?? leastUsedNode;
		const candidates = this.nodes.filter((n) => n.connected && n.options.search);
		const node = sorter(candidates).first() ?? this.nodes.filter((n) => n.connected).first();
		if (!node) throw new Error("No connected nodes are available for searching.");
		return node;
	}

	/* ------------------------------ players ------------------------------ */

	/** Creates (or returns the existing) player for a guild. */
	public create(options: PlayerOptions): Player {
		const existing = this.players.get(options.guild);
		if (existing) return existing;

		const node = options.node ? this.nodes.get(options.node) : undefined;
		const player = new (Structure.get("Player"))(this, options, node?.connected ? node : this.idealNode);
		this.players.set(options.guild, player);
		this.emit("playerCreate", player);
		return player;
	}

	/** Gets an existing player. */
	public get(guild: string): Player | undefined {
		return this.players.get(guild);
	}

	/** Destroys a guild's player, if any. */
	public async destroy(guild: string): Promise<void> {
		await this.players.get(guild)?.destroy();
	}

	/* ------------------------------ searching ------------------------------ */

	/**
	 * Resolves a query into playable tracks via a node's `loadtracks` endpoint.
	 * Accepts a raw string or a `{ query, source }` object.
	 */
	public async search(query: string | SearchQuery, requester?: unknown): Promise<SearchResult> {
		const node = this.searchNode();
		const raw = typeof query === "string" ? query : query.query;
		const source = (typeof query === "string" ? undefined : query.source) ?? this.options.defaultSearchPlatform;
		const identifier = buildSearchIdentifier(raw, source as SearchPlatform);

		// Serve from cache when possible — but always stamp the current requester.
		const cached = this.searchCache?.get(identifier);
		if (cached) return { ...cached, tracks: cached.tracks.map((t) => ({ ...t, requester })) };

		const res = (await node.rest.loadTracks(identifier)) as { loadType: LoadType; data: unknown };
		const result = this.resolveLoadResult(res, requester);

		// Only cache useful, deterministic results.
		if (this.searchCache && (result.loadType === "track" || result.loadType === "search" || result.loadType === "playlist")) {
			this.searchCache.set(identifier, result);
		}
		return result;
	}

	private resolveLoadResult(res: { loadType: LoadType; data: unknown }, requester?: unknown): SearchResult {
		const result: SearchResult = { loadType: res.loadType, tracks: [], playlist: null, exception: null };
		const make = (data: TrackData) => partialTrack(buildTrack(data, requester), this.options.trackPartial ?? []);

		switch (res.loadType) {
			case "track":
				result.tracks = [make(res.data as TrackData)];
				break;
			case "search":
				result.tracks = (res.data as TrackData[]).map(make);
				break;
			case "playlist": {
				const data = res.data as { info: PlaylistInfo; tracks: TrackData[]; pluginInfo?: Record<string, unknown> };
				result.tracks = data.tracks.map(make);
				result.playlist = {
					name: data.info.name,
					selectedTrack: data.info.selectedTrack,
					duration: result.tracks.reduce((acc, t) => acc + (t.duration || 0), 0),
				};
				break;
			}
			case "error":
				result.exception = res.data as SearchResult["exception"];
				break;
			case "empty":
			default:
				break;
		}

		return result;
	}

	/** Decodes a base64 track back into a {@link Track}. */
	public async decodeTrack(encoded: string, requester?: unknown): Promise<Track> {
		const node = this.searchNode();
		const data = (await node.rest.decodeTrack(encoded)) as TrackData;
		return buildTrack(data, requester);
	}

	/* ------------------------------ autoplay ------------------------------ */

	/**
	 * @internal Queues a related track when a queue ends (best-effort).
	 * Uses the source of the finished track to seed a fresh search.
	 */
	public async handleAutoplay(player: Player, previous: Track): Promise<boolean> {
		const seed = buildAutoplaySeed(previous);
		if (!seed) return false;

		const platform = (previous.sourceName as SearchPlatform) || this.options.defaultSearchPlatform;
		const res = await this.search({ query: seed, source: platform }, previous.requester).catch(() => null);
		if (!res?.tracks.length) return false;

		// Avoid replaying anything already heard or still queued.
		const played = new Set<string>([previous.identifier, ...player.queue.previous.map((t) => t.identifier)]);
		const next = res.tracks.find((t) => !played.has(t.identifier)) ?? res.tracks.find((t) => t.identifier !== previous.identifier);
		if (!next) return false;

		player.queue.add(next);
		await player.play();
		return true;
	}

	/* ---------------------------- voice updates ---------------------------- */

	/**
	 * Feed raw Discord gateway VOICE_STATE_UPDATE / VOICE_SERVER_UPDATE packets here.
	 * Wire this to your library's raw event handler.
	 */
	public updateVoiceState(data: VoicePacket): void {
		if (!data?.t) return;

		if (data.t === "VOICE_SERVER_UPDATE") {
			const event = data.d as VoiceServer;
			const player = this.players.get(event.guild_id);
			if (!player) return;
			void player.setVoiceState(undefined, event);
			return;
		}

		if (data.t === "VOICE_STATE_UPDATE") {
			const state = data.d as VoiceState;
			if (state.user_id !== this.options.clientId) return;
			const player = this.players.get(state.guild_id);
			if (!player) return;

			if (!state.channel_id) {
				// The bot was disconnected from voice.
				void player.destroy();
				return;
			}

			player.voiceChannel = state.channel_id;
			void player.setVoiceState(state.session_id);
		}
	}

	/* ----------------------------- resilience ----------------------------- */

	/** @internal Migrates all players off a dead node onto the next best one. */
	public async handleNodeFailover(deadNode: Node): Promise<void> {
		const target = this.nodes.filter((n) => n !== deadNode && n.connected && n.options.playback).first();
		if (!target) return;

		const affected = this.players.filter((p) => p.node === deadNode);
		for (const player of affected.values()) {
			await player.moveNode(target).catch((error) => this.emit("nodeError", target, error as Error));
		}
	}

	/** @internal Restores persisted players onto a freshly-connected node. */
	public async resumePlayers(node: Node): Promise<void> {
		const store = this.options.store;
		if (!store) return;

		const keys = await Promise.resolve(store.keys());
		for (const key of keys) {
			if (!key.startsWith("moodenglink:player:")) continue;
			const raw = await Promise.resolve(store.get(key));
			if (!raw) continue;

			try {
				const data = JSON.parse(raw) as ReturnType<Player["toJSON"]>;
				if (data.node !== node.id) continue;

				const player = this.create({
					guild: data.guild as string,
					voiceChannel: (data.voiceChannel as string) ?? undefined,
					textChannel: (data.textChannel as string) ?? undefined,
					node: node.id,
					volume: data.volume as number,
				});

				player.repeatMode = data.repeatMode as Player["repeatMode"];
				player.autoplay = data.autoplay as boolean;
				if (Array.isArray(data.queue)) player.queue.add(data.queue as Track[]);
				if (data.current) player.queue.current = data.current as Track;
				if (Array.isArray(data.previous)) player.queue.previous = data.previous as Track[];

				player.connect();
				if (player.queue.current) await player.play({ track: player.queue.current });
				this.emit("debug", `[Moodenglink] Resumed player for guild ${data.guild}.`);
			} catch {
				/* ignore malformed entries */
			}
		}
	}

	/* ------------------------------ plugins ------------------------------ */

	/** Registers a plugin instance. */
	public use(plugin: Plugin): this {
		if (this.plugins.has(plugin.name)) return this;
		this.plugins.set(plugin.name, plugin);
		plugin.load(this);
		this.emit("debug", `[Moodenglink] Loaded plugin "${plugin.name}".`);
		return this;
	}

	/* -------------------------- unresolved tracks -------------------------- */

	/** Resolves an {@link UnresolvedQuery} into a playable {@link Track}. */
	public async resolve(query: UnresolvedQuery): Promise<Track | null> {
		const search = `${query.author ? `${query.author} - ` : ""}${query.title}`;
		const res = await this.search({ query: query.uri ?? search, source: query.source as SearchPlatform }, query.requester).catch(() => null);
		if (!res?.tracks.length) return null;
		return pickClosestTrack(res.tracks, query) ?? res.tracks[0];
	}

	/**
	 * Wraps a query into an {@link UnresolvedTrack} you can push straight onto a
	 * queue. It is resolved to a playable track lazily, the moment it plays —
	 * ideal for Spotify/Apple metadata that only YouTube/SoundCloud can stream.
	 */
	public buildUnresolved(query: UnresolvedQuery): UnresolvedTrack {
		const manager = this;
		const unresolved: UnresolvedTrack = {
			unresolved: true,
			title: query.title,
			author: query.author,
			duration: query.duration,
			uri: query.uri,
			sourceName: query.source,
			isrc: null,
			artworkUrl: null,
			pluginInfo: {},
			userData: {},
			requester: query.requester,
			async resolve(): Promise<Track> {
				const track = await manager.resolve(query);
				if (!track) throw new Error(`No playable match for "${query.title}".`);
				track.requester = query.requester;
				return track;
			},
		};
		return unresolved;
	}

	/** Cleanly disconnects every node and destroys every player. */
	public async destroyAll(): Promise<void> {
		for (const player of this.players.values()) await player.destroy().catch(() => null);
		for (const node of this.nodes.values()) node.destroy();
	}
}
