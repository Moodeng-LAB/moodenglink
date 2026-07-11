import { bench, describe } from "vitest";
import { Moodenglink } from "../src/classes/Moodenglink";
import type { Node } from "../src/classes/Node";
import { OpCodes } from "../src/types/Op";

/** Build a manager with `nodeCount` connected nodes and `playerCount` players. */
function makeManager(nodeCount: number, playerCount: number) {
	const nodes = Array.from({ length: nodeCount }, (_, i) => ({
		host: `h${i}`,
		port: 2333 + i,
		password: "p",
		identifier: `n${i}`,
	}));
	const manager = new Moodenglink({ nodes, clientId: "bot", send: () => {} });

	let i = 0;
	for (const node of manager.nodes.values()) {
		node.connected = true;
		node.stats = {
			players: 0,
			playingPlayers: (i * 7) % 13,
			uptime: 0,
			memory: { free: 0, used: 0, allocated: 0, reservable: 0 },
			cpu: { cores: 4, systemLoad: 0.1 + (i % 5) * 0.05, lavalinkLoad: 0.05 },
			frameStats: { sent: 3000, nulled: i % 4, deficit: i % 3 },
		} as never;
		i++;
	}

	const first = manager.nodes.first() as Node;
	for (let g = 0; g < playerCount; g++) {
		manager.create({ guild: `g${g}`, voiceChannel: "vc" });
	}
	void first;
	return manager;
}

describe("node selection (per play/search)", () => {
	const single = makeManager(1, 200);
	const few = makeManager(3, 200);
	const many = makeManager(12, 500);

	bench("idealNode — 1 node", () => void single.idealNode);
	bench("idealNode — 3 nodes", () => void few.idealNode);
	bench("idealNode — 12 nodes", () => void many.idealNode);
});

describe("Node.playerCount", () => {
	const m = makeManager(4, 1000);
	const node = m.nodes.first() as Node;
	bench("playerCount over 1000 players", () => void node.playerCount);
});

describe("WS message loop (playerUpdate)", () => {
	const m = makeManager(1, 500);
	const node = m.nodes.first() as Node;
	const onMessage = (node as unknown as { onMessage(raw: unknown): unknown }).onMessage.bind(node);
	const frame = Buffer.from(JSON.stringify({ op: OpCodes.PLAYER_UPDATE, guildId: "g0", state: { time: 1, position: 1000, connected: true, ping: 5 } }));
	bench("dispatch one playerUpdate frame", () => void onMessage(frame));
});
