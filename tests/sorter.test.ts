import { Collection } from "@discordjs/collection";
import { describe, expect, it } from "vitest";
import leastLoadNode from "../src/sorter/leastLoadNode";
import leastUsedNode from "../src/sorter/leastUsedNode";
import type { Node } from "../src/classes/Node";
import { makeStats } from "./helpers";

function fakeNode(id: string, overrides: Partial<{ connected: boolean; priority: number; stats: unknown; penalties: number }> = {}) {
	return {
		id,
		connected: overrides.connected ?? true,
		options: { priority: overrides.priority ?? 0 },
		stats: overrides.stats ?? null,
		penalties: overrides.penalties ?? 0,
	} as unknown as Node;
}

function collectionOf(nodes: Node[]): Collection<string, Node> {
	return new Collection(nodes.map((node) => [node.id, node]));
}

describe("leastLoadNode", () => {
	it("drops disconnected nodes and ranks the rest by lowest penalty", () => {
		const low = fakeNode("low", { penalties: 5 });
		const high = fakeNode("high", { penalties: 50 });
		const offline = fakeNode("offline", { connected: false, penalties: -100 });

		const sorted = leastLoadNode(collectionOf([high, offline, low]));

		expect([...sorted.keys()]).toEqual(["low", "high"]);
	});
});

describe("leastUsedNode", () => {
	it("drops disconnected nodes and ranks by fewest playing players", () => {
		const busy = fakeNode("busy", { stats: makeStats({ playingPlayers: 10 }) });
		const idle = fakeNode("idle", { stats: makeStats({ playingPlayers: 1 }) });
		const offline = fakeNode("offline", { connected: false, stats: makeStats({ playingPlayers: 0 }) });

		const sorted = leastUsedNode(collectionOf([busy, offline, idle]));

		expect([...sorted.keys()]).toEqual(["idle", "busy"]);
	});

	it("breaks a tie in player count by higher priority", () => {
		const lowPriority = fakeNode("low-priority", { priority: 0, stats: makeStats({ playingPlayers: 3 }) });
		const highPriority = fakeNode("high-priority", { priority: 10, stats: makeStats({ playingPlayers: 3 }) });

		const sorted = leastUsedNode(collectionOf([lowPriority, highPriority]));

		expect([...sorted.keys()]).toEqual(["high-priority", "low-priority"]);
	});

	it("treats a node with no stats yet as having zero playing players", () => {
		const noStats = fakeNode("no-stats", { stats: null });
		const busy = fakeNode("busy", { stats: makeStats({ playingPlayers: 1 }) });

		const sorted = leastUsedNode(collectionOf([busy, noStats]));

		expect([...sorted.keys()]).toEqual(["no-stats", "busy"]);
	});
});
