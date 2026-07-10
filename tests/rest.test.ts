import { afterEach, describe, expect, it, vi } from "vitest";
import { Node } from "../src/classes/Node";
import { RestError } from "../src/classes/Rest";
import type { Moodenglink } from "../src/classes/Moodenglink";

// The Rest layer only needs `emit` off the manager (for debug logs).
const fakeManager = { emit: vi.fn() } as unknown as Moodenglink;

function makeNode(opts: Record<string, unknown> = {}) {
	// retryDelay: 0 keeps the incremental backoff instant in tests.
	return new Node(fakeManager, { host: "localhost", retryAmount: 3, retryDelay: 0, ...opts });
}

afterEach(() => vi.unstubAllGlobals());

describe("Rest.request retry policy", () => {
	it("retries transient GET failures up to retryAmount, then throws", async () => {
		const node = makeNode();
		const fetchMock = vi.fn().mockRejectedValue(new Error("ECONNRESET"));
		vi.stubGlobal("fetch", fetchMock);

		await expect(node.rest.getInfo()).rejects.toThrow("ECONNRESET");
		expect(fetchMock).toHaveBeenCalledTimes(3);
	});

	it("recovers when a retried GET eventually succeeds", async () => {
		const node = makeNode();
		const fetchMock = vi
			.fn()
			.mockRejectedValueOnce(new Error("flaky"))
			.mockResolvedValueOnce(new Response(JSON.stringify({ ok: 1 }), { status: 200 }));
		vi.stubGlobal("fetch", fetchMock);

		await expect(node.rest.getInfo()).resolves.toEqual({ ok: 1 });
		expect(fetchMock).toHaveBeenCalledTimes(2);
	});

	it("never retries a non-idempotent PATCH write (a lost response must not replay playback)", async () => {
		const node = makeNode();
		node.rest.sessionId = "sess";
		const fetchMock = vi.fn().mockRejectedValue(new Error("timeout"));
		vi.stubGlobal("fetch", fetchMock);

		await expect(node.rest.updatePlayer("g1", { paused: true })).rejects.toThrow("timeout");
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});

	it("never retries HTTP (4xx) responses", async () => {
		const node = makeNode();
		const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ message: "bad" }), { status: 404 }));
		vi.stubGlobal("fetch", fetchMock);

		await expect(node.rest.getInfo()).rejects.toBeInstanceOf(RestError);
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});
});
