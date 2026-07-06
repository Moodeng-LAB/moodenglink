import { afterEach, describe, expect, it, vi } from "vitest";
import { Moodenglink } from "../src/classes/Moodenglink";
import type { Node } from "../src/classes/Node";
import type { Player } from "../src/classes/Player";
import { EventTypes, type WebSocketClosedEvent } from "../src/types/Op";
import { makeStats } from "./helpers";

function buildPlayer(options: Record<string, unknown> = {}) {
	const send = vi.fn();
	const manager = new Moodenglink({
		nodes: [{ host: "h", port: 1, password: "p", identifier: "n1" }],
		clientId: "bot",
		send,
		...options,
	});
	const node = manager.nodes.get("n1") as Node;
	node.connected = true;
	node.stats = makeStats() as never;
	const player = manager.create({ guild: "g1", voiceChannel: "vc1" });
	send.mockClear(); // ignore the initial connect() OP4
	return { manager, node, player, send };
}

function closed(code: number): WebSocketClosedEvent {
	return { op: "event" as never, type: EventTypes.WebSocketClosedEvent, guildId: "g1", code, reason: "", byRemote: true };
}

afterEach(() => vi.useRealTimers());

describe("Player voice hardening", () => {
	it("reconnects (re-sends OP4) after a recoverable close, with backoff", async () => {
		vi.useFakeTimers();
		const { player, send } = buildPlayer();

		const p = player.handleSocketClosed(closed(4015)); // voice server crashed
		expect(send).not.toHaveBeenCalled(); // waits for backoff first
		await vi.advanceTimersByTimeAsync(1000);
		await p;

		expect(send).toHaveBeenCalledTimes(1);
		expect(send.mock.calls[0][1].d.channel_id).toBe("vc1");
	});

	it("ignores fatal close codes", async () => {
		const { player, send } = buildPlayer();
		await player.handleSocketClosed(closed(4004)); // authentication failed
		expect(send).not.toHaveBeenCalled();
	});

	it("does not reconnect when intentionally disconnecting", async () => {
		const { player, send } = buildPlayer();
		(player as unknown as { state: string }).state = "DISCONNECTING";
		await player.handleSocketClosed(closed(4015));
		expect(send).not.toHaveBeenCalled();
	});

	it("gives up after the configured number of tries", async () => {
		vi.useFakeTimers();
		const { player, send } = buildPlayer({ voiceReconnectTries: 2, voiceReconnectDelay: 10 });

		for (let i = 0; i < 2; i++) {
			const p = player.handleSocketClosed(closed(4015));
			await vi.advanceTimersByTimeAsync(10 * (i + 1));
			await p;
		}
		expect(send).toHaveBeenCalledTimes(2);

		// Third attempt is over the limit -> no further reconnect.
		await player.handleSocketClosed(closed(4015));
		expect(send).toHaveBeenCalledTimes(2);
	});

	it("resets the attempt counter once the voice connection is healthy", async () => {
		vi.useFakeTimers();
		const { player, send } = buildPlayer({ voiceReconnectTries: 2, voiceReconnectDelay: 10 });

		const p = player.handleSocketClosed(closed(4015));
		await vi.advanceTimersByTimeAsync(10);
		await p;
		expect(send).toHaveBeenCalledTimes(1);

		// A connected playerUpdate clears the counter, so tries are available again.
		player.updateState({ time: 1, position: 0, connected: true, ping: 5 });

		const p2 = player.handleSocketClosed(closed(4015));
		await vi.advanceTimersByTimeAsync(10);
		await p2;
		expect(send).toHaveBeenCalledTimes(2);
	});
});
