/**
 * Types describing the Lavalink v4 REST payloads.
 * @module types/Rest
 */

import type { FilterPayload } from "./Filters";
import type { PlayerState } from "./Op";
import type { LoadType, TrackData } from "./Player";

export type HttpMethod = "GET" | "POST" | "PATCH" | "PUT" | "DELETE";

export interface RequestOptions {
	method?: HttpMethod;
	body?: unknown;
	query?: Record<string, string | number | boolean | undefined>;
	headers?: Record<string, string>;
	/**
	 * Whether a transient (network/timeout) failure may be safely retried.
	 * Defaults to `true` for `GET` only — non-`GET` requests are not retried by
	 * default because a lost response (e.g. an aborted `PATCH /players`) could
	 * otherwise re-issue a state change like play/seek. Override per call when a
	 * write is genuinely idempotent.
	 */
	idempotent?: boolean;
}

/** The voice state Lavalink needs to establish a connection. */
export interface LavalinkVoiceState {
	token: string;
	endpoint: string;
	sessionId: string;
	/**
	 * The voice channel id. Optional in the stock Lavalink v4 protocol (extra
	 * keys are ignored) but **required** by some node builds, which otherwise
	 * reject the update with `Field 'channelId' is required ... at path: $.voice`.
	 */
	channelId?: string;
}

/** Body accepted by `PATCH /sessions/{sessionId}/players/{guildId}`. */
export interface UpdatePlayerBody {
	track?: {
		encoded?: string | null;
		identifier?: string;
		userData?: Record<string, unknown>;
	};
	position?: number;
	endTime?: number | null;
	volume?: number;
	paused?: boolean;
	filters?: FilterPayload;
	voice?: LavalinkVoiceState;
}

export interface LavalinkPlayer {
	guildId: string;
	track: TrackData | null;
	volume: number;
	paused: boolean;
	state: PlayerState;
	voice: LavalinkVoiceState;
	filters: FilterPayload;
}

export interface LavalinkTrackLoadResult {
	loadType: LoadType;
	data: unknown;
}

/* ------------------------- NodeLink `/v4/loadlyrics` ------------------------- */
// NodeLink doesn't implement Lavalink's LavaLyrics-plugin REST shape (`/v4/lyrics`,
// `/v4/sessions/{id}/players/{guildId}/track/lyrics`) — it exposes an equivalent,
// differently-shaped `/v4/loadlyrics` endpoint instead. Rest maps this envelope
// into the same `LyricsResult` Lavalink callers already get.

export interface NodeLinkLyricsLine {
	text: string;
	time: number;
	duration: number;
	words?: Record<string, unknown>[];
}

export interface NodeLinkLyricsData {
	name?: string;
	synced?: boolean;
	lines?: NodeLinkLyricsLine[];
	provider?: string;
}

export type NodeLinkLyricsLoadResult =
	| { loadType: "lyrics"; data: NodeLinkLyricsData }
	| { loadType: "empty"; data: Record<string, never> }
	| { loadType: "error"; data: { message: string; severity: string } };
