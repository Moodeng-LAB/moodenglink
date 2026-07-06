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
}

/** The voice state Lavalink needs to establish a connection. */
export interface LavalinkVoiceState {
	token: string;
	endpoint: string;
	sessionId: string;
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
