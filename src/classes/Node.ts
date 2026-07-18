/**
 * Represents a single Lavalink node: its WebSocket, REST client and stats.
 * @module classes/Node
 */

import WebSocket from "ws";
import type { NodeCapabilityReport, NodeCapabilityRequirements, NodeInfo, NodeOptions, NodeStats } from "../types/Node";
import { EventTypes, OpCodes } from "../types/Op";
import type { IncomingPayload, PlayerEvent, ReadyPayload } from "../types/Op";
import type { Moodenglink } from "./Moodenglink";
import { Rest } from "./Rest";

const DEFAULTS: Required<Omit<NodeOptions, "host" | "identifier">> = {
	port: 2333,
	password: "youshallnotpass",
	secure: false,
	retryAmount: 5,
	retryDelay: 5000,
	requestTimeout: 10000,
	resumeTimeout: 60,
	priority: 0,
	search: true,
	playback: true,
	capabilities: {},
};

export class Node {
	public readonly options: Required<NodeOptions>;
	public readonly rest: Rest;

	public socket: WebSocket | null = null;
	public stats: NodeStats | null = null;
	public info: NodeInfo | null = null;

	public connected = false;
	public reconnectAttempts = 0;

	private reconnectTimer: NodeJS.Timeout | null = null;
	private lastPing = 0;
	private destroyed = false;

	constructor(
		public readonly manager: Moodenglink,
		options: NodeOptions,
	) {
		this.options = {
			...DEFAULTS,
			identifier: options.identifier ?? `${options.host}:${options.port ?? DEFAULTS.port}`,
			...options,
			port: options.port ?? DEFAULTS.port,
			password: options.password ?? DEFAULTS.password,
		} as Required<NodeOptions>;

		this.rest = new Rest(this);
	}

	/** The node identifier. */
	public get id(): string {
		return this.options.identifier;
	}

	/** Last observed Discord voice ping in ms across players on this node. */
	public get ping(): number {
		return this.lastPing;
	}

	/** Total number of players currently bound to this node. */
	public get playerCount(): number {
		// Single pass, no intermediate Collection — this getter is read by the
		// load-balancing sorters on every play/search.
		let count = 0;
		for (const player of this.manager.players.values()) if (player.node === this) count++;
		return count;
	}

	/**
	 * A composite load score (lower is better) used by the load-balancing
	 * sorters. Combines player count, CPU load and dropped-frame penalties —
	 * the same heuristic Lavalink recommends and Erela.js popularised.
	 */
	public get penalties(): number {
		if (!this.connected || !this.stats) return Number.MAX_SAFE_INTEGER;

		const playerPenalty = this.stats.playingPlayers;
		const cpuPenalty = Math.pow(1.05, 100 * this.stats.cpu.systemLoad) * 10 - 10;

		let framePenalty = 0;
		if (this.stats.frameStats && this.stats.frameStats.sent > 0) {
			framePenalty += Math.pow(1.03, 500 * (this.stats.frameStats.deficit / 3000)) * 300 - 300;
			framePenalty += (Math.pow(1.03, 500 * (this.stats.frameStats.nulled / 3000)) * 300 - 300) * 2;
		}

		// Higher priority lowers the score, biasing selection towards it.
		return Math.round(playerPenalty + cpuPenalty + framePenalty) - this.options.priority;
	}

	/** Opens the WebSocket connection to the node. */
	public connect(): void {
		if (this.destroyed || this.connected || this.socket) return;

		const clientId = this.manager.options.clientId;
		if (!clientId) throw new Error("Cannot connect a node before Moodenglink.init(clientId) is called.");

		const headers: Record<string, string> = {
			Authorization: this.options.password,
			"User-Id": clientId,
			"Client-Name": this.manager.options.clientName ?? "Moodenglink",
			"Num-Shards": String(this.manager.options.shards ?? 1),
		};

		// Attempt to resume a previous session, if we have one stored.
		if (this.rest.sessionId) headers["Session-Id"] = this.rest.sessionId;

		const protocol = this.options.secure ? "wss" : "ws";
		const socket = new WebSocket(`${protocol}://${this.options.host}:${this.options.port}/v4/websocket`, { headers });
		this.socket = socket;

		socket.on("open", () => this.onOpen(socket));
		socket.on("message", (data) => this.onMessage(socket, data));
		socket.on("close", (code, reason) => this.onClose(socket, code, reason.toString()));
		socket.on("error", (error) => this.onError(socket, error));
	}

	/** Closes the connection and stops reconnecting. */
	public destroy(): void {
		if (this.destroyed) return;
		this.destroyed = true;
		if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
		this.reconnectTimer = null;

		if (this.socket) {
			this.socket.removeAllListeners();
			this.socket.close(1000, "destroy");
			this.socket = null;
		}

		this.connected = false;
		this.manager.emit("nodeDestroy", this);
		this.manager.nodes.delete(this.id);
	}

	private onOpen(socket: WebSocket): void {
		if (this.socket !== socket || this.destroyed) return;
		this.manager.emit("debug", `[Node ${this.id}] WebSocket opened.`);
	}

	private onMessage(socket: WebSocket, raw: WebSocket.RawData): void {
		if (this.socket !== socket || this.destroyed) return;
		let payload: IncomingPayload;
		try {
			payload = JSON.parse(typeof raw === "string" ? raw : raw.toString());
		} catch {
			this.manager.emit("debug", `[Node ${this.id}] Failed to parse frame.`);
			return;
		}

		this.manager.emit("nodeRaw", payload);

		// playerUpdate is by far the most frequent frame (one per active player
		// every few seconds), so keep this dispatch synchronous — only READY does
		// async I/O, and it's fire-and-forget below.
		switch (payload.op) {
			case OpCodes.PLAYER_UPDATE: {
				const player = this.manager.players.get(payload.guildId);
				if (player?.node === this) {
					this.lastPing = payload.state.ping;
					player.updateState(payload.state);
				}
				return;
			}

			case OpCodes.EVENT: {
				this.manager.emit("raw", payload as PlayerEvent);
				this.handleEvent(payload as PlayerEvent);
				return;
			}

			case OpCodes.STATS: {
				const { op, ...stats } = payload;
				this.stats = stats as NodeStats;
				this.manager.emit("nodeStats", this, this.stats);
				return;
			}

			case OpCodes.READY:
				void this.handleReady(socket, payload).catch((error) => this.manager.emit("nodeError", this, error as Error));
				return;
		}
	}

	/** Handles the one-off READY frame's async setup (session resume, info fetch). */
	private async handleReady(socket: WebSocket, payload: ReadyPayload): Promise<void> {
		if (this.socket !== socket || this.destroyed) return;
		this.connected = true;
		this.rest.sessionId = payload.sessionId;

		// Enable session resuming on the node side.
		await this.rest.updateSession(true, this.options.resumeTimeout).catch((error) => {
			this.manager.emit("nodeError", this, error as Error);
			return null;
		});
		this.info = await this.rest.getInfo().catch((error) => {
			this.manager.emit("nodeError", this, error as Error);
			return null;
		});
		if (this.socket !== socket || this.destroyed || socket.readyState !== WebSocket.OPEN) return;

		const report = this.validateCapabilities();
		if (!report.valid) {
			const error = new NodeCapabilityError(this.id, report);
			this.manager.emit("nodeCapabilityMismatch", this, report);
			this.manager.emit("nodeError", this, error);
			if (this.options.capabilities.strict) {
				await this.manager.handleNodeFailover(this);
				this.destroy();
				return;
			}
		}

		// A socket opening is not enough to prove recovery. Reset only after the
		// full READY/session/info handshake succeeds.
		this.reconnectAttempts = 0;

		this.manager.emit("nodeConnect", this);
		this.manager.emit("debug", `[Node ${this.id}] Ready (session=${payload.sessionId}, resumed=${payload.resumed}).`);

		// Only restore from the store on a *cold* session. When `resumed` is true the
		// node kept our previous session alive and is still playing, so replaying
		// from the persisted position would restart/jump every live track.
		// After a full process restart local players are empty — sync them from the
		// live Lavalink session (connect only, no play/seek).
		if (this.manager.options.autoResume) {
			if (payload.resumed) {
				await this.manager.syncResumedPlayers(this).catch(() => null);
			} else {
				await this.manager.resumePlayers(this, true).catch(() => null);
			}
		}
	}

	private handleEvent(payload: PlayerEvent): void {
		const player = this.manager.players.get(payload.guildId);
		if (!player || player.node !== this) return;

		switch (payload.type) {
			case EventTypes.TrackStartEvent:
				player.handleTrackStart(payload);
				break;
			case EventTypes.TrackEndEvent:
				// Async: never let a rejected advance/repeat become an unhandled rejection.
				void player.handleTrackEnd(payload).catch((error) => this.manager.emit("nodeError", this, error as Error));
				break;
			case EventTypes.TrackStuckEvent:
				player.handleTrackStuck(payload);
				break;
			case EventTypes.TrackExceptionEvent:
				player.handleTrackException(payload);
				break;
			case EventTypes.WebSocketClosedEvent:
				void player.handleSocketClosed(payload).catch((error) => this.manager.emit("nodeError", this, error as Error));
				break;
			case EventTypes.LyricsFoundEvent:
				this.manager.emit("lyricsFound", player, payload.lyrics, payload);
				break;
			case EventTypes.LyricsNotFoundEvent:
				this.manager.emit("lyricsNotFound", player, payload);
				break;
			case EventTypes.LyricsLineEvent:
				this.manager.emit("lyricsLine", player, payload.line, payload);
				break;
			case EventTypes.SegmentsLoaded:
				this.manager.emit("segmentsLoaded", player, payload.segments, payload);
				break;
			case EventTypes.SegmentSkipped:
				this.manager.emit("segmentSkipped", player, payload.segment, payload);
				break;
			case EventTypes.ChaptersLoaded:
				this.manager.emit("chaptersLoaded", player, payload.chapters, payload);
				break;
			case EventTypes.ChapterStarted:
				this.manager.emit("chapterStarted", player, payload.chapter, payload);
				break;
		}
	}

	private onClose(socket: WebSocket, code: number, reason: string): void {
		if (this.socket !== socket || this.destroyed) return;
		this.connected = false;
		this.socket = null;
		this.manager.emit("nodeDisconnect", this, { code, reason });
		this.manager.emit("debug", `[Node ${this.id}] Closed (code=${code}, reason=${reason || "none"}).`);

		// A remote can close cleanly (1000) while the node is still unavailable.
		// Only an explicit destroy is terminal; every unexpected close reconnects.
		this.reconnect();
	}

	private onError(socket: WebSocket, error: Error): void {
		if (this.socket !== socket || this.destroyed) return;
		this.manager.emit("nodeError", this, error);
	}

	private reconnect(): void {
		if (this.destroyed || this.reconnectTimer) return;
		if (this.reconnectAttempts >= this.options.retryAmount) {
			this.manager.emit("nodeError", this, new Error(`Ran out of reconnect attempts (${this.options.retryAmount}).`));
			void this.manager.handleNodeFailover(this).finally(() => this.destroy());
			return;
		}

		// Incremental backoff (capped) so a node that stays down isn't hammered
		// once per fixed interval — the delay grows with each failed attempt.
		const delay = Math.min(this.options.retryDelay * (this.reconnectAttempts + 1), 60_000);
		this.reconnectTimer = setTimeout(() => {
			this.reconnectTimer = null;
			if (this.destroyed) return;
			this.reconnectAttempts++;
			this.manager.emit("nodeReconnect", this);
			this.manager.emit("debug", `[Node ${this.id}] Reconnecting (attempt ${this.reconnectAttempts}/${this.options.retryAmount}).`);
			this.connect();
		}, delay);
	}

	/** Whether the node advertises a source manager (case-insensitive). */
	public supportsSource(source: string): boolean {
		return Array.isArray(this.info?.sourceManagers)
			? this.info.sourceManagers.some((value) => typeof value === "string" && value.toLowerCase() === source.toLowerCase())
			: false;
	}

	/** Whether the node advertises a Lavalink filter (case-insensitive). */
	public supportsFilter(filter: string): boolean {
		return Array.isArray(this.info?.filters)
			? this.info.filters.some((value) => typeof value === "string" && value.toLowerCase() === filter.toLowerCase())
			: false;
	}

	/** Whether the node advertises an installed plugin (case-insensitive). */
	public hasPlugin(plugin: string): boolean {
		return Array.isArray(this.info?.plugins)
			? this.info.plugins.some((value) => typeof value?.name === "string" && value.name.toLowerCase() === plugin.toLowerCase())
			: false;
	}

	/** Validates advertised `/info` capabilities without mutating the node. */
	public validateCapabilities(requirements: NodeCapabilityRequirements = this.options.capabilities): NodeCapabilityReport {
		const sources = requirements.sources ?? [];
		const filters = requirements.filters ?? [];
		const plugins = requirements.plugins ?? [];
		const missingSources = sources.filter((value) => !this.supportsSource(value));
		const missingFilters = filters.filter((value) => !this.supportsFilter(value));
		const missingPlugins = plugins.filter((value) => !this.hasPlugin(value));
		return {
			available: this.info !== null,
			valid:
				(this.info !== null || sources.length + filters.length + plugins.length === 0) &&
				missingSources.length === 0 &&
				missingFilters.length === 0 &&
				missingPlugins.length === 0,
			missingSources,
			missingFilters,
			missingPlugins,
		};
	}
}

/** A node failed its configured source/filter/plugin requirements. */
export class NodeCapabilityError extends Error {
	constructor(
		public readonly nodeId: string,
		public readonly report: NodeCapabilityReport,
	) {
		super(
			`Node "${nodeId}" is missing required capabilities: ` +
				[
					report.missingSources.length ? `sources=${report.missingSources.join(",")}` : "",
					report.missingFilters.length ? `filters=${report.missingFilters.join(",")}` : "",
					report.missingPlugins.length ? `plugins=${report.missingPlugins.join(",")}` : "",
					!report.available ? "node info unavailable" : "",
				]
					.filter(Boolean)
					.join("; "),
		);
		this.name = "NodeCapabilityError";
	}
}
