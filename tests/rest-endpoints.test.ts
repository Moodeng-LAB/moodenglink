import { afterEach, describe, expect, it, vi } from "vitest";
import { Node } from "../src/classes/Node";
import { RestError } from "../src/classes/Rest";
import type { Moodenglink } from "../src/classes/Moodenglink";

/**
 * Contract tests for every Rest endpoint wrapper — that each hits the right
 * path/method/query/body and unwraps the response. Retry/backoff policy
 * itself is already covered by tests/rest.test.ts via getInfo/updatePlayer.
 */
const fakeManager = { emit: vi.fn() } as unknown as Moodenglink;

function makeNode(opts: Record<string, unknown> = {}) {
	return new Node(fakeManager, { host: "localhost", retryAmount: 0, ...opts });
}

function jsonResponse(body: unknown, status = 200): Response {
	return new Response(JSON.stringify(body), { status });
}

function emptyResponse(status = 204): Response {
	return new Response(null, { status });
}

function lastCall(fetchMock: ReturnType<typeof vi.fn>): { url: URL; init: RequestInit } {
	const [url, init] = fetchMock.mock.calls[fetchMock.mock.calls.length - 1] as [URL, RequestInit];
	return { url, init };
}

afterEach(() => vi.unstubAllGlobals());

describe("Rest — session-less endpoints", () => {
	it("loadTracks() queries /loadtracks with the raw identifier", async () => {
		const node = makeNode();
		const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ loadType: "empty", data: {} }));
		vi.stubGlobal("fetch", fetchMock);

		await expect(node.rest.loadTracks("ytsearch:foo")).resolves.toEqual({ loadType: "empty", data: {} });
		const { url } = lastCall(fetchMock);
		expect(url.pathname).toBe("/v4/loadtracks");
		expect(url.searchParams.get("identifier")).toBe("ytsearch:foo");
	});

	it("decodeTrack() queries /decodetrack", async () => {
		const node = makeNode();
		const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ encoded: "ENC" }));
		vi.stubGlobal("fetch", fetchMock);

		await node.rest.decodeTrack("ENC");
		const { url } = lastCall(fetchMock);
		expect(url.pathname).toBe("/v4/decodetrack");
		expect(url.searchParams.get("encodedTrack")).toBe("ENC");
	});

	it("decodeTracks() POSTs the array body and is retried as idempotent", async () => {
		const node = makeNode({ retryAmount: 2, retryDelay: 0 });
		const fetchMock = vi
			.fn()
			.mockRejectedValueOnce(new Error("flaky"))
			.mockResolvedValueOnce(jsonResponse([{ encoded: "A" }]));
		vi.stubGlobal("fetch", fetchMock);

		await expect(node.rest.decodeTracks(["A", "B"])).resolves.toEqual([{ encoded: "A" }]);
		const { url, init } = lastCall(fetchMock);
		expect(url.pathname).toBe("/v4/decodetracks");
		expect(init.method).toBe("POST");
		expect(init.body).toBe(JSON.stringify(["A", "B"]));
	});

	it("getInfo() and getStats() hit /info and /stats", async () => {
		const node = makeNode();
		const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(jsonResponse({ ok: true })));
		vi.stubGlobal("fetch", fetchMock);

		await node.rest.getInfo();
		expect(lastCall(fetchMock).url.pathname).toBe("/v4/info");

		await node.rest.getStats();
		expect(lastCall(fetchMock).url.pathname).toBe("/v4/stats");
	});
});

describe("Rest — session-scoped endpoints", () => {
	it("throws synchronously when no session id has been set yet", () => {
		const node = makeNode();
		expect(() => node.rest.getPlayers()).toThrow(/no session id/);
	});

	it("getPlayers()/getPlayer() GET under /sessions/{id}/players", async () => {
		const node = makeNode();
		node.rest.sessionId = "sess-1";
		const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(jsonResponse([])));
		vi.stubGlobal("fetch", fetchMock);

		await node.rest.getPlayers();
		expect(lastCall(fetchMock).url.pathname).toBe("/v4/sessions/sess-1/players");

		await node.rest.getPlayer("g1");
		expect(lastCall(fetchMock).url.pathname).toBe("/v4/sessions/sess-1/players/g1");
	});

	it("updatePlayer() PATCHes the body and forwards noReplace as a query flag", async () => {
		const node = makeNode();
		node.rest.sessionId = "sess-1";
		const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ guildId: "g1" }));
		vi.stubGlobal("fetch", fetchMock);

		await node.rest.updatePlayer("g1", { paused: true }, true);
		const { url, init } = lastCall(fetchMock);
		expect(url.pathname).toBe("/v4/sessions/sess-1/players/g1");
		expect(url.searchParams.get("noReplace")).toBe("true");
		expect(init.method).toBe("PATCH");
		expect(init.body).toBe(JSON.stringify({ paused: true }));
	});

	it("destroyPlayer() DELETEs and swallows an already-gone (404) player", async () => {
		const node = makeNode();
		node.rest.sessionId = "sess-1";
		vi.stubGlobal("fetch", vi.fn().mockResolvedValue(emptyResponse(404)));

		await expect(node.rest.destroyPlayer("g1")).resolves.toBeUndefined();
	});

	it("destroyPlayer() still rejects on a non-404 error", async () => {
		const node = makeNode();
		node.rest.sessionId = "sess-1";
		vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ message: "boom" }, 500)));

		await expect(node.rest.destroyPlayer("g1")).rejects.toBeInstanceOf(RestError);
	});

	it("updateSession() PATCHes resuming + timeout to the session root", async () => {
		const node = makeNode();
		node.rest.sessionId = "sess-1";
		const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ resuming: true, timeout: 60 }));
		vi.stubGlobal("fetch", fetchMock);

		await node.rest.updateSession(true, 60);
		const { url, init } = lastCall(fetchMock);
		expect(url.pathname).toBe("/v4/sessions/sess-1");
		expect(init.method).toBe("PATCH");
		expect(init.body).toBe(JSON.stringify({ resuming: true, timeout: 60 }));
	});
});

describe("Rest — LavaLyrics endpoints", () => {
	it("getLyrics() / getLyricsForTrack() GET with skipTrackSource forwarded", async () => {
		const node = makeNode();
		node.rest.sessionId = "sess-1";
		const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(jsonResponse({ text: "la" })));
		vi.stubGlobal("fetch", fetchMock);

		await node.rest.getLyrics("g1", true);
		let { url } = lastCall(fetchMock);
		expect(url.pathname).toBe("/v4/sessions/sess-1/players/g1/track/lyrics");
		expect(url.searchParams.get("skipTrackSource")).toBe("true");

		await node.rest.getLyricsForTrack("ENC", false);
		({ url } = lastCall(fetchMock));
		expect(url.pathname).toBe("/v4/lyrics");
		expect(url.searchParams.get("track")).toBe("ENC");
		expect(url.searchParams.get("skipTrackSource")).toBe("false");
	});

	it("subscribeLyrics()/unsubscribeLyrics() POST/DELETE the subscription", async () => {
		const node = makeNode();
		node.rest.sessionId = "sess-1";
		const fetchMock = vi.fn().mockResolvedValue(emptyResponse());
		vi.stubGlobal("fetch", fetchMock);

		await node.rest.subscribeLyrics("g1");
		let call = lastCall(fetchMock);
		expect(call.url.pathname).toBe("/v4/sessions/sess-1/players/g1/lyrics/subscribe");
		expect(call.init.method).toBe("POST");

		await node.rest.unsubscribeLyrics("g1");
		call = lastCall(fetchMock);
		expect(call.init.method).toBe("DELETE");
	});
});

describe("Rest — SponsorBlock endpoints", () => {
	it("sets, gets, and clears SponsorBlock categories", async () => {
		const node = makeNode();
		node.rest.sessionId = "sess-1";
		const fetchMock = vi.fn().mockResolvedValue(emptyResponse());
		vi.stubGlobal("fetch", fetchMock);

		await node.rest.setSponsorBlockCategories("g1", ["sponsor", "intro"]);
		let call = lastCall(fetchMock);
		expect(call.url.pathname).toBe("/v4/sessions/sess-1/players/g1/sponsorblock/categories");
		expect(call.init.method).toBe("PUT");
		expect(call.init.body).toBe(JSON.stringify(["sponsor", "intro"]));

		await node.rest.getSponsorBlockCategories("g1");
		call = lastCall(fetchMock);
		expect(call.init.method).toBe("GET"); // defaults to GET

		await node.rest.clearSponsorBlockCategories("g1");
		call = lastCall(fetchMock);
		expect(call.init.method).toBe("DELETE");
	});
});
