/**
 * A tiny LRU cache with per-entry TTL, used for optional search-result caching.
 * @module utils/cache
 */

interface Entry<V> {
	value: V;
	expires: number;
}

export class TTLCache<K, V> {
	private readonly store = new Map<K, Entry<V>>();

	constructor(
		private readonly ttl: number,
		private readonly maxSize: number,
	) {}

	/** Returns a live (non-expired) value, or `undefined`. Refreshes LRU order. */
	public get(key: K): V | undefined {
		const entry = this.store.get(key);
		if (!entry) return undefined;
		if (entry.expires <= Date.now()) {
			this.store.delete(key);
			return undefined;
		}
		// Re-insert to mark as most-recently-used.
		this.store.delete(key);
		this.store.set(key, entry);
		return entry.value;
	}

	/** Stores a value, evicting the oldest entry when over capacity. */
	public set(key: K, value: V): void {
		if (this.store.has(key)) this.store.delete(key);
		this.store.set(key, { value, expires: Date.now() + this.ttl });
		if (this.store.size > this.maxSize) {
			const oldest = this.store.keys().next().value;
			if (oldest !== undefined) this.store.delete(oldest);
		}
	}

	public clear(): void {
		this.store.clear();
	}

	public get size(): number {
		return this.store.size;
	}
}
