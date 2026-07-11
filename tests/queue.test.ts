import { describe, expect, it } from "vitest";
import { Queue } from "../src/classes/Queue";
import type { Track } from "../src/types/Player";

const track = (id: string, duration = 1000): Track => ({ encoded: id, identifier: id, duration, title: id }) as unknown as Track;

describe("Queue", () => {
	it("adds single tracks and arrays, reports size and duration", () => {
		const q = new Queue();
		q.add(track("a"));
		q.add([track("b", 2000), track("c", 3000)]);
		expect(q.size).toBe(3);
		expect(q.duration).toBe(6000);
		expect(q.isEmpty).toBe(false);
	});

	it("inserts at an offset", () => {
		const q = new Queue();
		q.add([track("a"), track("c")]);
		q.add(track("b"), 1);
		expect(q.map((t) => t.identifier)).toEqual(["a", "b", "c"]);
	});

	it("removes by index and by range", () => {
		const q = new Queue();
		q.add([track("a"), track("b"), track("c"), track("d")]);
		expect(q.remove(0)[0].identifier).toBe("a");
		expect(q.remove(1, 3).map((t) => t.identifier)).toEqual(["c", "d"]);
		expect(q.map((t) => t.identifier)).toEqual(["b"]);
	});

	it("moves a track between positions", () => {
		const q = new Queue();
		q.add([track("a"), track("b"), track("c")]);
		q.move(0, 2);
		expect(q.map((t) => t.identifier)).toEqual(["b", "c", "a"]);
	});

	it("dedupes by encoded string keeping first occurrences", () => {
		const q = new Queue();
		q.add([track("a"), track("b"), track("a"), track("c"), track("b")]);
		q.dedupe();
		expect(q.map((t) => t.identifier)).toEqual(["a", "b", "c"]);
	});

	it("clears all upcoming tracks", () => {
		const q = new Queue();
		q.add([track("a"), track("b")]);
		q.clear();
		expect(q.size).toBe(0);
		expect(q.isEmpty).toBe(true);
	});

	it("tracks current and previous independently", () => {
		const q = new Queue();
		q.current = track("now");
		q.previous.unshift(track("before"));
		expect(q.current?.identifier).toBe("now");
		expect(q.previous[0].identifier).toBe("before");
	});
});
