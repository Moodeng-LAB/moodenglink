import { describe, expect, it, vi } from "vitest";
import { Moodenglink } from "../src/classes/Moodenglink";
import type { Node } from "../src/classes/Node";
import { EventTypes } from "../src/types/Op";
import { makeStats } from "./helpers";

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

describe("Player SponsorBlock delegation", () => {
	it("sets, gets and clears categories via REST", async () => {
		const { manager, node } = buildManager();
		const setSpy = vi.spyOn(node.rest, "setSponsorBlockCategories").mockResolvedValue(undefined);
		const getSpy = vi.spyOn(node.rest, "getSponsorBlockCategories").mockResolvedValue(["sponsor"]);
		const clearSpy = vi.spyOn(node.rest, "clearSponsorBlockCategories").mockResolvedValue(undefined);

		const player = manager.create({ guild: "g1", voiceChannel: "vc1" });

		await player.setSponsorBlock(["sponsor", "music_offtopic"]);
		expect(setSpy).toHaveBeenCalledWith("g1", ["sponsor", "music_offtopic"]);

		expect(await player.getSponsorBlock()).toEqual(["sponsor"]);
		expect(getSpy).toHaveBeenCalledWith("g1");

		await player.clearSponsorBlock();
		expect(clearSpy).toHaveBeenCalledWith("g1");
	});
});

describe("Node SponsorBlock event routing", () => {
	it("emits segmentsLoaded and segmentSkipped for the right player", () => {
		const { manager, node } = buildManager();
		const player = manager.create({ guild: "g1", voiceChannel: "vc1" });

		const loaded = vi.fn();
		const skipped = vi.fn();
		manager.on("segmentsLoaded", loaded);
		manager.on("segmentSkipped", skipped);

		const segments = [{ category: "sponsor" as const, start: 1000, end: 5000 }];
		// handleEvent is internal — invoke it directly with a plugin payload.
		(node as unknown as { handleEvent(p: unknown): void }).handleEvent({
			op: "event",
			type: EventTypes.SegmentsLoaded,
			guildId: "g1",
			segments,
		});
		(node as unknown as { handleEvent(p: unknown): void }).handleEvent({
			op: "event",
			type: EventTypes.SegmentSkipped,
			guildId: "g1",
			segment: segments[0],
		});

		expect(loaded).toHaveBeenCalledWith(player, segments, expect.objectContaining({ type: "SegmentsLoaded" }));
		expect(skipped).toHaveBeenCalledWith(player, segments[0], expect.objectContaining({ type: "SegmentSkipped" }));
	});

	it("emits chapter events", () => {
		const { manager, node } = buildManager();
		const player = manager.create({ guild: "g2", voiceChannel: "vc2" });
		const chaptersLoaded = vi.fn();
		const chapterStarted = vi.fn();
		manager.on("chaptersLoaded", chaptersLoaded);
		manager.on("chapterStarted", chapterStarted);

		const chapter = { name: "Intro", start: 0, end: 1000, duration: 1000 };
		const invoke = (node as unknown as { handleEvent(p: unknown): void }).handleEvent.bind(node);
		invoke({ op: "event", type: EventTypes.ChaptersLoaded, guildId: "g2", chapters: [chapter] });
		invoke({ op: "event", type: EventTypes.ChapterStarted, guildId: "g2", chapter });

		expect(chaptersLoaded).toHaveBeenCalledWith(player, [chapter], expect.anything());
		expect(chapterStarted).toHaveBeenCalledWith(player, chapter, expect.anything());
	});
});
