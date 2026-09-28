import { afterEach, describe, expect, it, vi } from "vitest";
import type { Moodenglink } from "../src/classes/Moodenglink";
import { OpCodes } from "../src/types/Op";
import { makeStats, makeTrackData } from "./helpers";

/**
 * Exercises the real WebSocket transport (connect/destroy/message-dispatch/
 * reconnect) against a fake `ws` implementation — the part of Node.ts that
 * tests/node.test.ts deliberately bypasses by calling private handlers
 * directly on a socket-less Node.
 */
const { instances } = vi.hoisted(() => ({ instances: [] as InstanceType<typeof MockWebSocketClass>[] }));

class MockWebSocketClass {
	static readonly OPEN = 1;
	readyState = 1;
	url: string;
	opts: { headers: Record<string, string> };
	listeners = new Map<string, Array<(...args: unknown[]) => void>>();
	closedWith: { code?: number; reason?: string } | null = null;
	removeAllListenersCalled = false;

	constructor(url: string, opts: { headers: Record<string, string> }) {
		this.url = url;
		this.opts = opts;
	}

	on(event: string, listener: (...args: unknown[]) => void): this {
		const list = this.listeners.get(event) ?? [];
		list.push(listener);
		this.listeners.set(event, list);
		return this;
	}

	fire(event: string, ...args: unknown[]): void {
		for (const listener of this.listeners.get(event) ?? []) listener(...args);
	}

	close(code?: number, reason?: string): void {
		this.closedWith = { code, reason };
	}

	removeAllListeners(): void {
		this.removeAllListenersCalled = true;
		this.listeners.clear();
	}
}

vi.mock("ws", () => ({
	default: class extends MockWebSocketClass {
		constructor(url: string, opts: { headers: Record<string, string> }) {
			super(url, opts);
			instances.push(this);
		}
	},
}));

const { Node, NodeCapabilityError } = await import("../src/classes/Node");
const { EventTypes } = await import("../src/types/Op");

function makeManager(overrides: Record<string, unknown> = {}) {
	return {
		emit: vi.fn(),
		options: { clientId: "bot", clientName: "Test/1.0", shards: 1, autoMove: true, ...overrides },
		players: new Map(),
		nodes: new Map(),
		handleNodeFailover: vi.fn().mockResolvedValue(undefined),
		syncResumedPlayers: vi.fn().mockResolvedValue(0),
		resumePlayers: vi.fn().mockResolvedValue(undefined),
	} as unknown as Moodenglink;
}

function latestSocket(): InstanceType<typeof MockWebSocketClass> {
	const socket = instances[instances.length - 1];
	if (!socket) throw new Error("no socket was constructed");
	return socket;
}

afterEach(() => {
	vi.useRealTimers();
	vi.restoreAllMocks();
	instances.length = 0;
});

describe("Node — connect()", () => {
	it("throws without a clientId", () => {
		const node = new Node(makeManager({ clientId: undefined }), { host: "h" });
		expect(() => node.connect()).toThrow(/clientId/);
		expect(instances).toHaveLength(0);
	});

	it("builds the ws(s) URL and auth headers, and wires all four listeners", () => {
		const manager = makeManager();
		const node = new Node(manager, { host: "h", port: 4000, secure: true, password: "pw" });
		node.connect();

		const socket = latestSocket();
		expect(socket.url).toBe("wss://h:4000/v4/websocket");
		expect(socket.opts.headers).toMatchObject({
			Authorization: "pw",
			"User-Id": "bot",
			"Client-Name": "Test/1.0",
			"Num-Shards": "1",
		});
		expect(socket.opts.headers["Session-Id"]).toBeUndefined();
		expect([...socket.listeners.keys()].sort()).toEqual(["close", "error", "message", "open"]);
	});

	it("sends a Session-Id header to resume a previous session", () => {
		const node = new Node(makeManager(), { host: "h" });
		node.rest.sessionId = "sess-123";
		node.connect();
		expect(latestSocket().opts.headers["Session-Id"]).toBe("sess-123");
	});

	it("is a no-op when already connected, already has a socket, or destroyed", () => {
		const node = new Node(makeManager(), { host: "h" });
		node.connect();
		expect(instances).toHaveLength(1);

		node.connect(); // already has a socket
		expect(instances).toHaveLength(1);

		node.connected = true;
		node.socket = null;
		node.connect(); // already connected
		expect(instances).toHaveLength(1);

		node.connected = false;
		node.destroy();
		node.connect(); // destroyed
		expect(instances).toHaveLength(1);
	});
});

describe("Node — destroy()", () => {
	it("closes and detaches a still-open socket, and is idempotent", () => {
		const manager = makeManager();
		const node = new Node(manager, { host: "h" });
		node.connect();
		const socket = latestSocket();

		node.destroy();
		expect(socket.closedWith).toEqual({ code: 1000, reason: "destroy" });
		expect(socket.removeAllListenersCalled).toBe(true);
		expect(node.socket).toBeNull();
		expect(node.connected).toBe(false);
		expect(manager.emit).toHaveBeenCalledWith("nodeDestroy", node);

		vi.mocked(manager.emit).mockClear();
		node.destroy();
		expect(manager.emit).not.toHaveBeenCalled();
	});

	it("clears a pending reconnect timer so it never fires after destroy", () => {
		vi.useFakeTimers();
		const manager = makeManager();
		const node = new Node(manager, { host: "h", retryDelay: 1000 });
		node.connect();
		const socket = latestSocket();

		// onClose() already detaches `socket`; only the reconnect timer remains live.
		(node as unknown as { onClose(socket: unknown, code: number, reason: string): void }).onClose(socket, 1006, "boom");
		expect(node.socket).toBeNull();

		node.destroy();
		vi.runAllTimers();
		expect(instances).toHaveLength(1); // reconnect never fired
	});
});

describe("Node — onMessage dispatch", () => {
	it("ignores frames from a stale or replaced socket", () => {
		const manager = makeManager();
		const node = new Node(manager, { host: "h" });
		node.connect();
		const staleSocket = latestSocket();
		node.socket = null; // simulate a fresh connect() having replaced the socket

		staleSocket.fire("message", Buffer.from(JSON.stringify({ op: OpCodes.STATS, ...makeStats() })));
		expect(node.stats).toBeNull();
	});

	it("swallows malformed frames without throwing", () => {
		const manager = makeManager();
		const node = new Node(manager, { host: "h" });
		node.connect();
		const socket = latestSocket();

		expect(() => socket.fire("message", "{not json")).not.toThrow();
		expect(manager.emit).toHaveBeenCalledWith("debug", expect.stringContaining("Failed to parse frame"));
	});

	it("routes PLAYER_UPDATE only to a player still bound to this node", () => {
		const manager = makeManager();
		const node = new Node(manager, { host: "h" });
		node.connect();
		const socket = latestSocket();

		const bound = { node, updateState: vi.fn() };
		const elsewhere = { node: {}, updateState: vi.fn() };
		manager.players.set("bound", bound);
		manager.players.set("elsewhere", elsewhere);

		const state = { time: 1, position: 2, connected: true, ping: 7 };
		socket.fire("message", JSON.stringify({ op: OpCodes.PLAYER_UPDATE, guildId: "bound", state }));
		expect(bound.updateState).toHaveBeenCalledWith(state);
		expect(node.ping).toBe(7);

		socket.fire("message", JSON.stringify({ op: OpCodes.PLAYER_UPDATE, guildId: "elsewhere", state }));
		expect(elsewhere.updateState).not.toHaveBeenCalled();
	});

	it("stores STATS frames and emits nodeStats", () => {
		const manager = makeManager();
		const node = new Node(manager, { host: "h" });
		node.connect();
		const socket = latestSocket();

		socket.fire("message", JSON.stringify({ op: OpCodes.STATS, ...makeStats({ playingPlayers: 3 }) }));
		expect(node.stats).toMatchObject({ playingPlayers: 3 });
		expect(manager.emit).toHaveBeenCalledWith("nodeStats", node, node.stats);
	});

	it("dispatches EVENT frames to handleEvent and emits the raw payload", () => {
		const manager = makeManager();
		const node = new Node(manager, { host: "h" });
		node.connect();
		const socket = latestSocket();

		const player = { node, handleTrackStart: vi.fn() };
		manager.players.set("g1", player);

		const payload = {
			op: OpCodes.EVENT,
			guildId: "g1",
			type: EventTypes.TrackStartEvent,
			track: makeTrackData(),
		};
		socket.fire("message", JSON.stringify(payload));

		expect(manager.emit).toHaveBeenCalledWith("nodeRaw", payload);
		expect(player.handleTrackStart).toHaveBeenCalledWith(payload);
	});

	it.each([
		["TrackStuckEvent", EventTypes.TrackStuckEvent, "handleTrackStuck"],
		["TrackExceptionEvent", EventTypes.TrackExceptionEvent, "handleTrackException"],
	] as const)("routes %s to player.%s", (_name, type, method) => {
		const manager = makeManager();
		const node = new Node(manager, { host: "h" });
		node.connect();
		const socket = latestSocket();

		const player = { node, [method]: vi.fn() };
		manager.players.set("g1", player);

		const payload = { op: OpCodes.EVENT, guildId: "g1", type, track: makeTrackData() };
		socket.fire("message", JSON.stringify(payload));
		expect(player[method]).toHaveBeenCalledWith(payload);
	});

	it("awaits handleTrackEnd and handleSocketClosed, surfacing rejections as nodeError", async () => {
		const manager = makeManager();
		const node = new Node(manager, { host: "h" });
		node.connect();
		const socket = latestSocket();

		const error = new Error("advance failed");
		const player = { node, handleTrackEnd: vi.fn().mockRejectedValue(error), handleSocketClosed: vi.fn().mockRejectedValue(error) };
		manager.players.set("g1", player);

		socket.fire("message", JSON.stringify({ op: OpCodes.EVENT, guildId: "g1", type: EventTypes.TrackEndEvent, track: makeTrackData(), reason: "finished" }));
		await vi.waitFor(() => expect(manager.emit).toHaveBeenCalledWith("nodeError", node, error));

		vi.mocked(manager.emit).mockClear();
		socket.fire("message", JSON.stringify({ op: OpCodes.EVENT, guildId: "g1", type: EventTypes.WebSocketClosedEvent, code: 4006, reason: "", byRemote: true }));
		await vi.waitFor(() => expect(manager.emit).toHaveBeenCalledWith("nodeError", node, error));
	});

	it.each([
		["lyricsFound", EventTypes.LyricsFoundEvent, "lyrics", { text: "la la" }],
		["lyricsNotFound", EventTypes.LyricsNotFoundEvent, undefined, undefined],
		["lyricsLine", EventTypes.LyricsLineEvent, "line", { line: "la" }],
		["segmentsLoaded", EventTypes.SegmentsLoaded, "segments", [{ category: "sponsor", start: 0, end: 1 }]],
		["segmentSkipped", EventTypes.SegmentSkipped, "segment", { category: "sponsor", start: 0, end: 1 }],
		["chaptersLoaded", EventTypes.ChaptersLoaded, "chapters", [{ name: "c1", start: 0, end: 1, duration: 1 }]],
		["chapterStarted", EventTypes.ChapterStarted, "chapter", { name: "c1", start: 0, end: 1, duration: 1 }],
	] as const)("forwards %s straight to a manager event", (eventName, type, dataKey, data) => {
		const manager = makeManager();
		const node = new Node(manager, { host: "h" });
		node.connect();
		const socket = latestSocket();

		const player = { node };
		manager.players.set("g1", player);

		const payload: Record<string, unknown> = { op: OpCodes.EVENT, guildId: "g1", type };
		if (dataKey) payload[dataKey] = data;
		socket.fire("message", JSON.stringify(payload));

		if (dataKey) expect(manager.emit).toHaveBeenCalledWith(eventName, player, data, payload);
		else expect(manager.emit).toHaveBeenCalledWith(eventName, player, payload);
	});
});

describe("Node — READY handshake", () => {
	function fireReady(socket: InstanceType<typeof MockWebSocketClass>, overrides: Record<string, unknown> = {}) {
		socket.fire("message", JSON.stringify({ op: "ready", sessionId: "sess-1", resumed: false, ...overrides }));
	}

	it("resets reconnectAttempts and connects once session + info succeed", async () => {
		const manager = makeManager();
		const node = new Node(manager, { host: "h" });
		node.reconnectAttempts = 3;
		node.connect();
		const socket = latestSocket();
		vi.spyOn(node.rest, "updateSession").mockResolvedValue({ resuming: true, timeout: 60 });
		vi.spyOn(node.rest, "getInfo").mockResolvedValue({ sourceManagers: [], filters: [], plugins: [] } as never);

		fireReady(socket);
		await vi.waitFor(() => expect(manager.emit).toHaveBeenCalledWith("nodeConnect", node));

		expect(node.connected).toBe(true);
		expect(node.rest.sessionId).toBe("sess-1");
		expect(node.reconnectAttempts).toBe(0);
	});

	it("reports (but tolerates) updateSession/getInfo failures, still connecting with info=null", async () => {
		const manager = makeManager();
		const node = new Node(manager, { host: "h" });
		node.connect();
		const socket = latestSocket();
		const sessionError = new Error("session failed");
		const infoError = new Error("info failed");
		vi.spyOn(node.rest, "updateSession").mockRejectedValue(sessionError);
		vi.spyOn(node.rest, "getInfo").mockRejectedValue(infoError);

		fireReady(socket);
		await vi.waitFor(() => expect(manager.emit).toHaveBeenCalledWith("nodeConnect", node));

		expect(manager.emit).toHaveBeenCalledWith("nodeError", node, sessionError);
		expect(manager.emit).toHaveBeenCalledWith("nodeError", node, infoError);
		expect(node.info).toBeNull();
	});

	it("aborts silently if the socket was replaced while awaiting the handshake", async () => {
		const manager = makeManager();
		const node = new Node(manager, { host: "h" });
		node.connect();
		const socket = latestSocket();
		let resolveSession!: (value: { resuming: boolean; timeout: number }) => void;
		vi.spyOn(node.rest, "updateSession").mockReturnValue(new Promise((resolve) => (resolveSession = resolve)));
		const getInfo = vi.spyOn(node.rest, "getInfo");

		fireReady(socket);
		node.socket = null; // a fresh connect() (or destroy) replaced/cleared the socket mid-await
		resolveSession({ resuming: true, timeout: 60 });

		await vi.waitFor(() => expect(node.rest.updateSession).toHaveBeenCalled());
		expect(getInfo).not.toHaveBeenCalled();
		expect(manager.emit).not.toHaveBeenCalledWith("nodeConnect", node);
	});

	it("emits nodeCapabilityMismatch but still connects when capabilities are non-strict", async () => {
		const manager = makeManager();
		const node = new Node(manager, { host: "h", capabilities: { sources: ["spotify"] } });
		node.connect();
		const socket = latestSocket();
		vi.spyOn(node.rest, "updateSession").mockResolvedValue({ resuming: true, timeout: 60 });
		vi.spyOn(node.rest, "getInfo").mockResolvedValue({ sourceManagers: ["youtube"], filters: [], plugins: [] } as never);

		fireReady(socket);
		await vi.waitFor(() => expect(manager.emit).toHaveBeenCalledWith("nodeConnect", node));

		expect(manager.emit).toHaveBeenCalledWith("nodeCapabilityMismatch", node, expect.objectContaining({ missingSources: ["spotify"] }));
		expect(manager.handleNodeFailover).not.toHaveBeenCalled();
	});

	it("fails the node over and destroys it when capabilities are strict and missing", async () => {
		const manager = makeManager();
		const node = new Node(manager, { host: "h", capabilities: { sources: ["spotify"], strict: true } });
		node.connect();
		const socket = latestSocket();
		vi.spyOn(node.rest, "updateSession").mockResolvedValue({ resuming: true, timeout: 60 });
		vi.spyOn(node.rest, "getInfo").mockResolvedValue({ sourceManagers: ["youtube"], filters: [], plugins: [] } as never);

		fireReady(socket);
		await vi.waitFor(() => expect(manager.handleNodeFailover).toHaveBeenCalledWith(node));
		await vi.waitFor(() => expect(manager.emit).toHaveBeenCalledWith("nodeDestroy", node));

		expect(manager.emit).not.toHaveBeenCalledWith("nodeConnect", node);
	});

	it("flags isNodeLink from /info's isNodelink field, and null before READY", async () => {
		const manager = makeManager();
		const node = new Node(manager, { host: "h" });
		expect(node.isNodeLink).toBeNull();

		node.connect();
		const socket = latestSocket();
		vi.spyOn(node.rest, "updateSession").mockResolvedValue({ resuming: true, timeout: 60 });
		vi.spyOn(node.rest, "getInfo").mockResolvedValue({ sourceManagers: [], filters: [], plugins: [], isNodelink: true } as never);

		fireReady(socket);
		await vi.waitFor(() => expect(manager.emit).toHaveBeenCalledWith("nodeConnect", node));

		expect(node.isNodeLink).toBe(true);
	});

	it("flags isNodeLink false for a plain Lavalink /info response", async () => {
		const manager = makeManager();
		const node = new Node(manager, { host: "h" });
		node.connect();
		const socket = latestSocket();
		vi.spyOn(node.rest, "updateSession").mockResolvedValue({ resuming: true, timeout: 60 });
		vi.spyOn(node.rest, "getInfo").mockResolvedValue({ sourceManagers: [], filters: [], plugins: [] } as never);

		fireReady(socket);
		await vi.waitFor(() => expect(manager.emit).toHaveBeenCalledWith("nodeConnect", node));

		expect(node.isNodeLink).toBe(false);
	});
});

describe("Node — getters", () => {
	it("playerCount counts only players bound to this node", () => {
		const manager = makeManager();
		const node = new Node(manager, { host: "h" });
		const other = new Node(manager, { host: "h2" });
		manager.players.set("a", { node });
		manager.players.set("b", { node });
		manager.players.set("c", { node: other });

		expect(node.playerCount).toBe(2);
	});

	it("penalties folds in the frame-drop/nulled-frame components", () => {
		const node = new Node(makeManager(), { host: "h" });
		node.connected = true;
		node.stats = makeStats({ frameStats: { sent: 3000, deficit: 300, nulled: 30 } }) as never;
		expect(node.penalties).toBeGreaterThan(0);
	});
});

describe("Node — onError", () => {
	it("emits nodeError only for the current socket", () => {
		const manager = makeManager();
		const node = new Node(manager, { host: "h" });
		node.connect();
		const socket = latestSocket();
		const error = new Error("boom");

		socket.fire("error", error);
		expect(manager.emit).toHaveBeenCalledWith("nodeError", node, error);

		vi.mocked(manager.emit).mockClear();
		node.socket = null;
		socket.fire("error", error);
		expect(manager.emit).not.toHaveBeenCalledWith("nodeError", node, error);
	});
});

describe("Node — reconnect()", () => {
	it("backs off incrementally and reconnects on an unexpected close", () => {
		vi.useFakeTimers();
		const manager = makeManager();
		const node = new Node(manager, { host: "h", retryDelay: 100, retryAmount: 5 });
		node.connect();
		const first = latestSocket();

		first.fire("close", 1006, Buffer.from("abnormal"));
		expect(manager.emit).toHaveBeenCalledWith("nodeDisconnect", node, { code: 1006, reason: "abnormal" });
		expect(instances).toHaveLength(1); // not yet reconnected

		vi.advanceTimersByTime(100);
		expect(instances).toHaveLength(2);
		expect(node.reconnectAttempts).toBe(1);
		expect(manager.emit).toHaveBeenCalledWith("nodeReconnect", node);
	});

	it("gives up after retryAmount, fails players over, and destroys itself", async () => {
		vi.useFakeTimers();
		const manager = makeManager();
		const node = new Node(manager, { host: "h", retryDelay: 0, retryAmount: 1 });
		node.connect();
		node.reconnectAttempts = 1; // already exhausted

		const socket = latestSocket();
		socket.fire("close", 1006, Buffer.from(""));

		expect(manager.emit).toHaveBeenCalledWith("nodeError", node, expect.any(Error));
		// handleNodeFailover().finally(destroy) is async — flush microtasks.
		await vi.waitFor(() => expect(manager.handleNodeFailover).toHaveBeenCalledWith(node));
		await vi.waitFor(() => expect(manager.emit).toHaveBeenCalledWith("nodeDestroy", node));
	});
});

describe("NodeCapabilityError", () => {
	it("formats a message listing every missing capability", () => {
		const error = new NodeCapabilityError("main", {
			available: true,
			valid: false,
			missingSources: ["spotify"],
			missingFilters: ["timescale"],
			missingPlugins: ["lavalyrics-plugin"],
		});
		expect(error.message).toContain('sources=spotify');
		expect(error.message).toContain('filters=timescale');
		expect(error.message).toContain('plugins=lavalyrics-plugin');
		expect(error.message).not.toContain("node info unavailable");
	});

	it("notes when node info itself was unavailable", () => {
		const error = new NodeCapabilityError("main", {
			available: false,
			valid: false,
			missingSources: [],
			missingFilters: [],
			missingPlugins: [],
		});
		expect(error.message).toContain("node info unavailable");
	});
});
