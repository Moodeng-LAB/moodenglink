import { describe, expect, it } from "vitest";
import { Node } from "../src/classes/Node";
import type { Moodenglink } from "../src/classes/Moodenglink";
import { makeStats } from "./helpers";

const fakeManager = {} as Moodenglink;

describe("Node", () => {
	it("applies option defaults and derives an identifier", () => {
		const node = new Node(fakeManager, { host: "localhost" });
		expect(node.options.port).toBe(2333);
		expect(node.options.password).toBe("youshallnotpass");
		expect(node.options.retryAmount).toBe(5);
		expect(node.id).toBe("localhost:2333");
	});

	it("keeps a custom identifier", () => {
		const node = new Node(fakeManager, { host: "h", port: 1, identifier: "main" });
		expect(node.id).toBe("main");
	});

	describe("penalties", () => {
		it("is maxed out while disconnected or without stats", () => {
			const node = new Node(fakeManager, { host: "h" });
			expect(node.penalties).toBe(Number.MAX_SAFE_INTEGER);
			node.connected = true; // still no stats
			expect(node.penalties).toBe(Number.MAX_SAFE_INTEGER);
		});

		it("scores a healthy node lower than a busy one", () => {
			const idle = new Node(fakeManager, { host: "a" });
			idle.connected = true;
			idle.stats = makeStats({ playingPlayers: 0, cpu: { cores: 4, systemLoad: 0.05, lavalinkLoad: 0.01 } }) as never;

			const busy = new Node(fakeManager, { host: "b" });
			busy.connected = true;
			busy.stats = makeStats({ playingPlayers: 25, cpu: { cores: 4, systemLoad: 0.9, lavalinkLoad: 0.8 } }) as never;

			expect(idle.penalties).toBeLessThan(busy.penalties);
		});

		it("biases towards a higher priority node", () => {
			const stats = makeStats({ playingPlayers: 5 });
			const low = new Node(fakeManager, { host: "a", priority: 0 });
			low.connected = true;
			low.stats = stats as never;

			const high = new Node(fakeManager, { host: "b", priority: 10 });
			high.connected = true;
			high.stats = stats as never;

			expect(high.penalties).toBeLessThan(low.penalties);
		});
	});
});
