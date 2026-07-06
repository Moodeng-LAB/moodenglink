/**
 * An ordered queue of tracks with history and repeat-aware helpers.
 * @module classes/Queue
 */

import type { Track } from "../types/Player";
import { shuffleArray } from "../utils/utils";

export class Queue extends Array<Track> {
	// Derived operations (map/filter/slice/splice) return plain arrays instead of
	// Queue instances — otherwise they'd carry this class's `current`/`previous`
	// fields and leak them into results.
	static get [Symbol.species](): ArrayConstructor {
		return Array;
	}

	/** The track that is currently playing (or was, once it ends). */
	public current: Track | null = null;

	/** Previously played tracks, most-recent-first. */
	public previous: Track[] = [];

	/** Total duration of the queue (excluding the current track), in ms. */
	public get duration(): number {
		return this.reduce((acc, track) => acc + (track.duration || 0), 0);
	}

	/** Total number of upcoming tracks. */
	public get size(): number {
		return this.length;
	}

	/** Whether there are no upcoming tracks. */
	public get isEmpty(): boolean {
		return this.length === 0;
	}

	/** Adds one or more tracks to the end of the queue, or at `offset`. */
	public add(track: Track | Track[], offset?: number): this {
		const tracks = Array.isArray(track) ? track : [track];
		if (offset === undefined || offset >= this.length) this.push(...tracks);
		else this.splice(offset, 0, ...tracks);
		return this;
	}

	/** Removes and returns tracks. `remove(index)` or `remove(start, end)`. */
	public remove(start = 0, end?: number): Track[] {
		if (end === undefined) return this.splice(start, 1);
		return this.splice(start, end - start);
	}

	/** Empties all upcoming tracks. */
	public clear(): void {
		this.length = 0;
	}

	/** Shuffles the upcoming tracks in place. */
	public shuffle(): void {
		shuffleArray(this);
	}

	/** Moves a track from one position to another. */
	public move(from: number, to: number): void {
		if (from < 0 || from >= this.length) return;
		const [track] = this.splice(from, 1);
		this.splice(to, 0, track);
	}

	/** Removes duplicate tracks by encoded string, keeping the first occurrence. */
	public dedupe(): void {
		const seen = new Set<string>();
		for (let i = 0; i < this.length; i++) {
			if (seen.has(this[i].encoded)) {
				this.splice(i, 1);
				i--;
			} else {
				seen.add(this[i].encoded);
			}
		}
	}
}
