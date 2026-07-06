import { afterEach, describe, expect, it, vi } from "vitest";
import { Moodenglink } from "../src/classes/Moodenglink";
import { Structure } from "../src/classes/Structure";
import { Queue } from "../src/classes/Queue";
import { Player } from "../src/classes/Player";
import type { Node } from "../src/classes/Node";
import { makeStats } from "./helpers";

afterEach(() => Structure.reset());

describe("Structure", () => {
	it("returns built-in structures by default", () => {
		expect(Structure.get("Queue")).toBe(Queue);
		expect(Structure.get("Player")).toBe(Player);
	});

	it("extends a structure and exposes the subclass", () => {
		const Extended = Structure.extend("Queue", (Base) => class MyQueue extends Base {
			public tag = "custom";
		});
		expect(Structure.get("Queue")).toBe(Extended);
		const q = new (Structure.get("Queue"))();
		expect((q as InstanceType<typeof Extended>).tag).toBe("custom");
		expect(q).toBeInstanceOf(Queue); // still an instanceof the base
	});

	it("makes the manager instantiate the extended Player and Queue", () => {
		Structure.extend("Player", (Base) => class MyPlayer extends Base {
			public greet() {
				return "hi from " + this.guild;
			}
		});

		const manager = new Moodenglink({
			nodes: [{ host: "h", port: 1, password: "p", identifier: "n1" }],
			clientId: "bot",
			send: vi.fn(),
		});
		const node = manager.nodes.get("n1") as Node;
		node.connected = true;
		node.stats = makeStats() as never;

		const player = manager.create({ guild: "g1", voiceChannel: "vc1" });
		expect(player).toBeInstanceOf(Player);
		expect((player as { greet(): string }).greet()).toBe("hi from g1");
	});

	it("reset() restores the built-in implementation", () => {
		Structure.extend("Queue", (Base) => class extends Base {});
		expect(Structure.get("Queue")).not.toBe(Queue);
		Structure.reset("Queue");
		expect(Structure.get("Queue")).toBe(Queue);
	});
});
