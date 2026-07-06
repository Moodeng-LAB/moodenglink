import { describe, expect, it } from "vitest";
import { MemoryStore, RedisStore, type RedisLike } from "../src/classes/stores";

describe("MemoryStore", () => {
	it("supports get/set/delete/keys", () => {
		const store = new MemoryStore();
		expect(store.get("x")).toBeNull();
		store.set("moodenglink:player:1", "data");
		store.set("moodenglink:player:2", "data2");
		expect(store.get("moodenglink:player:1")).toBe("data");
		expect(store.keys().sort()).toEqual(["moodenglink:player:1", "moodenglink:player:2"]);
		store.delete("moodenglink:player:1");
		expect(store.get("moodenglink:player:1")).toBeNull();
	});
});

describe("RedisStore", () => {
	function fakeRedis(): RedisLike & { backend: Map<string, string> } {
		const backend = new Map<string, string>();
		return {
			backend,
			get: async (k) => backend.get(k) ?? null,
			set: async (k, v) => void backend.set(k, v),
			del: async (k) => void backend.delete(k),
			keys: async (pattern) => {
				const prefix = pattern.replace(/\*$/, "");
				return [...backend.keys()].filter((k) => k.startsWith(prefix));
			},
		};
	}

	it("namespaces keys with the prefix and strips it back off in keys()", async () => {
		const redis = fakeRedis();
		const store = new RedisStore(redis, "bot1:");

		await store.set("moodenglink:player:9", "payload");
		expect(redis.backend.has("bot1:moodenglink:player:9")).toBe(true);
		expect(await store.get("moodenglink:player:9")).toBe("payload");

		const keys = await store.keys();
		expect(keys).toEqual(["moodenglink:player:9"]);

		await store.delete("moodenglink:player:9");
		expect(await store.get("moodenglink:player:9")).toBeNull();
	});

	it("works without a prefix", async () => {
		const store = new RedisStore(fakeRedis());
		await store.set("moodenglink:player:1", "x");
		expect(await store.keys()).toEqual(["moodenglink:player:1"]);
	});
});
