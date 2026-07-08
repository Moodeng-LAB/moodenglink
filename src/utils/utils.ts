/**
 * Shared helpers: track building, partials, formatting and validation.
 * @module utils/utils
 */

import type { QueueItem, Track, TrackData, UnresolvedTrack } from "../types/Player";

/** Builds a flattened {@link Track} from raw Lavalink track data. */
export function buildTrack(data: TrackData, requester?: unknown): Track {
	const { info } = data;
	return {
		encoded: data.encoded,
		title: info.title,
		author: info.author,
		duration: info.length,
		identifier: info.identifier,
		uri: info.uri,
		artworkUrl: info.artworkUrl,
		isrc: info.isrc,
		sourceName: info.sourceName,
		isSeekable: info.isSeekable,
		isStream: info.isStream,
		position: info.position,
		pluginInfo: data.pluginInfo ?? {},
		userData: data.userData ?? {},
		requester,
	};
}

/** Removes the given fields from a track (used by `trackPartial`). */
export function partialTrack(track: Track, partial: (keyof Track)[]): Track {
	if (!partial?.length) return track;
	const clone = { ...track } as Record<string, unknown>;
	const keep = new Set<keyof Track>(["encoded", ...partial]);
	for (const key of Object.keys(clone) as (keyof Track)[]) {
		if (!keep.has(key)) delete clone[key];
	}
	return clone as unknown as Track;
}

/** Type-guard that a value is a plain object. */
export function isObject(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Type-guard for a queue item that still needs resolving before playback. */
export function isUnresolvedTrack(item: QueueItem): item is UnresolvedTrack {
	return (item as UnresolvedTrack)?.unresolved === true;
}

/**
 * Picks the search result that best matches an unresolved track — preferring a
 * matching author and the closest duration (within ~2s), else the first result.
 */
export function pickClosestTrack(tracks: Track[], ref: { author?: string; duration?: number }): Track | undefined {
	if (!tracks.length) return undefined;

	const author = ref.author?.toLowerCase();
	if (author) {
		const byAuthor = tracks.find((t) => {
			const a = t.author?.toLowerCase() ?? "";
			return a.includes(author) || author.includes(a);
		});
		if (byAuthor) return byAuthor;
	}

	if (typeof ref.duration === "number") {
		const byDuration = tracks.find((t) => Math.abs((t.duration || 0) - ref.duration!) <= 2000);
		if (byDuration) return byDuration;
	}

	return tracks[0];
}

/** Formats a millisecond duration as `hh:mm:ss` / `mm:ss`. */
export function formatDuration(ms: number): string {
	if (!Number.isFinite(ms) || ms < 0) return "00:00";
	const totalSeconds = Math.floor(ms / 1000);
	const hours = Math.floor(totalSeconds / 3600);
	const minutes = Math.floor((totalSeconds % 3600) / 60);
	const seconds = totalSeconds % 60;
	const pad = (n: number) => n.toString().padStart(2, "0");
	return hours > 0 ? `${pad(hours)}:${pad(minutes)}:${pad(seconds)}` : `${pad(minutes)}:${pad(seconds)}`;
}

/** Clamps a number into an inclusive range. */
export function clamp(value: number, min: number, max: number): number {
	return Math.min(Math.max(value, min), max);
}

/** Resolves after `ms` milliseconds. */
export function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Builds a clean autoplay search seed from a finished track.
 *
 * Raw `author` values from YouTube-sourced tracks are often the auto-generated
 * channel name (e.g. `"<Artist> - Topic"`, `"<Artist>VEVO"`), which loops the
 * follow-up search back onto the same channel. We strip that noise and, when an
 * artist name survives, combine it with the title for a stronger recommendation
 * seed. Falls back to the raw title when nothing useful remains.
 */
export function buildAutoplaySeed(track: { author?: string; title?: string }): string {
	const artist = (track.author ?? "")
		.replace(/\s*-\s*topic$/i, "")
		.replace(/vevo\b/gi, "")
		.replace(/\bofficial\b/gi, "")
		.replace(/\s+/g, " ")
		.trim();
	const title = (track.title ?? "").trim();

	if (artist && title) return `${artist} ${title}`;
	return artist || title;
}

/** Fisher-Yates in-place shuffle. */
export function shuffleArray<T>(array: T[]): T[] {
	for (let i = array.length - 1; i > 0; i--) {
		const j = Math.floor(Math.random() * (i + 1));
		[array[i], array[j]] = [array[j], array[i]];
	}
	return array;
}
