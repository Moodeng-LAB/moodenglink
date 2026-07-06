/**
 * Shared helpers: track building, partials, formatting and validation.
 * @module utils/utils
 */

import type { Track, TrackData } from "../types/Player";

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

/** Fisher-Yates in-place shuffle. */
export function shuffleArray<T>(array: T[]): T[] {
	for (let i = array.length - 1; i > 0; i--) {
		const j = Math.floor(Math.random() * (i + 1));
		[array[i], array[j]] = [array[j], array[i]];
	}
	return array;
}
