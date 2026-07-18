import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Moodenglink } from "../src/classes/Moodenglink";
import type { Node } from "../src/classes/Node";
import type { Player } from "../src/classes/Player";
import { RepeatMode, type Track } from "../src/types/Player";
import { EventTypes, type TrackEndEvent, type TrackEndReason } from "../src/types/Op";
import { buildTrack } from "../src/utils/utils";
import { makeStats, makeTrackData } from "./helpers";

function track(id: string): Track {
	return buildTrack(makeTrackData({ identifier: id, uri: `https://x/${id}` }, id));
}

function endEvent(reason: TrackEndReason, encoded = "OLD"): TrackEndEvent {
	return {
		op: "event" as never,
		type: EventTypes.TrackEndEvent,
		guildId: "g1",
		track: makeTrackData({}, encoded),
		reason,
	};
}

function build(extra: Record<string, unknown> = {}) {
	const manager = new Moodenglink({
		nodes: [{ host: "h", port: 1, password: "p", identifier: "n1" }],
		clientId: "bot",
		send: vi.fn(),
		...extra,
	});
	const node = manager.nodes.get("n1") as Node;
	node.connected = true;
	node.stats = makeStats() as never;
	const player = manager.create({ guild: "g1", voiceChannel: "vc1" });
	// Every playback call funnels through updatePlayer — stub the network away.
	const update = vi.spyOn(node.rest, "updatePlayer").mockResolvedValue({} as never);
	return { manager, node, player, update };
}

describe("Player.handleTrackEnd — advancing", () => {
	let ctx: ReturnType<typeof build>;
	beforeEach(() => (ctx = build()));
	afterEach(() => vi.restoreAllMocks());

	it("plays the next queued track on a natural finish and records history", async () => {
		const { player } = ctx;
		player.queue.current = track("t1");
		player.queue.add(track("t2"));

		await player.handleTrackEnd(endEvent("finished"));

		expect(player.current?.encoded).toBe("t2");
		expect(player.queue.length).toBe(0);
		expect(player.queue.previous[0]?.encoded).toBe("t1");
	});

	it("emits queueEnd when the queue drains on a natural finish", async () => {
		const { manager, player } = ctx;
		const queueEnd = vi.fn();
		manager.on("queueEnd", queueEnd);
		player.queue.current = track("t1");

		await player.handleTrackEnd(endEvent("finished"));

		expect(queueEnd).toHaveBeenCalledOnce();
		expect(player.playing).toBe(false);
		expect(player.current).toBeNull();
	});

	it("caps the previous-track history at 50", async () => {
		const { player } = ctx;
		player.queue.previous = Array.from({ length: 50 }, (_, i) => track(`h${i}`));
		player.queue.current = track("newest");

		await player.handleTrackEnd(endEvent("finished"));

		expect(player.queue.previous.length).toBe(50);
		expect(player.queue.previous[0]?.encoded).toBe("newest");
	});

	it("can automatically destroy an empty player after queueEnd", async () => {
		const { manager, node, player } = build({ playerBehavior: { destroyOnQueueEnd: true } });
		vi.spyOn(node.rest, "destroyPlayer").mockResolvedValue(undefined);
		const destroyed = vi.fn();
		manager.on("playerDestroy", destroyed);
		player.queue.current = track("t1");

		await player.handleTrackEnd(endEvent("finished"));

		expect(manager.get("g1")).toBeUndefined();
		expect(destroyed).toHaveBeenCalledWith(player, { reason: "queue-end", disconnected: true });
	});
});

describe("Player.handleTrackEnd — repeat modes", () => {
	let ctx: ReturnType<typeof build>;
	beforeEach(() => (ctx = build()));
	afterEach(() => vi.restoreAllMocks());

	it("TRACK repeat replays the same track on a natural finish", async () => {
		const { player } = ctx;
		player.setRepeatMode(RepeatMode.TRACK);
		player.queue.current = track("t1");
		player.queue.add(track("t2"));

		await player.handleTrackEnd(endEvent("finished"));

		expect(player.current?.encoded).toBe("t1"); // replayed, not advanced
		expect(player.queue[0]?.encoded).toBe("t2"); // next track untouched
	});

	it("QUEUE repeat re-queues the finished track at the tail", async () => {
		const { player } = ctx;
		player.setRepeatMode(RepeatMode.QUEUE);
		player.queue.current = track("t1");
		player.queue.add(track("t2"));

		await player.handleTrackEnd(endEvent("finished"));

		expect(player.current?.encoded).toBe("t2");
		expect(player.queue.at(-1)?.encoded).toBe("t1"); // cycled back in
	});

	it("does NOT repeat when the user skipped (regression: skip + TRACK repeat)", async () => {
		const { player } = ctx;
		player.setRepeatMode(RepeatMode.TRACK);
		player.queue.current = track("t1");
		player.queue.add(track("t2"));

		await player.skip(); // sets the skip intent, ends the track
		await player.handleTrackEnd(endEvent("stopped"));

		expect(player.current?.encoded).toBe("t2"); // advanced, did not replay t1
	});

	it("does NOT repeat on a load failure — it advances instead", async () => {
		const { player } = ctx;
		player.setRepeatMode(RepeatMode.TRACK);
		player.queue.current = track("t1");
		player.queue.add(track("t2"));

		await player.handleTrackEnd(endEvent("loadFailed"));

		expect(player.current?.encoded).toBe("t2");
	});
});

describe("Player.handleTrackEnd — stop vs skip intent", () => {
	let ctx: ReturnType<typeof build>;
	beforeEach(() => (ctx = build()));
	afterEach(() => vi.restoreAllMocks());

	it("stop() ends playback cleanly even with TRACK repeat on (regression)", async () => {
		const { manager, player } = ctx;
		player.setRepeatMode(RepeatMode.TRACK);
		player.queue.current = track("t1");
		const queueEnd = vi.fn();
		manager.on("queueEnd", queueEnd);

		await player.stop(false); // keep queue, but end playback
		await player.handleTrackEnd(endEvent("stopped"));

		expect(queueEnd).toHaveBeenCalledOnce();
		expect(player.playing).toBe(false);
		expect(player.current).toBeNull();
	});

	it("stop() records the stopped track in history so previous() can reach it", async () => {
		const { player } = ctx;
		player.queue.current = track("t1");

		await player.stop();
		await player.handleTrackEnd(endEvent("stopped", "t1"));

		expect(player.queue.previous[0]?.encoded).toBe("t1");
	});

	it("stop(false) with a non-empty queue ends playback without a misleading queueEnd", async () => {
		const { manager, player } = ctx;
		const queueEnd = vi.fn();
		manager.on("queueEnd", queueEnd);
		player.queue.current = track("t1");
		player.queue.add(track("t2")); // queue is NOT empty

		await player.stop(false);
		await player.handleTrackEnd(endEvent("stopped"));

		expect(queueEnd).not.toHaveBeenCalled(); // queue still has t2
		expect(player.playing).toBe(false);
		expect(player.queue.length).toBe(1); // preserved
	});

	it("stop() does not trigger autoplay (regression)", async () => {
		const { manager, player } = ctx;
		player.setAutoplay(true);
		player.queue.current = track("t1");
		const autoplay = vi.spyOn(manager, "handleAutoplay").mockResolvedValue(true);

		await player.stop();
		await player.handleTrackEnd(endEvent("stopped"));

		expect(autoplay).not.toHaveBeenCalled();
	});

	it("a stop() with no resulting trackEnd does not leak into the next track's finish", async () => {
		const { player } = ctx;
		await player.stop(); // sets 'stop' intent, but pretend nothing was playing (no trackEnd)

		// A new track starts, then finishes naturally — must advance, not queueEnd.
		player.queue.current = track("t1");
		player.queue.add(track("t2"));
		player.handleTrackStart({ op: "event" as never, type: EventTypes.TrackStartEvent, guildId: "g1", track: makeTrackData({}, "t1") });
		await player.handleTrackEnd(endEvent("finished"));

		expect(player.current?.encoded).toBe("t2"); // advanced normally, intent was cleared
	});

	it("replaced and cleanup ends are no-ops (no advance, no queueEnd)", async () => {
		const { manager, player, update } = ctx;
		const queueEnd = vi.fn();
		manager.on("queueEnd", queueEnd);
		player.queue.current = track("t1");
		player.queue.add(track("t2"));
		update.mockClear();

		await player.handleTrackEnd(endEvent("replaced"));
		await player.handleTrackEnd(endEvent("cleanup"));

		expect(queueEnd).not.toHaveBeenCalled();
		expect(update).not.toHaveBeenCalled();
		expect(player.queue.length).toBe(1); // untouched
	});
});

describe("Player.position interpolation", () => {
	afterEach(() => {
		vi.useRealTimers();
		vi.restoreAllMocks();
	});

	it("interpolates the live position from elapsed time while playing", () => {
		vi.useFakeTimers();
		const { player } = build();
		player.queue.current = track("t1");
		player.playing = true;
		player.paused = false;

		player.updateState({ time: 1, position: 1000, connected: true, ping: 5 });
		expect(player.position).toBe(1000);

		vi.advanceTimersByTime(2000);
		expect(player.position).toBe(3000); // 1000 + 2000ms elapsed
	});

	it("clamps the interpolated position to the track duration", () => {
		vi.useFakeTimers();
		const { player } = build();
		const t = track("t1");
		player.queue.current = t;
		player.playing = true;

		player.updateState({ time: 1, position: t.duration - 500, connected: true, ping: 5 });
		vi.advanceTimersByTime(5000);
		expect(player.position).toBe(t.duration); // never runs past the end
	});

	it("freezes the position while paused", async () => {
		vi.useFakeTimers();
		const { player } = build();
		player.queue.current = track("t1");
		player.playing = true;

		player.updateState({ time: 1, position: 1000, connected: true, ping: 5 });
		vi.advanceTimersByTime(2000); // live position is now 3000
		await player.pause();

		vi.advanceTimersByTime(10_000);
		expect(player.position).toBe(3000); // frozen at the moment of pausing
	});
});

describe("Player.handleTrackEnd — autoplay gating", () => {
	let ctx: ReturnType<typeof build>;
	beforeEach(() => (ctx = build()));
	afterEach(() => vi.restoreAllMocks());

	it("fires autoplay on a natural finish once the queue is empty", async () => {
		const { manager, player } = ctx;
		player.setAutoplay(true);
		player.queue.current = track("t1");
		const autoplay = vi.spyOn(manager, "handleAutoplay").mockResolvedValue(true);

		await player.handleTrackEnd(endEvent("finished"));

		expect(autoplay).toHaveBeenCalledOnce();
	});

	it("does not autoplay after a manual skip that empties the queue", async () => {
		const { manager, player } = ctx;
		player.setAutoplay(true);
		player.queue.current = track("t1");
		const autoplay = vi.spyOn(manager, "handleAutoplay").mockResolvedValue(true);

		await player.skip();
		await player.handleTrackEnd(endEvent("stopped"));

		expect(autoplay).not.toHaveBeenCalled();
	});
});
