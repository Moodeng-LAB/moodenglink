import { beforeEach, describe, expect, it, vi } from "vitest";
import { Moodenglink } from "../src/classes/Moodenglink";
import type { Node } from "../src/classes/Node";
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
});

describe("Moodenglink.idealNode", () => {
	it("returns a connected node and throws when none are up", () => {
		const { manager, node } = buildManager();
		expect(manager.idealNode).toBe(node);
		node.connected = false;
		expect(() => manager.idealNode).toThrow(/No connected nodes/);
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

	it("returns false when no candidates come back", async () => {
		const { manager } = buildManager();
		const player = manager.create({ guild: "g1", voiceChannel: "vc1" });
		vi.spyOn(manager, "search").mockResolvedValue({ loadType: "empty", tracks: [], playlist: null, exception: null });
		const playSpy = vi.spyOn(player, "play").mockResolvedValue(player);

		expect(await manager.handleAutoplay(player, buildTrack())).toBe(false);
		expect(playSpy).not.toHaveBeenCalled();
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
});
