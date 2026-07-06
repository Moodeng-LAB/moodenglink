/**
 * Lavalink v4 WebSocket op-codes and dispatched event payloads.
 * @module types/Op
 */

/** Op-codes sent by the Lavalink node over the WebSocket. */
export enum OpCodes {
	READY = "ready",
	PLAYER_UPDATE = "playerUpdate",
	STATS = "stats",
	EVENT = "event",
}

/** Event types dispatched inside an `event` op. */
export enum EventTypes {
	TrackStartEvent = "TrackStartEvent",
	TrackEndEvent = "TrackEndEvent",
	TrackExceptionEvent = "TrackExceptionEvent",
	TrackStuckEvent = "TrackStuckEvent",
	WebSocketClosedEvent = "WebSocketClosedEvent",
	// LavaLyrics plugin
	LyricsFoundEvent = "LyricsFoundEvent",
	LyricsNotFoundEvent = "LyricsNotFoundEvent",
	LyricsLineEvent = "LyricsLineEvent",
}

/** Reason a track stopped playing. */
export type TrackEndReason = "finished" | "loadFailed" | "stopped" | "replaced" | "cleanup";

/** Severity of a Lavalink exception. */
export type Severity = "common" | "suspicious" | "fault";

export interface Exception {
	message: string | null;
	severity: Severity;
	cause: string;
}

export interface PlayerState {
	time: number;
	position: number;
	connected: boolean;
	ping: number;
}

export interface ReadyPayload {
	op: OpCodes.READY;
	resumed: boolean;
	sessionId: string;
}

export interface PlayerUpdatePayload {
	op: OpCodes.PLAYER_UPDATE;
	guildId: string;
	state: PlayerState;
}

export interface StatsPayload {
	op: OpCodes.STATS;
	players: number;
	playingPlayers: number;
	uptime: number;
	memory: { free: number; used: number; allocated: number; reservable: number };
	cpu: { cores: number; systemLoad: number; lavalinkLoad: number };
	frameStats: { sent: number; nulled: number; deficit: number } | null;
}

export interface EventPayloadBase {
	op: OpCodes.EVENT;
	guildId: string;
	type: EventTypes;
}

export interface TrackStartEvent extends EventPayloadBase {
	type: EventTypes.TrackStartEvent;
	track: import("./Player").TrackData;
}

export interface TrackEndEvent extends EventPayloadBase {
	type: EventTypes.TrackEndEvent;
	track: import("./Player").TrackData;
	reason: TrackEndReason;
}

export interface TrackExceptionEvent extends EventPayloadBase {
	type: EventTypes.TrackExceptionEvent;
	track: import("./Player").TrackData;
	exception: Exception;
}

export interface TrackStuckEvent extends EventPayloadBase {
	type: EventTypes.TrackStuckEvent;
	track: import("./Player").TrackData;
	thresholdMs: number;
}

export interface WebSocketClosedEvent extends EventPayloadBase {
	type: EventTypes.WebSocketClosedEvent;
	code: number;
	reason: string;
	byRemote: boolean;
}

/* ------------------------------ LavaLyrics ------------------------------ */

export interface LyricsLine {
	timestamp: number;
	duration: number | null;
	line: string;
	plugin: Record<string, unknown>;
}

export interface LyricsResult {
	sourceName: string;
	provider: string;
	text: string | null;
	lines: LyricsLine[];
	plugin: Record<string, unknown>;
}

export interface LyricsFoundEvent extends EventPayloadBase {
	type: EventTypes.LyricsFoundEvent;
	lyrics: LyricsResult;
}

export interface LyricsNotFoundEvent extends EventPayloadBase {
	type: EventTypes.LyricsNotFoundEvent;
}

export interface LyricsLineEvent extends EventPayloadBase {
	type: EventTypes.LyricsLineEvent;
	lineIndex: number;
	line: LyricsLine;
	skipped: boolean;
}

export type PlayerEvent =
	| TrackStartEvent
	| TrackEndEvent
	| TrackExceptionEvent
	| TrackStuckEvent
	| WebSocketClosedEvent
	| LyricsFoundEvent
	| LyricsNotFoundEvent
	| LyricsLineEvent;

export type IncomingPayload = ReadyPayload | PlayerUpdatePayload | StatsPayload | PlayerEvent;
