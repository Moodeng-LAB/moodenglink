import { describe, expect, it, vi } from "vitest";
import { Moodenglink } from "../src/classes/Moodenglink";
import type { Node } from "../src/classes/Node";
import { isUnresolvedTrack, pickClosestTrack } from "../src/utils/utils";
import { buildTrack } from "../src/utils/utils";
import { makeStats, makeTrackData } from "./helpers";

function buildManager() {
	const manager = new Moodenglink({
		nodes: [{ host: "h", port: 1, password: "p", identifier: "n1" }],
		clientId: "bot",
		send: vi.fn(),
	});
	const node = manager.nodes.get("n1") as Node;
	node.connected = true;
	node.stats = makeStats() as never;
	return { manager, node };
}

describe("pickClosestTrack", () => {
	const tracks = [
		buildTrack(makeTrackData({ author: "Other", length: 100000 }, "E0")),
		buildTrack(makeTrackData({ author: "Rick Astley", length: 213000 }, "E1")),
		buildTrack(makeTrackData({ author: "Nope", length: 999000 }, "E2")),
	];

	it("prefers a matching author", () => {
		expect(pickClosestTrack(tracks, { author: "Rick Astley" })?.encoded).toBe("E1");
	});

	it("falls back to closest duration", () => {
		expect(pickClosestTrack(tracks, { duration: 100500 })?.encoded).toBe("E0");
	});

	it("returns the first when nothing matches", () => {
		expect(pickClosestTrack(tracks, { author: "zzz", duration: 1 })?.encoded).toBe("E0");
	});

	it("returns undefined for an empty list", () => {
		expect(pickClosestTrack([], { author: "x" })).toBeUndefined();
	});
});

describe("buildUnresolved", () => {
	it("creates an unresolved track recognised by the guard", () => {
		const { manager } = buildManager();
		const u = manager.buildUnresolved({ title: "Song", author: "Artist", requester: "me" });
		expect(isUnresolvedTrack(u)).toBe(true);
		expect(u.title).toBe("Song");
		expect(typeof u.resolve).toBe("function");
	});

	it("resolves lazily via search and re-stamps the requester", async () => {
		const { manager, node } = buildManager();
		const spy = vi.spyOn(node.rest, "loadTracks").mockResolvedValue({
			loadType: "search",
			data: [makeTrackData({ author: "Artist", length: 200000 }, "RESOLVED")],
		});

		const u = manager.buildUnresolved({ title: "Song", author: "Artist", requester: "user-9" });
		expect(spy).not.toHaveBeenCalled(); // lazy — nothing yet

		const track = await u.resolve();
		expect(spy).toHaveBeenCalledTimes(1);
		expect(track.encoded).toBe("RESOLVED");
		expect(track.requester).toBe("user-9");
	});

	it("throws when nothing can be resolved", async () => {
		const { manager, node } = buildManager();
		vi.spyOn(node.rest, "loadTracks").mockResolvedValue({ loadType: "empty", data: {} });
		const u = manager.buildUnresolved({ title: "Ghost" });
		await expect(u.resolve()).rejects.toThrow(/No playable match/);
	});
});

describe("Player.play resolves unresolved queue items", () => {
	it("resolves an unresolved track at play time and plays the encoded result", async () => {
		const { manager, node } = buildManager();
		vi.spyOn(node.rest, "loadTracks").mockResolvedValue({
			loadType: "search",
			data: [makeTrackData({}, "PLAYABLE")],
		});
		const update = vi.spyOn(node.rest, "updatePlayer").mockResolvedValue({} as never);

		const player = manager.create({ guild: "g1", voiceChannel: "vc1" });
		player.queue.add(manager.buildUnresolved({ title: "Lazy Song" }));

		await player.play();

		expect(player.current?.encoded).toBe("PLAYABLE");
		expect(update).toHaveBeenCalledWith("g1", expect.objectContaining({ track: expect.objectContaining({ encoded: "PLAYABLE" }) }), false);
	});

	it("skips items that fail to resolve and plays the next", async () => {
		const { manager, node } = buildManager();
		vi.spyOn(node.rest, "updatePlayer").mockResolvedValue({} as never);
		vi.spyOn(node.rest, "loadTracks").mockResolvedValue({ loadType: "empty", data: {} });

		const player = manager.create({ guild: "g2", voiceChannel: "vc2" });
		const good = buildTrack(makeTrackData({}, "GOOD"));
		player.queue.add(manager.buildUnresolved({ title: "will-fail" })); // resolves to nothing
		player.queue.add(good);

		await player.play();
		expect(player.current?.encoded).toBe("GOOD");
	});
});
