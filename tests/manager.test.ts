import { beforeEach, describe, expect, it, vi } from "vitest";
import { Moodenglink, SearchPolicyError } from "../src/classes/Moodenglink";
import type { Node } from "../src/classes/Node";
import { Player } from "../src/classes/Player";
import { MemoryStore } from "../src/classes/stores";
import leastUsedNode from "../src/sorter/leastUsedNode";
import { makeStats, makeTrackData } from "./helpers";

function buildManager(extra: Record<string, unknown> = {}) {
	const send = vi.fn();
	const manager = new Moodenglink({
		nodes: [{ host: "localhost", port: 2333, password: "p", identifier: "n1" }],
		clientId: "bot-1",
		send,
		...extra,
	});
	// Pretend the node is up so search/create can pick it.
	const node = manager.nodes.get("n1") as Node;
	node.connected = true;
	node.stats = makeStats() as never;
	return { manager, node, send };
}

describe("Moodenglink constructor", () => {
	it("throws without nodes", () => {
		expect(() => new Moodenglink({ nodes: [], send: () => {} })).toThrow(/at least one node/);
	});

	it("throws without a send function", () => {
		// @ts-expect-error intentionally invalid
		expect(() => new Moodenglink({ nodes: [{ host: "h" }] })).toThrow(/send/);
	});

	it("registers the configured nodes and applies defaults", () => {
		const { manager } = buildManager();
		expect(manager.nodes.size).toBe(1);
		expect(manager.options.defaultSearchPlatform).toBe("youtube");
		expect(manager.options.autoMove).toBe(true);
	});

	it("offers additive presets without changing the default constructor", () => {
		const { manager } = buildManager();
		const simple = Moodenglink.simple({
			nodes: [{ host: "localhost", identifier: "simple" }],
			clientId: "bot",
			send: () => {},
		});

		expect(manager.options.searchCache).toBeUndefined();
		expect(simple.options.preset).toBe("recommended");
		expect(simple.options.searchCache).toBe(true);
		expect(simple.options.playerBehavior?.autoSkipOnError).toBe(true);
	});
});

describe("Moodenglink.idealNode", () => {
	it("returns a connected node and throws when none are up", () => {
		const { manager, node } = buildManager();
		expect(manager.idealNode).toBe(node);
		node.connected = false;
		expect(() => manager.idealNode).toThrow(/No connected nodes/);
	});

	it("skips nodes without the playback capability", () => {
		const manager = new Moodenglink({
			nodes: [
				{ host: "a", identifier: "search-only", playback: false },
				{ host: "b", identifier: "playable" },
			],
			clientId: "bot",
			send: () => {},
		});
		for (const n of manager.nodes.values()) {
			n.connected = true;
			n.stats = makeStats() as never;
		}
		expect(manager.idealNode.id).toBe("playable");
	});

	it("inline default selection matches leastUsedNode().first() across random stats/priorities", () => {
		const nodes = Array.from({ length: 8 }, (_, i) => ({ host: `h${i}`, identifier: `n${i}`, priority: i % 3 }));
		const manager = new Moodenglink({ nodes, clientId: "bot", send: () => {} });

		for (let round = 0; round < 200; round++) {
			for (const n of manager.nodes.values()) {
				// Randomly vary connectivity, load and priority each round.
				n.connected = Math.random() > 0.2;
				(n.options as { priority: number }).priority = Math.floor(Math.random() * 4);
				n.stats = makeStats({ playingPlayers: Math.floor(Math.random() * 5) }) as never;
			}
			const connected = manager.nodes.filter((n) => n.connected && n.options.playback);
			if (!connected.size) {
				expect(() => manager.idealNode).toThrow();
				continue;
			}
			const expected = leastUsedNode(connected).first();
			expect(manager.idealNode).toBe(expected);
		}
	});
});

describe("Moodenglink.search", () => {
	it("resolves a search result into flattened tracks", async () => {
		const { manager, node } = buildManager();
		vi.spyOn(node.rest, "loadTracks").mockResolvedValue({
			loadType: "search",
			data: [makeTrackData({}, "E1"), makeTrackData({ title: "Second" }, "E2")],
		});

		const res = await manager.search("lofi", "requester-1");
		expect(res.loadType).toBe("search");
		expect(res.tracks.map((t) => t.encoded)).toEqual(["E1", "E2"]);
		expect(res.tracks[0].requester).toBe("requester-1");
	});

	it("resolves a playlist with duration", async () => {
		const { manager, node } = buildManager();
		vi.spyOn(node.rest, "loadTracks").mockResolvedValue({
			loadType: "playlist",
			data: {
				info: { name: "My Mix", selectedTrack: 0 },
				tracks: [makeTrackData({ length: 1000 }, "E1"), makeTrackData({ length: 2000 }, "E2")],
			},
		});

		const res = await manager.search("https://list");
		expect(res.playlist?.name).toBe("My Mix");
		expect(res.playlist?.duration).toBe(3000);
		expect(res.tracks).toHaveLength(2);
	});

	it("applies trackPartial to strip fields", async () => {
		const { manager, node } = buildManager({ trackPartial: ["title"] });
		vi.spyOn(node.rest, "loadTracks").mockResolvedValue({ loadType: "track", data: makeTrackData({}, "E1") });
		const res = await manager.search("x");
		expect(res.tracks[0].encoded).toBe("E1");
		expect(res.tracks[0].title).toBeDefined();
		expect((res.tracks[0] as Record<string, unknown>).author).toBeUndefined();
	});

	it("caches results when searchCache is enabled", async () => {
		const { manager, node } = buildManager({ searchCache: true });
		const spy = vi.spyOn(node.rest, "loadTracks").mockResolvedValue({ loadType: "track", data: makeTrackData({}, "E1") });

		const first = await manager.search("same-query", "userA");
		const second = await manager.search("same-query", "userB");

		expect(spy).toHaveBeenCalledTimes(1); // second served from cache
		expect(first.tracks[0].encoded).toBe("E1");
		expect(second.tracks[0].requester).toBe("userB"); // requester re-stamped
	});

	it("isolates cached entries so a consumer mutation can't bleed into later hits", async () => {
		const { manager, node } = buildManager({ searchCache: true });
		vi.spyOn(node.rest, "loadTracks").mockResolvedValue({ loadType: "track", data: makeTrackData({}, "E1") });

		const first = await manager.search("q", "userA");
		// Mutate a nested field on the returned track…
		(first.tracks[0].pluginInfo as Record<string, unknown>).tampered = true;
		(first.tracks[0] as Record<string, unknown>).title = "HACKED";

		// …a later cache hit must be pristine, not poisoned.
		const second = await manager.search("q", "userB");
		expect((second.tracks[0].pluginInfo as Record<string, unknown>).tampered).toBeUndefined();
		expect(second.tracks[0].title).toBe("Never Gonna Give You Up");
	});

	it("enforces direct URL allow and block lists before making a REST request", async () => {
		const { manager, node } = buildManager({
			searchPolicy: {
				allowedDomains: ["youtube.com"],
				blockedDomains: ["music.youtube.com"],
			},
		});
		const load = vi.spyOn(node.rest, "loadTracks").mockResolvedValue({ loadType: "empty", data: {} });

		await expect(manager.search("https://example.com/watch?v=x")).rejects.toBeInstanceOf(SearchPolicyError);
		await expect(manager.search("https://music.youtube.com/watch?v=x")).rejects.toThrow(/blocked/);
		await manager.search("https://www.youtube.com/watch?v=x");
		expect(load).toHaveBeenCalledOnce();
	});

	it("supports a custom search policy while allowing ordinary text by default", async () => {
		const { manager, node } = buildManager({
			searchPolicy: { validate: (query: string) => (query.includes("forbidden") ? "No forbidden searches." : true) },
		});
		vi.spyOn(node.rest, "loadTracks").mockResolvedValue({ loadType: "empty", data: {} });

		await expect(manager.search("forbidden song")).rejects.toThrow("No forbidden searches.");
		await expect(manager.search("ordinary song")).resolves.toMatchObject({ loadType: "empty" });
	});
});

describe("Moodenglink players", () => {
	it("creates, returns the same instance, and destroys a player", async () => {
		const { manager, node } = buildManager();
		vi.spyOn(node.rest, "destroyPlayer").mockResolvedValue(undefined);

		const player = manager.create({ guild: "g1", voiceChannel: "vc1" });
		expect(manager.create({ guild: "g1" })).toBe(player); // idempotent
		expect(manager.get("g1")).toBe(player);

		await manager.destroy("g1");
		expect(manager.get("g1")).toBeUndefined();
	});

	it("merges player defaults with per-player options and data", () => {
		const { manager } = buildManager({
			playerDefaults: { volume: 80, selfDeafen: false, data: { locale: "th", shared: "default" } },
		});
		const player = manager.create({ guild: "g1", volume: 120, data: { shared: "override" } });

		expect(player.volume).toBe(120);
		expect(player.selfDeafen).toBe(false);
		expect(player.data).toEqual({ locale: "th", shared: "override" });
	});

	it("reports a detailed destroy reason and stays compatible with manager.destroy", async () => {
		const { manager, node } = buildManager();
		vi.spyOn(node.rest, "destroyPlayer").mockResolvedValue(undefined);
		const destroyed = vi.fn();
		manager.on("playerDestroy", destroyed);
		manager.create({ guild: "g1", voiceChannel: "vc1" });

		await manager.destroy("g1");

		expect(destroyed).toHaveBeenCalledWith(expect.any(Player), { reason: "manager", disconnected: true });
	});

	it("preserves destroy(false) and emits a manual non-disconnecting context", async () => {
		const { manager, node, send } = buildManager();
		vi.spyOn(node.rest, "destroyPlayer").mockResolvedValue(undefined);
		const destroyed = vi.fn();
		manager.on("playerDestroy", destroyed);
		const player = manager.create({ guild: "g1", voiceChannel: "vc1" });

		await player.destroy(false);

		expect(send).not.toHaveBeenCalled();
		expect(destroyed).toHaveBeenCalledWith(player, { reason: "manual", disconnected: false });
	});

	it("searches, queues, connects and starts playback with one play call", async () => {
		const { manager, node, send } = buildManager();
		vi.spyOn(node.rest, "loadTracks").mockResolvedValue({
			loadType: "search",
			data: [makeTrackData({ title: "First" }, "E1"), makeTrackData({ title: "Second" }, "E2")],
		});
		const update = vi.spyOn(node.rest, "updatePlayer").mockResolvedValue({} as never);

		const { player, queued } = await manager.play({
			guild: "g1",
			voiceChannel: "vc1",
			query: "lofi",
			requester: "user",
		});

		expect(queued.map((track) => track.encoded)).toEqual(["E1"]);
		expect(player.current?.encoded).toBe("E1");
		expect(send).toHaveBeenCalledOnce();
		expect(update).toHaveBeenCalledWith("g1", expect.objectContaining({ track: { encoded: "E1", userData: {} } }), false);
	});

	it("does not return or race a player that is still destroying", async () => {
		const { manager, node } = buildManager();
		let release!: () => void;
		vi.spyOn(node.rest, "destroyPlayer").mockReturnValue(new Promise<void>((resolve) => (release = resolve)));
		const old = manager.create({ guild: "g1", voiceChannel: "vc1" });

		const destroying = old.destroy(false);
		expect(() => manager.create({ guild: "g1", voiceChannel: "vc2" })).toThrow("being destroyed");
		release();
		await destroying;
		const fresh = manager.create({ guild: "g1", voiceChannel: "vc2" });

		expect(fresh).not.toBe(old);
		expect(manager.get("g1")).toBe(fresh);
	});

	it("keeps the destroying guard active during playerDisconnect listeners", async () => {
		const { manager, node } = buildManager();
		vi.spyOn(node.rest, "destroyPlayer").mockResolvedValue(undefined);
		const player = manager.create({ guild: "g1", voiceChannel: "vc1" });
		const attemptedCreate = vi.fn(() => {
			expect(() => manager.create({ guild: "g1", voiceChannel: "vc2" })).toThrow("being destroyed");
		});
		manager.on("playerDisconnect", attemptedCreate);

		await player.destroy();

		expect(attemptedCreate).toHaveBeenCalledOnce();
		expect(manager.get("g1")).toBeUndefined();
	});
});

describe("Moodenglink.handleAutoplay", () => {
	function buildTrack(overrides: Record<string, unknown> = {}) {
		return {
			encoded: "PREV",
			title: "Never Gonna Give You Up",
			author: "Rick Astley",
			identifier: "id-1",
			uri: "https://youtu.be/dQw4w9WgXcQ",
			sourceName: "youtube",
			requester: "userA",
			duration: 213000,
			...overrides,
		} as never;
	}

	it("queues a fresh related track and preserves the requester", async () => {
		const { manager } = buildManager();
		const player = manager.create({ guild: "g1", voiceChannel: "vc1" });

		const searchSpy = vi.spyOn(manager, "search").mockResolvedValue({
			loadType: "search",
			tracks: [{ identifier: "id-2", uri: "u2", encoded: "E2", requester: undefined } as never],
			playlist: null,
			exception: null,
		});
		const playSpy = vi.spyOn(player, "play").mockResolvedValue(player);

		const previous = buildTrack();
		const ok = await manager.handleAutoplay(player, previous);

		expect(ok).toBe(true);
		// YouTube source should reach for the RD radio mix first.
		expect(searchSpy.mock.calls[0][0]).toMatchObject({ query: expect.stringContaining("list=RD") });
		expect(player.queue).toHaveLength(1);
		expect((player.queue[0] as { requester: unknown }).requester).toBe("userA");
		expect(playSpy).toHaveBeenCalled();
	});

	it("never repeats the finished track or anything already heard", async () => {
		const { manager } = buildManager();
		const player = manager.create({ guild: "g1", voiceChannel: "vc1" });
		player.queue.previous = [buildTrack({ identifier: "heard", uri: "u-heard" })];

		vi.spyOn(manager, "search").mockResolvedValue({
			loadType: "search",
			tracks: [
				{ identifier: "id-1", uri: "https://youtu.be/dQw4w9WgXcQ", encoded: "SAME" } as never, // == previous
				{ identifier: "heard", uri: "u-heard", encoded: "HEARD" } as never, // already played
				{ identifier: "id-new", uri: "u-new", encoded: "NEW" } as never,
			],
			playlist: null,
			exception: null,
		});
		vi.spyOn(player, "play").mockResolvedValue(player);

		await manager.handleAutoplay(player, buildTrack());
		expect((player.queue[0] as { identifier: string }).identifier).toBe("id-new");
	});

	it("stamps a configured autoplayRequester instead of inheriting the previous one", async () => {
		const { manager } = buildManager({ autoplayRequester: "AUTOPLAY" });
		const player = manager.create({ guild: "g1", voiceChannel: "vc1" });
		vi.spyOn(manager, "search").mockResolvedValue({
			loadType: "search",
			tracks: [{ identifier: "id-2", uri: "u2", encoded: "E2" } as never],
			playlist: null,
			exception: null,
		});
		vi.spyOn(player, "play").mockResolvedValue(player);

		await manager.handleAutoplay(player, buildTrack());
		expect((player.queue[0] as { requester: unknown }).requester).toBe("AUTOPLAY");
	});

	it("honours an explicit null autoplayRequester", async () => {
		const { manager } = buildManager({ autoplayRequester: null });
		const player = manager.create({ guild: "g1", voiceChannel: "vc1" });
		vi.spyOn(manager, "search").mockResolvedValue({
			loadType: "search",
			tracks: [{ identifier: "id-2", uri: "u2", encoded: "E2" } as never],
			playlist: null,
			exception: null,
		});
		vi.spyOn(player, "play").mockResolvedValue(player);

		await manager.handleAutoplay(player, buildTrack());
		expect((player.queue[0] as { requester: unknown }).requester).toBeNull();
	});

	it("returns false when no candidates come back", async () => {
		const { manager } = buildManager();
		const player = manager.create({ guild: "g1", voiceChannel: "vc1" });
		vi.spyOn(manager, "search").mockResolvedValue({ loadType: "empty", tracks: [], playlist: null, exception: null });
		const playSpy = vi.spyOn(player, "play").mockResolvedValue(player);

		expect(await manager.handleAutoplay(player, buildTrack())).toBe(false);
		expect(playSpy).not.toHaveBeenCalled();
	});
});

describe("Moodenglink.resumePlayers", () => {
	function seedTrack(overrides: Record<string, unknown> = {}) {
		return { encoded: "ENC", identifier: "id-1", uri: "u", duration: 213000, isStream: false, position: 0, pluginInfo: {}, userData: {}, ...overrides };
	}

	async function seedStore(store: MemoryStore, node: Node, data: Record<string, unknown>) {
		await store.set(
			"moodenglink:player:g1",
			JSON.stringify({
				guild: "g1",
				voiceChannel: "vc1",
				node: node.id,
				volume: 100,
				repeatMode: 0,
				autoplay: false,
				queue: [],
				previous: [],
				...data,
			}),
		);
	}

	it("resumes playback from the persisted position, not from 0", async () => {
		const store = new MemoryStore();
		const { manager, node } = buildManager({ store, autoResume: true });
		await seedStore(store, node, { position: 90_000, current: seedTrack() });
		const playSpy = vi.spyOn(Player.prototype, "play").mockResolvedValue(undefined as never);

		await manager.resumePlayers(node);

		expect(playSpy).toHaveBeenCalledWith({ track: expect.objectContaining({ encoded: "ENC" }), startTime: 90_000, paused: false });
	});

	it("clamps a persisted position past the track duration", async () => {
		const store = new MemoryStore();
		const { manager, node } = buildManager({ store, autoResume: true });
		await seedStore(store, node, { position: 999_999_999, current: seedTrack({ duration: 213_000 }) });
		const playSpy = vi.spyOn(Player.prototype, "play").mockResolvedValue(undefined as never);

		await manager.resumePlayers(node);

		expect(playSpy).toHaveBeenCalledWith(expect.objectContaining({ startTime: 213_000 }));
	});

	it("resumes a live stream from 0", async () => {
		const store = new MemoryStore();
		const { manager, node } = buildManager({ store, autoResume: true });
		await seedStore(store, node, { position: 90_000, current: seedTrack({ isStream: true }) });
		const playSpy = vi.spyOn(Player.prototype, "play").mockResolvedValue(undefined as never);

		await manager.resumePlayers(node);

		expect(playSpy).toHaveBeenCalledWith(expect.objectContaining({ startTime: 0 }));
	});

	it("does not duplicate or replay a player that already exists", async () => {
		const store = new MemoryStore();
		const { manager, node } = buildManager({ store, autoResume: true });
		await seedStore(store, node, { current: seedTrack(), queue: [seedTrack({ encoded: "QUEUED" })] });
		const existing = manager.create({ guild: "g1", voiceChannel: "vc1" });
		existing.queue.add(seedTrack({ encoded: "LOCAL" }) as never);
		const playSpy = vi.spyOn(existing, "play");
		playSpy.mockClear();

		await manager.resumePlayers(node);

		expect(manager.get("g1")).toBe(existing);
		expect(existing.queue.map((item) => (item as { encoded: string }).encoded)).toEqual(["LOCAL"]);
		expect(playSpy).not.toHaveBeenCalled();
	});

	it("restores paused state, filters, data, and unresolved queue items", async () => {
		const store = new MemoryStore();
		const { manager, node } = buildManager({ store, autoResume: true });
		await seedStore(store, node, {
			paused: true,
			data: { locale: "th" },
			filters: { volume: 0.8, timescale: { speed: 1.1, pitch: 1, rate: 1 } },
			current: seedTrack(),
			queue: [{ unresolved: true, title: "Pending", author: "Artist", sourceName: "youtube" }],
		});
		const playSpy = vi.spyOn(Player.prototype, "play").mockResolvedValue(undefined as never);

		await manager.resumePlayers(node);

		const player = manager.get("g1")!;
		expect(player.data.locale).toBe("th");
		expect(player.filters.volume).toBe(0.8);
		expect(player.filters.timescale?.speed).toBe(1.1);
		expect(player.queue[0]).toMatchObject({ unresolved: true, title: "Pending" });
		expect(typeof (player.queue[0] as { resolve?: unknown }).resolve).toBe("function");
		expect(playSpy).toHaveBeenCalledWith(expect.objectContaining({ paused: true }));
	});

	it("surfaces persistence failures through storeError", async () => {
		const store = {
			keys: vi.fn().mockRejectedValue(new Error("redis offline")),
			get: vi.fn(),
			set: vi.fn(),
			delete: vi.fn(),
		};
		const { manager, node } = buildManager({ store, autoResume: true });
		const storeError = vi.fn();
		manager.on("storeError", storeError);

		await manager.resumePlayers(node);

		expect(storeError).toHaveBeenCalledWith(expect.objectContaining({ message: "redis offline" }), "keys");
	});
});

describe("Moodenglink.updateVoiceState", () => {
	let ctx: ReturnType<typeof buildManager>;

	beforeEach(() => {
		ctx = buildManager();
	});

	it("forwards a complete voice state to the node with channelId", async () => {
		const { manager, node } = ctx;
		const update = vi.spyOn(node.rest, "updatePlayer").mockResolvedValue({} as never);
		const player = manager.create({ guild: "g1", voiceChannel: "vc1" });

		manager.updateVoiceState({
			t: "VOICE_STATE_UPDATE",
			d: { guild_id: "g1", user_id: "bot-1", session_id: "sess", channel_id: "vc1" },
		});
		manager.updateVoiceState({
			t: "VOICE_SERVER_UPDATE",
			d: { guild_id: "g1", token: "tok", endpoint: "eu.discord.media:443" },
		});
		await new Promise((r) => setTimeout(r, 0)); // let the async voice update flush

		expect(player.voiceState.sessionId).toBe("sess");
		expect(update).toHaveBeenCalledWith("g1", {
			voice: { token: "tok", endpoint: "eu.discord.media:443", sessionId: "sess", channelId: "vc1" },
		});
	});

	it("ignores voice states for other users", () => {
		const { manager, node } = ctx;
		const update = vi.spyOn(node.rest, "updatePlayer").mockResolvedValue({} as never);
		manager.create({ guild: "g1", voiceChannel: "vc1" });

		manager.updateVoiceState({
			t: "VOICE_STATE_UPDATE",
			d: { guild_id: "g1", user_id: "someone-else", session_id: "sess", channel_id: "vc1" },
		});
		expect(update).not.toHaveBeenCalled();
	});

	it("can retain a disconnected player when voice auto-destroy is disabled", () => {
		const { manager } = buildManager({ playerBehavior: { destroyOnVoiceDisconnect: false } });
		const disconnected = vi.fn();
		manager.on("playerDisconnect", disconnected);
		const player = manager.create({ guild: "g1", voiceChannel: "vc1" });

		manager.updateVoiceState({
			t: "VOICE_STATE_UPDATE",
			d: { guild_id: "g1", user_id: "bot-1", session_id: "sess", channel_id: null },
		});

		expect(manager.get("g1")).toBe(player);
		expect(player.voiceChannel).toBeNull();
		expect(player.state).toBe("DISCONNECTED");
		expect(disconnected).toHaveBeenCalledWith(player, "vc1");
	});

	it("destroys on Discord voice removal with a typed reason by default", async () => {
		const { manager, node } = buildManager();
		vi.spyOn(node.rest, "destroyPlayer").mockResolvedValue(undefined);
		const destroyed = vi.fn();
		manager.on("playerDestroy", destroyed);
		const player = manager.create({ guild: "g1", voiceChannel: "vc1" });

		manager.updateVoiceState({
			t: "VOICE_STATE_UPDATE",
			d: { guild_id: "g1", user_id: "bot-1", session_id: "sess", channel_id: null },
		});
		await new Promise((resolve) => setTimeout(resolve, 0));

		expect(manager.get("g1")).toBeUndefined();
		expect(destroyed).toHaveBeenCalledWith(player, { reason: "voice-disconnect", disconnected: false });
	});
});
