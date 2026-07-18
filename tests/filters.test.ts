import { describe, expect, it, vi } from "vitest";
import { Filters } from "../src/classes/Filters";
import type { Player } from "../src/classes/Player";

function fakePlayer() {
	const updatePlayer = vi.fn().mockResolvedValue(undefined);
	const player = { guild: "g1", node: { rest: { updatePlayer } }, save: vi.fn().mockResolvedValue(undefined) } as unknown as Player;
	return { player, updatePlayer };
}

describe("Filters", () => {
	it("serialises the full payload via toJSON", () => {
		const { player } = fakePlayer();
		const filters = new Filters(player);
		filters.setPreset("bass");
		const json = filters.toJSON();
		expect(json.equalizer).toHaveLength(15);
		expect(json).toHaveProperty("timescale", null);
		expect(json).toHaveProperty("volume", 1);
	});

	it("applies a preset and pushes to the node", async () => {
		const { player, updatePlayer } = fakePlayer();
		const filters = new Filters(player);
		await filters.nightcore();
		expect(filters.timescale).toEqual({ speed: 1.2, pitch: 1.2, rate: 1.0 });
		expect(updatePlayer).toHaveBeenCalledWith("g1", { filters: expect.objectContaining({ timescale: { speed: 1.2, pitch: 1.2, rate: 1.0 } }) });
	});

	it("merges a partial payload with set()", async () => {
		const { player, updatePlayer } = fakePlayer();
		const filters = new Filters(player);
		filters.setPreset("rock");
		await filters.set({ lowPass: { smoothing: 20 } });
		expect(filters.lowPass).toEqual({ smoothing: 20 });
		expect(filters.equalizer).toHaveLength(15); // preserved from the preset
		expect(updatePlayer).toHaveBeenCalledTimes(1);
	});

	it("clears every filter", async () => {
		const { player } = fakePlayer();
		const filters = new Filters(player);
		filters.setPreset("bass").setKaraoke({ level: 1 });
		await filters.clear();
		expect(filters.equalizer).toEqual([]);
		expect(filters.karaoke).toBeNull();
	});
});
