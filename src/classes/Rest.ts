/**
 * Thin, typed wrapper over the Lavalink v4 REST API.
 * @module classes/Rest
 */

import type { NodeInfo, NodeStats } from "../types/Node";
import type { LyricsResult, SponsorBlockCategory } from "../types/Op";
import type { LavalinkPlayer, RequestOptions, UpdatePlayerBody } from "../types/Rest";
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
	 * Network-level failures are retried up to `retryAmount` times; HTTP errors
	 * are surfaced with Lavalink's stack trace (requested via `?trace=true`).
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

		const maxAttempts = Math.max(1, this.node.options.retryAmount);
		let lastError: unknown;

		for (let attempt = 1; attempt <= maxAttempts; attempt++) {
			const controller = new AbortController();
			const timeout = setTimeout(() => controller.abort(), this.node.options.requestTimeout);
			try {
				const response = await fetch(url, { method, headers, body, signal: controller.signal });

				if (response.status === 204) return undefined as T;

				const text = await response.text();
				const data = text ? JSON.parse(text) : undefined;

				if (!response.ok) {
					const trace = typeof data?.trace === "string" ? ` — ${data.trace.split("\n")[0]}` : "";
					const message = (data && (data.message || data.error)) || response.statusText;
					// 4xx are deterministic — don't waste retries on them.
					throw new RestError(`Lavalink REST ${response.status} on ${method} ${endpoint}: ${message}${trace}`, response.status);
				}

				return data as T;
			} catch (error) {
				lastError = error;
				// Only retry transient network/abort failures, never HTTP 4xx/5xx bodies.
				if (error instanceof RestError || attempt >= maxAttempts) throw error;
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
		return this.request("/decodetracks", { method: "POST", body: encodedTracks });
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

	public destroyPlayer(guildId: string): Promise<void> {
		return this.request(`${this.sessionPath}/players/${guildId}`, { method: "DELETE" });
	}

	/* ------------------------------- session ------------------------------- */

	public updateSession(resuming: boolean, timeout: number): Promise<{ resuming: boolean; timeout: number }> {
		return this.request(this.sessionPath, { method: "PATCH", body: { resuming, timeout } });
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
		return this.request(`${this.sessionPath}/players/${guildId}/lyrics/subscribe`, { method: "DELETE" });
	}

	/* ----------------------- SponsorBlock plugin ----------------------- */

	/** Sets the SponsorBlock categories the node should skip for a guild. */
	public setSponsorBlockCategories(guildId: string, categories: SponsorBlockCategory[]): Promise<void> {
		return this.request(`${this.sessionPath}/players/${guildId}/sponsorblock/categories`, { method: "PUT", body: categories });
	}

	/** Gets the SponsorBlock categories currently enabled for a guild. */
	public getSponsorBlockCategories(guildId: string): Promise<SponsorBlockCategory[]> {
		return this.request(`${this.sessionPath}/players/${guildId}/sponsorblock/categories`);
	}

	/** Clears all SponsorBlock categories for a guild. */
	public clearSponsorBlockCategories(guildId: string): Promise<void> {
		return this.request(`${this.sessionPath}/players/${guildId}/sponsorblock/categories`, { method: "DELETE" });
	}
}

/** Error thrown for non-2xx Lavalink REST responses (carries the HTTP status). */
export class RestError extends Error {
	constructor(
		message: string,
		public readonly status: number,
	) {
		super(message);
		this.name = "RestError";
	}
}
