/**
 * Thin, typed wrapper over the Lavalink v4 REST API.
 * @module classes/Rest
 */

import type { NodeInfo, NodeStats } from "../types/Node";
import type { LyricsResult, SponsorBlockCategory } from "../types/Op";
import type { LavalinkPlayer, RequestOptions, UpdatePlayerBody } from "../types/Rest";
import { sleep } from "../utils/utils";
import type { Node } from "./Node";

export class Rest {
	/** The active Lavalink session id (set once the node is `ready`). */
	public sessionId: string | null = null;

	private readonly baseUrl: string;

	constructor(private readonly node: Node) {
		const { host, port, secure } = node.options;
		this.baseUrl = `${secure ? "https" : "http"}://${host}:${port}/v4`;
	}

	/**
	 * Performs an authenticated request and parses the JSON body (if any).
	 *
	 * Transient network/timeout failures are retried up to `retryAmount` times
	 * with an incremental backoff (`retryDelay * attempt`, capped) so a struggling
	 * node isn't hammered. Only idempotent requests are retried — `GET` by default,
	 * or any call that opts in via `options.idempotent` — because replaying a
	 * non-idempotent write (e.g. `PATCH /players`) whose response was merely lost
	 * could restart or duplicate playback. HTTP (4xx/5xx) errors are never retried
	 * and are surfaced with Lavalink's stack trace (requested via `?trace=true`).
	 */
	public async request<T = unknown>(endpoint: string, options: RequestOptions = {}): Promise<T> {
		const method = options.method ?? "GET";
		const url = new URL(this.baseUrl + endpoint);
		if (options.query) {
			for (const [key, value] of Object.entries(options.query)) {
				if (value !== undefined) url.searchParams.set(key, String(value));
			}
		}
		// Ask the node to attach a stack trace to any error response.
		url.searchParams.set("trace", "true");

		const body = options.body !== undefined ? JSON.stringify(options.body) : undefined;
		const headers = {
			Authorization: this.node.options.password!,
			"Content-Type": "application/json",
			...options.headers,
		};

		// Retrying a non-idempotent write whose response was lost can re-issue the
		// state change (e.g. restart the current track), so only GET retries by default.
		const canRetry = options.idempotent ?? method === "GET";
		// retryAmount means retries after the initial request, matching NodeOptions.
		const maxAttempts = canRetry ? Math.max(1, this.node.options.retryAmount + 1) : 1;
		let lastError: unknown;

		for (let attempt = 1; attempt <= maxAttempts; attempt++) {
			const controller = new AbortController();
			const timeout = setTimeout(() => controller.abort(), this.node.options.requestTimeout);
			try {
				const response = await fetch(url, { method, headers, body, signal: controller.signal });

				if (response.status === 204) return undefined as T;

				const text = await response.text();
				let data: unknown;
				try {
					data = text ? JSON.parse(text) : undefined;
				} catch {
					data = text;
				}

				if (!response.ok) {
					const payload = data && typeof data === "object" ? (data as Record<string, unknown>) : null;
					const trace = typeof payload?.trace === "string" ? ` — ${payload.trace.split("\n")[0]}` : "";
					const detail = payload?.message ?? payload?.error ?? (typeof data === "string" ? data : response.statusText);
					const retryable = response.status === 408 || response.status === 425 || response.status === 429 || response.status >= 500;
					const retryAfter = Number(response.headers.get("retry-after"));
					throw new RestError(`Lavalink REST ${response.status} on ${method} ${endpoint}: ${detail}${trace}`, response.status, {
						method,
						endpoint,
						body: data,
						retryable,
						retryAfterMs: Number.isFinite(retryAfter) ? retryAfter * 1000 : undefined,
					});
				}

				return data as T;
			} catch (error) {
				lastError = error;
				const abort = (error as Error)?.name === "AbortError";
				const retryable = !(error instanceof RestError) || error.retryable;
				if (!retryable || attempt >= maxAttempts) {
					if (error instanceof RestError) throw error;
					throw new RestNetworkError(`Lavalink REST ${method} ${endpoint} ${abort ? "timed out" : "failed"}: ${(error as Error)?.message ?? error}`, {
						method,
						endpoint,
						timedOut: abort,
						cause: error,
					});
				}
				this.node.manager.emit(
					"debug",
					`[Rest ${this.node.id}] ${method} ${endpoint} ${abort ? "timed out" : "failed"} (${(error as Error)?.message ?? error}); retry ${attempt}/${maxAttempts - 1}.`,
				);
				// Incremental backoff, capped so a large retryAmount can't stall for minutes.
				const retryAfter = error instanceof RestError ? error.retryAfterMs : undefined;
				await sleep(retryAfter === undefined ? Math.min(this.node.options.retryDelay * attempt, 15_000) : Math.max(0, Math.min(retryAfter, 15_000)));
			} finally {
				clearTimeout(timeout);
			}
		}

		throw lastError;
	}

	/* ------------------------------- tracks ------------------------------- */

	public loadTracks(identifier: string): Promise<{ loadType: string; data: unknown }> {
		return this.request("/loadtracks", { query: { identifier } });
	}

	public decodeTrack(encodedTrack: string) {
		return this.request("/decodetrack", { query: { encodedTrack } });
	}

	public decodeTracks(encodedTracks: string[]) {
		return this.request("/decodetracks", { method: "POST", body: encodedTracks, idempotent: true });
	}

	/* ------------------------------- players ------------------------------- */

	private get sessionPath(): string {
		if (!this.sessionId) throw new Error(`Node "${this.node.options.identifier}" has no session id yet.`);
		return `/sessions/${this.sessionId}`;
	}

	public getPlayers(): Promise<LavalinkPlayer[]> {
		return this.request(`${this.sessionPath}/players`);
	}

	public getPlayer(guildId: string): Promise<LavalinkPlayer> {
		return this.request(`${this.sessionPath}/players/${guildId}`);
	}

	public updatePlayer(guildId: string, body: UpdatePlayerBody, noReplace = false): Promise<LavalinkPlayer> {
		return this.request(`${this.sessionPath}/players/${guildId}`, {
			method: "PATCH",
			query: { noReplace },
			body,
		});
	}

	public async destroyPlayer(guildId: string): Promise<void> {
		try {
			await this.request(`${this.sessionPath}/players/${guildId}`, { method: "DELETE", idempotent: true });
		} catch (error) {
			// DELETE is idempotent: a player already gone is the desired state.
			if (!(error instanceof RestError) || error.status !== 404) throw error;
		}
	}

	/* ------------------------------- session ------------------------------- */

	public updateSession(resuming: boolean, timeout: number): Promise<{ resuming: boolean; timeout: number }> {
		return this.request(this.sessionPath, { method: "PATCH", body: { resuming, timeout }, idempotent: true });
	}

	/* ------------------------------- node info ------------------------------- */

	public getInfo(): Promise<NodeInfo> {
		return this.request("/info");
	}

	public getStats(): Promise<NodeStats> {
		return this.request("/stats");
	}

	/* ------------------------- lyrics (LavaLyrics) ------------------------- */

	/** Fetches lyrics for a guild's currently-playing track. */
	public getLyrics(guildId: string, skipTrackSource = false): Promise<LyricsResult | null> {
		return this.request(`${this.sessionPath}/players/${guildId}/track/lyrics`, { query: { skipTrackSource } });
	}

	/** Fetches lyrics for an arbitrary encoded track. */
	public getLyricsForTrack(encoded: string, skipTrackSource = false): Promise<LyricsResult | null> {
		return this.request("/lyrics", { query: { track: encoded, skipTrackSource } });
	}

	/** Subscribes to live (line-by-line) lyrics events for a guild. */
	public subscribeLyrics(guildId: string): Promise<void> {
		return this.request(`${this.sessionPath}/players/${guildId}/lyrics/subscribe`, { method: "POST" });
	}

	/** Cancels a live lyrics subscription for a guild. */
	public unsubscribeLyrics(guildId: string): Promise<void> {
		return this.request(`${this.sessionPath}/players/${guildId}/lyrics/subscribe`, { method: "DELETE", idempotent: true });
	}

	/* ----------------------- SponsorBlock plugin ----------------------- */

	/** Sets the SponsorBlock categories the node should skip for a guild. */
	public setSponsorBlockCategories(guildId: string, categories: SponsorBlockCategory[]): Promise<void> {
		return this.request(`${this.sessionPath}/players/${guildId}/sponsorblock/categories`, { method: "PUT", body: categories, idempotent: true });
	}

	/** Gets the SponsorBlock categories currently enabled for a guild. */
	public getSponsorBlockCategories(guildId: string): Promise<SponsorBlockCategory[]> {
		return this.request(`${this.sessionPath}/players/${guildId}/sponsorblock/categories`);
	}

	/** Clears all SponsorBlock categories for a guild. */
	public clearSponsorBlockCategories(guildId: string): Promise<void> {
		return this.request(`${this.sessionPath}/players/${guildId}/sponsorblock/categories`, { method: "DELETE", idempotent: true });
	}
}

interface RestErrorDetails {
	method?: string;
	endpoint?: string;
	body?: unknown;
	retryable?: boolean;
	retryAfterMs?: number;
}

/** Error thrown for non-2xx Lavalink REST responses with structured diagnostics. */
export class RestError extends Error {
	public readonly method?: string;
	public readonly endpoint?: string;
	public readonly body?: unknown;
	public readonly retryable: boolean;
	public readonly retryAfterMs?: number;

	constructor(
		message: string,
		public readonly status: number,
		details: RestErrorDetails = {},
	) {
		super(message);
		this.name = "RestError";
		this.method = details.method;
		this.endpoint = details.endpoint;
		this.body = details.body;
		this.retryable = details.retryable ?? false;
		this.retryAfterMs = details.retryAfterMs;
	}
}

/** A timeout or transport failure after the configured retries were exhausted. */
export class RestNetworkError extends Error {
	public readonly code = "LAVALINK_NETWORK_ERROR";
	public readonly method: string;
	public readonly endpoint: string;
	public readonly timedOut: boolean;
	public readonly cause: unknown;

	constructor(message: string, details: { method: string; endpoint: string; timedOut: boolean; cause: unknown }) {
		super(message);
		this.name = "RestNetworkError";
		this.method = details.method;
		this.endpoint = details.endpoint;
		this.timedOut = details.timedOut;
		this.cause = details.cause;
	}
}
