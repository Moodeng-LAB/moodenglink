/**
 * A guild-scoped music player: voice connection, queue control and playback.
 * @module classes/Player
 */

import type {
	TrackEndEvent,
	TrackExceptionEvent,
	TrackStartEvent,
	TrackStuckEvent,
	WebSocketClosedEvent,
	PlayerState,
	SponsorBlockCategory,
} from "../types/Op";
import type { PlayerDestroyOptions, PlayerOptions, QueueItem, State, Track, UnresolvedTrack, VoiceServer } from "../types/Player";
import { RepeatMode } from "../types/Player";
import type { LavalinkPlayer, UpdatePlayerBody } from "../types/Rest";
import { buildTrack, clamp, isUnresolvedTrack, sleep } from "../utils/utils";
import type { Filters } from "./Filters";
import type { Moodenglink } from "./Moodenglink";
import type { Node } from "./Node";
import type { Queue } from "./Queue";
import { Structure } from "./Structure";

export interface PlayOptions {
	/** A specific track to play instead of pulling from the queue. */
	track?: QueueItem;
	/** Start position in ms. */
	startTime?: number;
	/** End position in ms. */
	endTime?: number;
	/** When true, does not replace the currently playing track. */
	noReplace?: boolean;
	/** Pause immediately after starting. */
	paused?: boolean;
}

export class Player {
	public readonly manager: Moodenglink;
	public node: Node;

	public readonly guild: string;
	public voiceChannel: string | null;
	public textChannel: string | null;

	public readonly queue: Queue;
	public readonly filters: Filters;

	public volume: number;
	public ping = 0;
	public timestamp = 0;

	/** Last position reported by the node, and the wall-clock time we received it. */
	private _position = 0;
	private _positionUpdatedAt = 0;

	/**
	 * The current playback position in ms. Lavalink only pushes a fresh position
	 * every few seconds, so while a track is actively playing this interpolates
	 * from the last report using elapsed wall-clock time (clamped to the track
	 * duration) — giving an accurate value for progress bars between updates.
	 */
	public get position(): number {
		// Fall back to the raw value when paused, stopped, or before the first report
		// (a stale `_positionUpdatedAt` of 0 would otherwise add the whole epoch).
		if (!this.playing || this.paused || this._positionUpdatedAt === 0) return this._position;
		const live = this._position + (Date.now() - this._positionUpdatedAt);
		const duration = this.current?.duration ?? 0;
		return duration > 0 ? Math.min(live, duration) : live;
	}

	public set position(value: number) {
		this._position = value;
		this._positionUpdatedAt = Date.now();
	}

	public playing = false;
	public paused = false;
	public connected = false;
	public state: State = "DISCONNECTED";
	public repeatMode: RepeatMode = RepeatMode.NONE;
	public autoplay = false;

	public readonly selfMute: boolean;
	public readonly selfDeafen: boolean;
	public readonly data: Record<string, unknown>;

	/** Raw Discord voice state/server used to hand off to Lavalink. */
	public voiceState: { sessionId?: string; event?: VoiceServer } = {};

	/** How many consecutive voice reconnects have been attempted (reset on connect). */
	private voiceReconnectAttempts = 0;

	/** Guards against overlapping autoplay lookups when a queue drains rapidly. */
	private autoplaying = false;

	/**
	 * Why the current track is about to end, when we caused it. Lavalink reports
	 * both a manual `stop()` and a `skip()` as reason `"stopped"`, so we record the
	 * intent here to tell them apart: a stop ends playback cleanly (no repeat, no
	 * autoplay), a skip advances to the next track. Cleared as soon as it's read.
	 */
	private endIntent: { type: "stop" | "skip"; encoded: string | null } | null = null;

	/** Makes destroy idempotent when voice, queue and user cleanup race. */
	private destroyPromise: Promise<void> | null = null;

	/** Serialises persistence writes so an older snapshot cannot win a race. */
	private saveChain: Promise<void> = Promise.resolve();

	/** Prevents concurrent unresolved-track consumers from shifting the queue twice. */
	private playChain: Promise<void> = Promise.resolve();

	/** Coalesces bursts of recoverable voice-close events into one reconnect. */
	private voiceReconnectPending = false;
	private lastPositionSaveAt = 0;

	constructor(manager: Moodenglink, options: PlayerOptions, node: Node) {
		this.manager = manager;
		this.node = node;
		this.guild = options.guild;
		this.voiceChannel = options.voiceChannel ?? null;
		this.textChannel = options.textChannel ?? null;
		this.volume = clamp(options.volume ?? 100, 0, 1000);
		this.selfMute = options.selfMute ?? false;
		this.selfDeafen = options.selfDeafen ?? true;
		this.data = options.data ?? {};
		this.queue = new (Structure.get("Queue"))();
		this.filters = new (Structure.get("Filters"))(this);
	}

	/** The track currently playing, if any. */
	public get current(): Track | null {
		return this.queue.current;
	}

	/* ------------------------------ connection ------------------------------ */

	/** Joins the configured voice channel via the Discord gateway. */
	public connect(): this {
		if (this.state === "DESTROYING") throw new Error(`Player "${this.guild}" is being destroyed.`);
		if (!this.voiceChannel) throw new Error(`Player "${this.guild}" has no voice channel set.`);

		// Stay "CONNECTING" until Lavalink reports a live voice connection via the
		// first playerUpdate — marking `connected`/"CONNECTED" here would be an
		// optimistic guess (Discord hasn't confirmed the voice server yet) and
		// leaves the flag stuck `true` if the handshake never completes.
		const previousState = this.state;
		this.state = "CONNECTING";
		try {
			this.manager.options.send(this.guild, {
				op: 4,
				d: {
					guild_id: this.guild,
					channel_id: this.voiceChannel,
					self_mute: this.selfMute,
					self_deaf: this.selfDeafen,
				},
			});
		} catch (error) {
			this.state = previousState;
			throw error;
		}
		return this;
	}

	/** Leaves the voice channel but keeps the player and queue alive. */
	public disconnect(): this {
		const previous = this.voiceChannel;
		const previousState = this.state;
		const destroying = previousState === "DESTROYING";
		if (!destroying) this.state = "DISCONNECTING";
		try {
			this.manager.options.send(this.guild, {
				op: 4,
				d: { guild_id: this.guild, channel_id: null, self_mute: false, self_deaf: false },
			});
		} catch (error) {
			this.state = previousState;
			throw error;
		}
		this.voiceChannel = null;
		this.connected = false;
		if (!destroying) this.state = "DISCONNECTED";
		this.manager.emit("playerDisconnect", this, previous);
		return this;
	}

	/** @internal Applies a Discord-side disconnect without sending another OP 4. */
	public handleVoiceDisconnect(): void {
		const previous = this.voiceChannel;
		const destroying = this.state === "DESTROYING";
		this.voiceChannel = null;
		this.connected = false;
		if (!destroying) this.state = "DISCONNECTED";
		this.manager.emit("playerDisconnect", this, previous);
	}

	/** Moves the player to another voice channel. */
	public setVoiceChannel(channelId: string): this {
		this.voiceChannel = channelId;
		this.connect();
		return this;
	}

	/** Rebinds the text channel used for informational events. */
	public setTextChannel(channelId: string): this {
		this.textChannel = channelId;
		return this;
	}

	/** Moves this player (and its playback state) to another node. */
	public async moveNode(node: Node): Promise<this> {
		if (node === this.node) return this;
		const oldNode = this.node;
		this.state = "MOVING";

		await oldNode.rest.destroyPlayer(this.guild).catch(() => null);
		this.node = node;
		await this.restoreNodeState();

		this.state = "CONNECTED";
		this.manager.emit("playerMove", this, oldNode, node);
		await this.save();
		return this;
	}

	/** @internal Recreates this player's voice and playback state on its node. */
	public async restoreNodeState(): Promise<void> {
		await this.sendVoiceUpdate();
		if (!this.current) return;
		await this.node.rest.updatePlayer(this.guild, {
			track: { encoded: this.current.encoded },
			position: this.position,
			volume: this.volume,
			paused: this.paused,
			filters: this.filters.toJSON(),
		});
	}

	/* ------------------------------- playback ------------------------------- */

	/** Starts playback. With no options, plays the next queued track. */
	public play(options: PlayOptions = {}): Promise<this> {
		const operation = this.playChain.then(
			() => this.performPlay(options),
			() => this.performPlay(options),
		);
		this.playChain = operation.then(
			() => undefined,
			() => undefined,
		);
		return operation;
	}

	private async performPlay(options: PlayOptions): Promise<this> {
		if (this.state === "DESTROYING" || this.manager.players.get(this.guild) !== this) {
			throw new Error(`Player "${this.guild}" is being destroyed.`);
		}
		let track: Track | null = null;
		let dequeued: QueueItem | null = null;
		const previous = this.queue.current;

		if (options.track) {
			track = isUnresolvedTrack(options.track) ? await this.resolveUnresolved(options.track) : options.track;
		} else {
			// Pull items until one resolves to a playable track.
			while (this.queue.length && !track) {
				const item = this.queue.shift()!;
				track = isUnresolvedTrack(item) ? await this.resolveUnresolved(item) : item;
				if (track) dequeued = item;
			}
		}

		if (!track) throw new Error("Queue is empty — nothing to play.");

		const body: UpdatePlayerBody = {
			track: { encoded: track.encoded, userData: track.userData ?? {} },
			volume: this.volume,
			filters: this.filters.toJSON(),
		};
		if (options.startTime !== undefined) body.position = options.startTime;
		if (options.endTime !== undefined) body.endTime = options.endTime;
		if (options.paused !== undefined) body.paused = options.paused;

		let response: LavalinkPlayer;
		try {
			response = await this.node.rest.updatePlayer(this.guild, body, options.noReplace ?? false);
		} catch (error) {
			if (dequeued) this.queue.unshift(dequeued);
			this.queue.current = previous;
			throw error;
		}
		if ((this.state as State) === "DESTROYING" || this.manager.players.get(this.guild) !== this) return this;

		// Lavalink leaves the existing track untouched when noReplace is true.
		// Keep the dequeued item and client state intact in that case.
		if (options.noReplace && response?.track?.encoded && response.track.encoded !== track.encoded) {
			if (dequeued) this.queue.unshift(dequeued);
			return this;
		}

		this.queue.current = track;
		this.playing = true;
		this.paused = options.paused ?? false;
		this.position = options.startTime ?? 0;
		await this.save();
		return this;
	}

	/** @internal Resolves an unresolved queue item, swallowing failures (returns null). */
	private async resolveUnresolved(item: UnresolvedTrack): Promise<Track | null> {
		try {
			return await item.resolve();
		} catch (error) {
			this.manager.emit("debug", `[Player ${this.guild}] Failed to resolve "${item.title}": ${(error as Error).message}`);
			return null;
		}
	}

	/** Stops the current track. Pass `false` to keep the queue intact. */
	public async stop(clearQueue = true): Promise<this> {
		const cleared = clearQueue ? [...this.queue] : [];
		if (clearQueue) this.queue.clear();
		// Signal intent before the null-track update so the resulting trackEnd
		// ("stopped") ends playback cleanly instead of repeating/autoplaying.
		this.endIntent = { type: "stop", encoded: this.current?.encoded ?? null };
		try {
			await this.node.rest.updatePlayer(this.guild, { track: { encoded: null } });
		} catch (error) {
			this.endIntent = null;
			if (cleared.length) this.queue.unshift(...cleared);
			throw error;
		}
		this.playing = false;
		this.queue.current = null;
		await this.save();
		return this;
	}

	/** Skips `amount` tracks (default 1). */
	public async skip(amount = 1): Promise<this> {
		if (!Number.isInteger(amount) || amount < 1) throw new RangeError("Amount must be a positive integer.");
		if (amount > 1) this.queue.splice(0, amount - 1);

		// Prefer replacing the current track with the next one. Lavalink emits
		// TrackEnd reason "replaced" (ignored by the state machine), so advancement
		// does not depend on matching encoded strings — critical for LavaSrc/Spotify
		// where the TrackEnd payload encoded can differ from the client's copy.
		if (this.queue.length > 0) {
			if (this.current) this.recordPrevious(this.current);
			this.endIntent = null;
			return this.play();
		}

		// Nothing left to play — null the track and let TrackEnd advance/cleanup.
		this.endIntent = { type: "skip", encoded: this.current?.encoded ?? null };
		try {
			await this.node.rest.updatePlayer(this.guild, { track: { encoded: null } });
		} catch (error) {
			this.endIntent = null;
			throw error;
		}
		return this;
	}

	/** Skips backwards to the previously played track. */
	public async previous(): Promise<this> {
		const prev = this.queue.previous.shift();
		if (!prev) throw new Error("No previous track to play.");
		if (this.current) this.queue.unshift(this.current);
		return this.play({ track: prev });
	}

	public async pause(state = true): Promise<this> {
		// Freeze the interpolated position at the instant of pausing, so it doesn't
		// revert to the last (older) node report while paused.
		if (state) this.position = this.position;
		await this.node.rest.updatePlayer(this.guild, { paused: state });
		this.paused = state;
		this.playing = !state && this.current !== null;
		await this.save();
		return this;
	}

	public resume(): Promise<this> {
		return this.pause(false);
	}

	/** Seeks to `position` ms within the current track. */
	public async seek(position: number): Promise<this> {
		if (!this.current) throw new Error("Nothing is playing.");
		if (!this.current.isSeekable) throw new Error("The current track is not seekable.");
		const target = clamp(position, 0, this.current.duration);
		await this.node.rest.updatePlayer(this.guild, { position: target });
		this.position = target;
		await this.save();
		return this;
	}

	/** Sets the volume (0-1000). */
	public async setVolume(volume: number): Promise<this> {
		const next = clamp(volume, 0, 1000);
		await this.node.rest.updatePlayer(this.guild, { volume: next });
		this.volume = next;
		this.filters.volume = next / 100;
		await this.save();
		return this;
	}

	/** Sets the repeat mode (`NONE`, `TRACK`, `QUEUE`). */
	public setRepeatMode(mode: RepeatMode): this {
		this.repeatMode = mode;
		void this.save();
		return this;
	}

	/** Toggles autoplay of related tracks when the queue empties. */
	public setAutoplay(state: boolean): this {
		this.autoplay = state;
		void this.save();
		return this;
	}

	/**
	 * Destroys the player and emits a machine-readable reason.
	 * A boolean argument remains supported for backwards compatibility.
	 */
	public destroy(options: boolean | PlayerDestroyOptions = {}): Promise<void> {
		if (this.destroyPromise) return this.destroyPromise;
		const normalized: PlayerDestroyOptions = typeof options === "boolean" ? { disconnect: options } : options;
		const disconnect = normalized.disconnect ?? true;
		const reason = normalized.reason ?? "manual";

		this.destroyPromise = (async () => {
			this.state = "DESTROYING";
			if (disconnect) {
				try {
					this.disconnect();
				} catch (error) {
					this.manager.emit("debug", `[Player ${this.guild}] Voice disconnect send failed during destroy: ${(error as Error).message}`);
					this.handleVoiceDisconnect();
				}
			}
			this.state = "DESTROYING";
			await this.playChain;
			await this.node.rest.destroyPlayer(this.guild).catch(() => null);
			if (this.manager.options.store) {
				await this.saveChain;
				const key = `moodenglink:player:${this.guild}`;
				await Promise.resolve(this.manager.options.store.delete(key)).catch((error) => {
					this.manager.emit("storeError", error as Error, "delete", key);
				});
			}
			if (this.manager.players.get(this.guild) === this) this.manager.players.delete(this.guild);
			this.manager.emit("playerDestroy", this, { reason, disconnected: disconnect });
		})();
		return this.destroyPromise;
	}

	/* ------------------------------ user data ------------------------------ */

	/** Stores an arbitrary value on the player. Chainable. */
	public set<T = unknown>(key: string, value: T): this {
		this.data[key] = value;
		void this.save();
		return this;
	}

	/** Reads a previously-stored value from the player. */
	public get<T = unknown>(key: string): T | undefined {
		return this.data[key] as T | undefined;
	}

	/* ------------------------- lyrics (LavaLyrics) ------------------------- */

	/** Fetches lyrics for the currently-playing track (requires the LavaLyrics plugin). */
	public getLyrics(skipTrackSource = false) {
		return this.node.rest.getLyrics(this.guild, skipTrackSource);
	}

	/** Subscribes to live, line-by-line lyrics — listen on the `lyricsLine` event. */
	public subscribeLyrics() {
		return this.node.rest.subscribeLyrics(this.guild);
	}

	/** Cancels a live lyrics subscription. */
	public unsubscribeLyrics() {
		return this.node.rest.unsubscribeLyrics(this.guild);
	}

	/* ----------------------- SponsorBlock (plugin) ----------------------- */

	/** Sets the SponsorBlock categories to skip — listen on `segmentSkipped`. */
	public setSponsorBlock(categories: SponsorBlockCategory[]) {
		return this.node.rest.setSponsorBlockCategories(this.guild, categories);
	}

	/** Gets the SponsorBlock categories currently enabled for this player. */
	public getSponsorBlock() {
		return this.node.rest.getSponsorBlockCategories(this.guild);
	}

	/** Disables SponsorBlock skipping for this player. */
	public clearSponsorBlock() {
		return this.node.rest.clearSponsorBlockCategories(this.guild);
	}

	/* ---------------------------- voice handling ---------------------------- */

	/** @internal Feeds a raw Discord VOICE_STATE_UPDATE / VOICE_SERVER_UPDATE. */
	public async setVoiceState(sessionId?: string, event?: VoiceServer): Promise<void> {
		if (sessionId) this.voiceState.sessionId = sessionId;
		if (event) this.voiceState.event = event;

		if (this.voiceState.sessionId && this.voiceState.event) {
			await this.sendVoiceUpdate();
		}
	}

	private async sendVoiceUpdate(): Promise<void> {
		const { sessionId, event } = this.voiceState;
		// Discord's first VOICE_SERVER_UPDATE can carry a null endpoint, and the
		// two voice packets arrive in any order — only send once every field is
		// present, otherwise the node rejects the update with a 400.
		if (!event?.token || !event.endpoint || !sessionId || !this.voiceChannel) return;
		await this.node.rest.updatePlayer(this.guild, {
			voice: {
				token: event.token,
				endpoint: event.endpoint,
				sessionId,
				channelId: this.voiceChannel,
			},
		});
	}

	/* --------------------------- internal (Node) --------------------------- */

	/** @internal */
	public updateState(state: PlayerState): void {
		this.position = state.position;
		this.connected = state.connected;
		this.ping = state.ping;
		this.timestamp = state.time;
		// A healthy voice connection clears the reconnect counter and promotes the
		// player out of its pending states — this is the authoritative signal that
		// the voice handshake actually completed.
		if (state.connected) {
			this.voiceReconnectAttempts = 0;
			if (this.state === "RESUMING" || this.state === "CONNECTING") this.state = "CONNECTED";
		}
		this.manager.emit("playerStateUpdate", this);
		const interval = this.manager.options.positionSaveInterval ?? 15_000;
		if (this.manager.options.store && interval !== false && Date.now() - this.lastPositionSaveAt >= Math.max(0, interval)) {
			this.lastPositionSaveAt = Date.now();
			void this.save();
		}
	}

	/** @internal */
	public handleTrackStart(payload: TrackStartEvent): void {
		// A fresh TrackStart means any pending stop/skip that never produced a
		// TrackEnd is obsolete (e.g. stop() while idle, then a new play()).
		this.endIntent = null;
		this.playing = !this.paused;
		const track = this.current ?? buildTrack(payload.track);
		this.manager.emit("trackStart", this, track, payload);
	}

	/** @internal */
	public async handleTrackEnd(payload: TrackEndEvent): Promise<void> {
		const track = this.current ?? buildTrack(payload.track);

		// Consume endIntent without requiring payload.encoded === client encoded.
		// LavaSrc/Spotify can rewrite the encoded string on TrackEnd; requiring
		// equality caused skip() to silently stop with tracks still queued.
		// Stale intents (we already moved on to a different current) are dropped.
		const pending = this.endIntent;
		let intent: "stop" | "skip" | null = null;
		if (pending) {
			const stillOwned = this.current === null || pending.encoded === null || this.current.encoded === pending.encoded;
			this.endIntent = null;
			if (stillOwned) intent = pending.type;
		}

		this.manager.emit("trackEnd", this, track, payload, { intent });

		// A track that was replaced by another, or cleaned up as the player is torn
		// down, must never continue the queue.
		if (payload.reason === "replaced" || payload.reason === "cleanup") return;

		// Orphan / delayed events: if we already moved on to a different current
		// track and this end was not our stop/skip, ignore it.
		if (!intent && this.current && this.current.encoded !== payload.track.encoded) return;

		// A stopped event only advances when it belongs to an explicit skip.
		// Delayed/orphan stopped events must never kill a newly-started track.
		if (payload.reason === "stopped" && intent === null) return;

		// An explicit stop() ends playback cleanly — no repeat, no advance, no
		// autoplay — regardless of repeat mode. The stopped track still joins the
		// history so `previous()` can reach it.
		if (intent === "stop") {
			this.recordPrevious(track);
			this.playing = false;
			this.queue.current = null;
			await this.save();
			// Only signal queueEnd when nothing is left to play (stop(false) may keep a queue).
			if (this.queue.length === 0) this.manager.emit("queueEnd", this, track, payload);
			return;
		}

		// Repeat applies only to a track that finished on its own — never to a
		// manual skip or a load failure (which should move on to the next track).
		const naturalEnd = payload.reason === "finished" && intent !== "skip";
		if (naturalEnd && track) {
			if (this.repeatMode === RepeatMode.TRACK) {
				return void this.play({ track }).catch((error) => this.manager.emit("nodeError", this.node, error as Error));
			}
			if (this.repeatMode === RepeatMode.QUEUE) this.queue.push(track);
		}

		await this.advance(track, payload, naturalEnd);
	}

	/** Pushes a just-finished track onto the front of the history, capped at 50. */
	private recordPrevious(track: Track | null): void {
		if (!track) return;
		this.queue.previous.unshift(track);
		if (this.queue.previous.length > 50) this.queue.previous.length = 50;
	}

	private async advance(previous: Track | null, payload: TrackEndEvent, naturalEnd: boolean): Promise<void> {
		if ((this.state as State) === "DESTROYING" || this.manager.players.get(this.guild) !== this) return;
		this.recordPrevious(previous);

		if (this.queue.length > 0) {
			await this.play().catch((error) => this.manager.emit("nodeError", this.node, error as Error));
			return;
		}

		// Autoplay a related track only when the queue drained on a natural finish —
		// never continue after a manual skip. The guard stops a burst of rapid
		// track-end events from firing several overlapping lookups.
		if (naturalEnd && (this.autoplay || this.manager.options.autoPlay) && previous && !this.autoplaying) {
			this.autoplaying = true;
			try {
				const queued = await this.manager.handleAutoplay(this, previous).catch((error) => {
					this.manager.emit("nodeError", this.node, error as Error);
					return false;
				});
				if (queued) return;
			} finally {
				this.autoplaying = false;
			}
		}
		if ((this.state as State) === "DESTROYING" || this.manager.players.get(this.guild) !== this) return;
		// A failed node update may have rolled an autoplay candidate back into
		// the queue. It is not an empty queue and must not trigger cleanup.
		if (this.queue.length > 0) {
			this.playing = false;
			this.queue.current = null;
			await this.save();
			return;
		}

		this.playing = false;
		this.queue.current = null;
		await this.save();
		this.manager.emit("queueEnd", this, previous, payload);
		if (this.manager.options.playerBehavior?.destroyOnQueueEnd) {
			await this.destroy({ reason: "queue-end" });
		}
	}

	/** @internal */
	public handleTrackStuck(payload: TrackStuckEvent): void {
		const track = this.current ?? buildTrack(payload.track);
		this.manager.emit("trackStuck", this, track, payload);
		this.autoSkipPlaybackError();
	}

	/** @internal */
	public handleTrackException(payload: TrackExceptionEvent): void {
		const track = this.current ?? buildTrack(payload.track);
		this.manager.emit("trackError", this, track, payload);
	}

	private autoSkipPlaybackError(): void {
		if (!this.manager.options.playerBehavior?.autoSkipOnError || !this.playing || this.endIntent) return;
		void this.skip().catch((error) => this.manager.emit("nodeError", this.node, error as Error));
	}

	/**
	 * Voice close codes worth recovering from — session invalidations, timeouts,
	 * voice-server crashes and abnormal drops. Fatal ones (4004 auth failed,
	 * 4011/4012 unknown, etc.) are left alone.
	 */
	private static readonly RECOVERABLE_VOICE_CLOSE = new Set([4006, 4009, 4014, 4015, 1006]);

	/** @internal */
	public async handleSocketClosed(payload: WebSocketClosedEvent): Promise<void> {
		this.manager.emit("socketClosed", this, payload);

		// Never fight an intentional teardown, and only recover a real channel.
		if (this.state === "DESTROYING" || this.state === "DISCONNECTING" || !this.voiceChannel || this.voiceReconnectPending) return;
		if (!Player.RECOVERABLE_VOICE_CLOSE.has(payload.code)) return;

		const maxTries = this.manager.options.voiceReconnectTries ?? 3;
		if (this.voiceReconnectAttempts >= maxTries) {
			this.manager.emit("debug", `[Player ${this.guild}] Gave up voice reconnect after ${maxTries} tries (close ${payload.code}).`);
			this.voiceReconnectAttempts = 0;
			return;
		}

		this.voiceReconnectAttempts++;
		// Session invalidation (4006) and timeout (4009) after a process restart need
		// an immediate OP4 rebind — waiting feels like a stutter. Other recoverable
		// closes keep the configured backoff. Never leave→join (null then channel);
		// connect() re-sends the same channel_id only.
		const baseDelay = this.manager.options.voiceReconnectDelay ?? 1000;
		const immediate = payload.code === 4006 || payload.code === 4009;
		const delay = immediate ? 0 : baseDelay * this.voiceReconnectAttempts;
		this.state = "RESUMING";
		this.manager.emit(
			"debug",
			`[Player ${this.guild}] Voice closed (${payload.code}); reconnect ${this.voiceReconnectAttempts}/${maxTries}${delay ? ` in ${delay}ms` : " immediately"}.`,
		);

		this.voiceReconnectPending = true;
		try {
			await sleep(delay);
			// The player may have been destroyed or disconnected while we waited.
			if (!this.voiceChannel || (this.state as State) === "DESTROYING") return;

			// Re-join: Discord replies with fresh voice server/state which we forward,
			// re-establishing the connection (and handing the node a new session).
			this.connect();
		} catch (error) {
			this.manager.emit("nodeError", this.node, error as Error);
		} finally {
			this.voiceReconnectPending = false;
		}
	}

	/* ---------------------------- persistence ---------------------------- */

	/** Serialises the resumable state of this player. */
	public toJSON(): Record<string, unknown> {
		return {
			guild: this.guild,
			voiceChannel: this.voiceChannel,
			textChannel: this.textChannel,
			node: this.node.id,
			volume: this.volume,
			position: this.position,
			paused: this.paused,
			repeatMode: this.repeatMode,
			autoplay: this.autoplay,
			current: this.current,
			queue: [...this.queue],
			previous: this.queue.previous,
			filters: this.filters.toJSON(),
			voiceState: this.voiceState,
			data: this.data,
		};
	}

	/** @internal Persists this player to the configured store, if any. */
	public async save(): Promise<void> {
		const store = this.manager.options.store;
		if (!store || this.state === "DESTROYING") return;
		const key = `moodenglink:player:${this.guild}`;
		const snapshot = JSON.stringify(this.toJSON());
		this.saveChain = this.saveChain.then(async () => {
			await Promise.resolve(store.set(key, snapshot)).catch((error) => {
				this.manager.emit("storeError", error as Error, "set", key);
			});
		});
		await this.saveChain;
	}
}
