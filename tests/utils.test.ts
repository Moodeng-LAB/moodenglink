import { describe, expect, it } from "vitest";
import { buildAutoplaySeed, buildTrack, clamp, formatDuration, isObject, partialTrack, shuffleArray } from "../src/utils/utils";
import { makeTrackData } from "./helpers";

describe("buildTrack", () => {
	it("flattens raw track data and attaches the requester", () => {
		const track = buildTrack(makeTrackData(), "user-123");
		expect(track.encoded).toBe("ENC_DEFAULT");
		expect(track.title).toBe("Never Gonna Give You Up");
		expect(track.author).toBe("Rick Astley");
		expect(track.duration).toBe(213000);
		expect(track.sourceName).toBe("youtube");
		expect(track.requester).toBe("user-123");
		expect(track.pluginInfo).toEqual({});
	});
});

describe("partialTrack", () => {
	it("always keeps `encoded` plus requested fields, drops the rest", () => {
		const track = buildTrack(makeTrackData());
		const partial = partialTrack(track, ["title"]);
		expect(partial.encoded).toBe("ENC_DEFAULT");
		expect(partial.title).toBe("Never Gonna Give You Up");
		expect((partial as Record<string, unknown>).author).toBeUndefined();
	});

	it("returns the track untouched when no partials are given", () => {
		const track = buildTrack(makeTrackData());
		expect(partialTrack(track, [])).toBe(track);
	});
});

describe("formatDuration", () => {
	it("formats mm:ss and hh:mm:ss", () => {
		expect(formatDuration(200_000)).toBe("03:20");
		expect(formatDuration(3_661_000)).toBe("01:01:01");
	});

	it("guards against invalid values", () => {
		expect(formatDuration(-5)).toBe("00:00");
		expect(formatDuration(Number.NaN)).toBe("00:00");
	});
});

describe("clamp", () => {
	it("bounds a number to a range", () => {
		expect(clamp(5, 0, 10)).toBe(5);
		expect(clamp(-1, 0, 10)).toBe(0);
		expect(clamp(99, 0, 10)).toBe(10);
	});
});

describe("isObject", () => {
	it("recognises plain objects only", () => {
		expect(isObject({})).toBe(true);
		expect(isObject([])).toBe(false);
		expect(isObject(null)).toBe(false);
		expect(isObject("x")).toBe(false);
	});
});

describe("shuffleArray", () => {
	it("keeps the same members", () => {
		const arr = [1, 2, 3, 4, 5];
		const shuffled = shuffleArray([...arr]);
		expect(shuffled.slice().sort()).toEqual(arr);
	});
});

describe("buildAutoplaySeed", () => {
	it("strips the ' - Topic' channel suffix and combines with title", () => {
		expect(buildAutoplaySeed({ author: "Silly Fools - Topic", title: "จันทร์" })).toBe("Silly Fools จันทร์");
	});

	it("strips VEVO and official noise", () => {
		expect(buildAutoplaySeed({ author: "ArianaGrandeVEVO", title: "positions" })).toBe("ArianaGrande positions");
		expect(buildAutoplaySeed({ author: "Coldplay Official", title: "Yellow" })).toBe("Coldplay Yellow");
	});

	it("falls back to the title when the author is only noise", () => {
		expect(buildAutoplaySeed({ author: "- Topic", title: "Some Song" })).toBe("Some Song");
	});

	it("falls back to the author when there is no title", () => {
		expect(buildAutoplaySeed({ author: "Radiohead" })).toBe("Radiohead");
	});

	it("returns an empty string when nothing is usable", () => {
		expect(buildAutoplaySeed({})).toBe("");
	});
});
