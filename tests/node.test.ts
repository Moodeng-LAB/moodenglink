import { afterEach, describe, expect, it, vi } from "vitest";
import { Node } from "../src/classes/Node";
import type { Moodenglink } from "../src/classes/Moodenglink";
import { EventTypes } from "../src/types/Op";
import type { NodeInfo } from "../src/types/Node";
import { makeTrackData } from "./helpers";
import { makeStats } from "./helpers";

const fakeManager = {} as Moodenglink;

afterEach(() => {
	vi.useRealTimers();
	vi.restoreAllMocks();
});

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

	it("validates advertised sources, filters, and plugins", () => {
		const node = new Node(fakeManager, { host: "h" });
		node.info = {
			sourceManagers: ["youtube", "soundcloud"],
			filters: ["timescale"],
			plugins: [{ name: "lavalyrics-plugin", version: "1" }],
		} as NodeInfo;

		expect(node.supportsSource("YouTube")).toBe(true);
		expect(node.supportsFilter("TIMESCALE")).toBe(true);
		expect(node.hasPlugin("LavaLyrics-Plugin")).toBe(true);
		expect(node.validateCapabilities({ sources: ["youtube", "spotify"], plugins: ["missing"] })).toMatchObject({
			available: true,
			valid: false,
			missingSources: ["spotify"],
			missingPlugins: ["missing"],
		});
	});

	it("reconnects after a remote clean close and only resets attempts on READY", () => {
		vi.useFakeTimers();
		const manager = {
			emit: vi.fn(),
			options: { clientId: "bot", autoMove: true },
			players: new Map(),
			nodes: new Map(),
			handleNodeFailover: vi.fn().mockResolvedValue(undefined),
		} as unknown as Moodenglink;
		const node = new Node(manager, { host: "h", retryDelay: 0 });
		const socket = {} as never;
		node.socket = socket;
		node.connected = true;
		node.reconnectAttempts = 2;
		const connect = vi.spyOn(node, "connect").mockImplementation(() => {});

		(node as unknown as { onOpen(socket: unknown): void }).onOpen(socket);
		expect(node.reconnectAttempts).toBe(2);
		(node as unknown as { onClose(socket: unknown, code: number, reason: string): void }).onClose(socket, 1000, "restart");
		vi.runAllTimers();

		expect(connect).toHaveBeenCalledOnce();
		expect(node.reconnectAttempts).toBe(3);
	});

	it("ignores events arriving from a player's old node", () => {
		const handleTrackEnd = vi.fn();
		const player = { node: {}, handleTrackEnd };
		const manager = { players: new Map([["g1", player]]), emit: vi.fn() } as unknown as Moodenglink;
		const oldNode = new Node(manager, { host: "old" });

		(oldNode as unknown as { handleEvent(payload: unknown): void }).handleEvent({
			op: "event",
			type: EventTypes.TrackEndEvent,
			guildId: "g1",
			track: makeTrackData({}, "OLD"),
			reason: "finished",
		});

		expect(handleTrackEnd).not.toHaveBeenCalled();
	});

	it("reconciles persisted players when Lavalink resumed but local state is empty", async () => {
		const resumePlayers = vi.fn().mockResolvedValue(undefined);
		const manager = {
			emit: vi.fn(),
			options: { clientId: "bot", autoResume: true },
			players: new Map(),
			nodes: new Map(),
			resumePlayers,
		} as unknown as Moodenglink;
		const node = new Node(manager, { host: "h" });
		const socket = { readyState: 1 } as never;
		node.socket = socket;
		vi.spyOn(node.rest, "updateSession").mockResolvedValue({ resuming: true, timeout: 60 });
		vi.spyOn(node.rest, "getInfo").mockResolvedValue({
			sourceManagers: [],
			filters: [],
			plugins: [],
		} as never);

		await (node as unknown as { handleReady(socket: unknown, payload: { sessionId: string; resumed: boolean }): Promise<void> }).handleReady(socket, {
			sessionId: "session",
			resumed: true,
		});

		expect(resumePlayers).toHaveBeenCalledWith(node, false);
	});
});
