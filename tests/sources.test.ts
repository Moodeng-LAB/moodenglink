import { describe, expect, it } from "vitest";
import { buildSearchIdentifier, isUrl, SearchPrefixes } from "../src/utils/sources";

describe("isUrl", () => {
	it("detects http(s) URLs", () => {
		expect(isUrl("https://youtu.be/x")).toBe(true);
		expect(isUrl("http://x.com")).toBe(true);
		expect(isUrl("never gonna give you up")).toBe(false);
	});
});

describe("buildSearchIdentifier", () => {
	it("passes URLs through untouched", () => {
		expect(buildSearchIdentifier("https://youtu.be/x")).toBe("https://youtu.be/x");
	});

	it("prefixes plain queries by platform", () => {
		expect(buildSearchIdentifier("lofi", "youtube")).toBe("ytsearch:lofi");
		expect(buildSearchIdentifier("lofi", "soundcloud")).toBe("scsearch:lofi");
		expect(buildSearchIdentifier("lofi", "spotify")).toBe("spsearch:lofi");
	});

	it("defaults to youtube", () => {
		expect(buildSearchIdentifier("lofi")).toBe("ytsearch:lofi");
	});

	it("respects an already-prefixed query", () => {
		expect(buildSearchIdentifier("ytmsearch:lofi", "youtube")).toBe("ytmsearch:lofi");
	});

	it("has a prefix for every declared platform", () => {
		for (const prefix of Object.values(SearchPrefixes)) {
			expect(typeof prefix).toBe("string");
			expect(prefix.length).toBeGreaterThan(0);
		}
	});
});
