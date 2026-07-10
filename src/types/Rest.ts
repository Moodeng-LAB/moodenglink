/**
 * Types describing the Lavalink v4 REST payloads.
 * @module types/Rest
 */

import type { FilterPayload } from "./Filters";
import type { PlayerState } from "./Op";
import type { TrackData } from "./Player";

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
	loadType: "track" | "playlist" | "search" | "empty" | "error";
	data: unknown;
}
