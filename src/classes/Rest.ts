/**
 * Thin, typed wrapper over the Lavalink v4 REST API.
 * @module classes/Rest
 */

import type { NodeInfo, NodeStats } from "../types/Node";
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

	/** Performs an authenticated request and parses the JSON body (if any). */
	public async request<T = unknown>(endpoint: string, options: RequestOptions = {}): Promise<T> {
		const url = new URL(this.baseUrl + endpoint);
		if (options.query) {
			for (const [key, value] of Object.entries(options.query)) {
				if (value !== undefined) url.searchParams.set(key, String(value));
			}
		}

		const controller = new AbortController();
		const timeout = setTimeout(() => controller.abort(), this.node.options.requestTimeout);

		try {
			const response = await fetch(url, {
				method: options.method ?? "GET",
				headers: {
					Authorization: this.node.options.password!,
					"Content-Type": "application/json",
					...options.headers,
				},
				body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
				signal: controller.signal,
			});

			if (response.status === 204) return undefined as T;

			const text = await response.text();
			const data = text ? JSON.parse(text) : undefined;

			if (!response.ok) {
				const message = (data && (data.message || data.error)) || response.statusText;
				throw new Error(`Lavalink REST ${response.status} on ${options.method ?? "GET"} ${endpoint}: ${message}`);
			}

			return data as T;
		} finally {
			clearTimeout(timeout);
		}
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
}
