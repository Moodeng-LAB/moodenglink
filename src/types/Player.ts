/**
 * Types for players, tracks, search results and voice payloads.
 * @module types/Player
 */

/** Lifecycle state of a {@link Player}. */
export type State = "CONNECTED" | "CONNECTING" | "DISCONNECTED" | "DISCONNECTING" | "DESTROYING" | "MOVING" | "RESUMING";

/** Repeat behaviour of the player queue. */
export enum RepeatMode {
	NONE = 0,
	TRACK = 1,
	QUEUE = 2,
}

/** Stable machine-readable reason attached to the `playerDestroy` event. */
export type PlayerDestroyReason = "manual" | "manager" | "voice-disconnect" | "queue-end" | "shutdown" | "node-unavailable";

/** Options for {@link Player.destroy}. Passing a boolean remains supported for v1 compatibility. */
export interface PlayerDestroyOptions {
	/** Leave Discord voice before removing the player. Defaults to `true`. */
	disconnect?: boolean;
	/** Why the player is being removed. Defaults to `"manual"`. */
	reason?: PlayerDestroyReason;
}

/** Metadata emitted with `playerDestroy`. */
export interface PlayerDestroyContext {
	reason: PlayerDestroyReason;
	disconnected: boolean;
}

/**
 * Why Moodenglink ended the current track, when we caused it.
 * Lavalink reports both `stop()` and `skip()` as TrackEnd reason `"stopped"`.
 */
export type TrackEndIntent = "stop" | "skip" | null;

/** Extra context on `trackEnd` so bots can log skip vs stop correctly. */
export interface TrackEndContext {
	intent: TrackEndIntent;
}

export interface PlayerOptions {
	/** The guild the player belongs to. */
	guild: string;
	/** The text channel used for now-playing messages (optional, informational). */
	textChannel?: string;
	/** The voice channel to join. */
	voiceChannel?: string;
	/** A specific node identifier to bind the player to. */
	node?: string;
	/** Initial volume (0-1000). Defaults to `100`. */
	volume?: number;
	/** Whether to join self-muted. */
	selfMute?: boolean;
	/** Whether to join self-deafened. Defaults to `true`. */
	selfDeafen?: boolean;
	/** Arbitrary user data stored on the player. */
	data?: Record<string, unknown>;
}

/** Raw track info exactly as returned by Lavalink. */
export interface TrackInfo {
	identifier: string;
	isSeekable: boolean;
	author: string;
	length: number;
	isStream: boolean;
	position: number;
	title: string;
	uri: string | null;
	sourceName: string;
	artworkUrl: string | null;
	isrc: string | null;
}

/** Raw track object from the Lavalink REST/WebSocket API. */
export interface TrackData {
	encoded: string;
	info: TrackInfo;
	pluginInfo: Record<string, unknown>;
	userData: Record<string, unknown>;
}

/** A fully-resolved, flattened track used throughout Moodenglink. */
export interface Track {
	/** The base64 encoded track — send this to Lavalink to play. */
	encoded: string;
	title: string;
	author: string;
	duration: number;
	identifier: string;
	uri: string | null;
	artworkUrl: string | null;
	isrc: string | null;
	sourceName: string;
	isSeekable: boolean;
	isStream: boolean;
	position: number;
	/** Plugin-provided metadata (lavasrc, etc.). */
	pluginInfo: Record<string, unknown>;
	/** User data persisted with the track on the node. */
	userData: Record<string, unknown>;
	/** Whoever requested the track — set by you at search/add time. */
	requester?: unknown;
}

/** A track that has not yet been resolved into a playable {@link Track}. */
export interface UnresolvedQuery {
	title: string;
	author?: string;
	duration?: number;
	uri?: string;
	source?: string;
	requester?: unknown;
}

/**
 * A queue item that carries only search hints (title/author/…) and is resolved
 * into a playable {@link Track} lazily, right before it plays. Build one with
 * `manager.buildUnresolved(query)`.
 */
export interface UnresolvedTrack {
	/** Discriminator — always `true`. */
	readonly unresolved: true;
	title: string;
	author?: string;
	duration?: number;
	uri?: string;
	sourceName?: string;
	isrc?: string | null;
	artworkUrl?: string | null;
	pluginInfo?: Record<string, unknown>;
	userData?: Record<string, unknown>;
	requester?: unknown;
	/** Resolves this into a playable {@link Track} (throws if nothing matches). */
	resolve(): Promise<Track>;
}

/** Anything that can live in the {@link Queue}: a resolved or unresolved track. */
export type QueueItem = Track | UnresolvedTrack;

/** Declarative matcher used by Queue query helpers. All supplied fields must match. */
export interface QueueQuery {
	title?: string | RegExp;
	author?: string | RegExp;
	uri?: string | RegExp;
	sourceName?: string | RegExp;
	requester?: unknown;
	minDuration?: number;
	maxDuration?: number;
	predicate?: (track: QueueItem, index: number) => boolean;
}

/** A fuzzy text query, declarative query, or custom predicate. */
export type QueueMatcher = string | QueueQuery | ((track: QueueItem, index: number) => boolean);

export type LoadType = "track" | "playlist" | "search" | "empty" | "error";

export interface PlaylistInfo {
	name: string;
	selectedTrack: number;
}

export interface SearchResult {
	loadType: LoadType;
	tracks: Track[];
	playlist: (PlaylistInfo & { duration: number }) | null;
	exception: { message: string; severity: string } | null;
}

/* --------------------------- Discord voice payloads --------------------------- */

export interface VoiceServer {
	token: string;
	guild_id: string;
	endpoint: string;
}

export interface VoiceState {
	guild_id: string;
	user_id: string;
	session_id: string;
	channel_id: string | null;
	self_deaf?: boolean;
	self_mute?: boolean;
}

export interface VoicePacket {
	t?: "VOICE_SERVER_UPDATE" | "VOICE_STATE_UPDATE";
	d: VoiceState | VoiceServer;
}

/** OP 4 gateway payload used to (dis)connect from a voice channel. */
export interface VoiceGatewayPayload {
	op: number;
	d: {
		guild_id: string;
		channel_id: string | null;
		self_mute: boolean;
		self_deaf: boolean;
	};
}
