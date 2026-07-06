import { describe, expect, it } from "vitest";
import { Equalizers } from "../src/utils/equalizers";

describe("Equalizers", () => {
	it("exposes named presets", () => {
		expect(Object.keys(Equalizers)).toEqual(
			expect.arrayContaining(["flat", "bass", "soft", "treble", "pop", "party", "rock", "electronic", "radio"]),
		);
	});

	it("each preset has 15 sequential bands with in-range gains", () => {
		for (const [name, bands] of Object.entries(Equalizers)) {
			expect(bands, name).toHaveLength(15);
			bands.forEach((b, i) => {
				expect(b.band, name).toBe(i);
				expect(b.gain, name).toBeGreaterThanOrEqual(-0.25);
				expect(b.gain, name).toBeLessThanOrEqual(1.0);
			});
		}
	});
});
