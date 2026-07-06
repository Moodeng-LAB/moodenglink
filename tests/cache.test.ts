import { describe, expect, it, vi } from "vitest";
import { TTLCache } from "../src/utils/cache";

describe("TTLCache", () => {
	it("stores and retrieves values", () => {
		const cache = new TTLCache<string, number>(1000, 10);
		cache.set("a", 1);
		expect(cache.get("a")).toBe(1);
		expect(cache.get("missing")).toBeUndefined();
	});

	it("evicts the least-recently-used entry over capacity", () => {
		const cache = new TTLCache<string, number>(1000, 2);
		cache.set("a", 1);
		cache.set("b", 2);
		cache.get("a"); // touch a -> b is now the LRU
		cache.set("c", 3); // evicts b
		expect(cache.get("b")).toBeUndefined();
		expect(cache.get("a")).toBe(1);
		expect(cache.get("c")).toBe(3);
	});

	it("expires entries after the TTL", () => {
		vi.useFakeTimers();
		try {
			const cache = new TTLCache<string, number>(100, 10);
			cache.set("a", 1);
			vi.advanceTimersByTime(101);
			expect(cache.get("a")).toBeUndefined();
		} finally {
			vi.useRealTimers();
		}
	});

	it("clears and reports size", () => {
		const cache = new TTLCache<string, number>(1000, 10);
		cache.set("a", 1);
		cache.set("b", 2);
		expect(cache.size).toBe(2);
		cache.clear();
		expect(cache.size).toBe(0);
	});
});
