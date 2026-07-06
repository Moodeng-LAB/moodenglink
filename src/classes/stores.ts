/**
 * Ready-made {@link SessionStore} backends for player persistence & resuming.
 * @module classes/stores
 */

import type { SessionStore } from "../types/Moodenglink";

/** An in-process, `Map`-backed store. Great for a single-instance bot. */
export class MemoryStore implements SessionStore {
	private readonly map = new Map<string, string>();

	public get(key: string): string | null {
		return this.map.get(key) ?? null;
	}

	public set(key: string, value: string): void {
		this.map.set(key, value);
	}

	public delete(key: string): void {
		this.map.delete(key);
	}

	public keys(): string[] {
		return [...this.map.keys()];
	}
}

/**
 * The minimal client shape {@link RedisStore} needs — satisfied by both
 * `ioredis` and `redis` (v4) clients.
 */
export interface RedisLike {
	get(key: string): Promise<string | null>;
	set(key: string, value: string): Promise<unknown>;
	del(key: string): Promise<unknown>;
	keys(pattern: string): Promise<string[]>;
}

/**
 * A Redis-backed store that survives full process restarts. Pass an existing
 * `ioredis` / `redis` client; an optional key `prefix` namespaces the data.
 *
 * ```ts
 * import Redis from "ioredis";
 * const manager = new Moodenglink({ nodes, autoResume: true, store: new RedisStore(new Redis()), send });
 * ```
 */
export class RedisStore implements SessionStore {
	constructor(
		private readonly redis: RedisLike,
		private readonly prefix = "",
	) {}

	public get(key: string): Promise<string | null> {
		return this.redis.get(this.prefix + key);
	}

	public set(key: string, value: string): Promise<unknown> {
		return this.redis.set(this.prefix + key, value);
	}

	public delete(key: string): Promise<unknown> {
		return this.redis.del(this.prefix + key);
	}

	public async keys(): Promise<string[]> {
		const keys = await this.redis.keys(`${this.prefix}moodenglink:player:*`);
		// Strip the prefix so the manager sees the canonical keys it wrote.
		return this.prefix ? keys.map((k) => k.slice(this.prefix.length)) : keys;
	}
}
