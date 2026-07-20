/**
 * Riffy-style, source-aware autoplay strategies.
 *
 * When a queue runs dry we seed a fresh recommendation from the track that just
 * finished. Rather than blindly re-searching its title (which loops back onto
 * the same song), we lean on each platform's own "radio"/recommendation feed
 * where one exists, and gracefully fall back to a cleaned-up seed search.
 *
 * @module utils/autoplay
 */

import type { Moodenglink } from "../classes/Moodenglink";
import type { SearchQuery } from "../types/Moodenglink";
import type { Requester, Track } from "../types/Player";
import type { SearchPlatform } from "./sources";
import { buildAutoplaySeed } from "./utils";

/** Identity keys for a track — catches the same song across id and uri. */
export function trackKeys(track: { identifier?: string; uri?: string | null }): string[] {
	const keys: string[] = [];
	if (track.identifier) keys.push(track.identifier);
	if (track.uri) keys.push(track.uri);
	return keys;
}

/** A single recommendation source. Must never throw — return `[]` on failure. */
type Strategy = (manager: Moodenglink, previous: Track, requester: Requester) => Promise<Track[]>;

const search = async (manager: Moodenglink, query: SearchQuery, requester: Requester): Promise<Track[]> => {
	const res = await manager.search(query, requester).catch(() => null);
	return res?.tracks ?? [];
};

/** YouTube's "Mix" radio — a high-quality, ever-fresh related-tracks feed. */
const youtubeRadio: Strategy = (manager, previous, requester) => {
	const id = previous.identifier;
	if (!id) return Promise.resolve([]);
	const query = `https://www.youtube.com/watch?v=${id}&list=RD${id}`;
	return search(manager, { query, source: "youtubemusic" }, requester);
};

/** SoundCloud's per-track "recommended" feed. */
const soundcloudRelated: Strategy = (manager, previous, requester) => {
	if (!previous.uri) return Promise.resolve([]);
	const query = `${previous.uri.replace(/\/+$/, "")}/recommended`;
	return search(manager, { query, source: "soundcloud" }, requester);
};

/** Spotify recommendations (requires LavaSrc's `sprec:` seed support). */
const spotifyRecommendations: Strategy = (manager, previous, requester) => {
	if (!previous.identifier) return Promise.resolve([]);
	const query = `sprec:seed_tracks=${previous.identifier}`;
	return search(manager, { query, source: "spotify" }, requester);
};

/** Deezer flow/recommendations (requires LavaSrc's `dzrec:` seed support). */
const deezerFlow: Strategy = (manager, previous, requester) => {
	if (!previous.identifier) return Promise.resolve([]);
	const query = `dzrec:${previous.identifier}`;
	return search(manager, { query, source: "deezer" }, requester);
};

/** Universal fallback: a cleaned "artist title" search on the track's platform. */
const seedSearch: Strategy = (manager, previous, requester) => {
	const seed = buildAutoplaySeed(previous);
	if (!seed) return Promise.resolve([]);
	const source = (previous.sourceName as SearchPlatform) || manager.options.defaultSearchPlatform;
	return search(manager, { query: seed, source }, requester);
};

/** The ordered strategy chain to try for a given source, best-first. */
function strategyChain(source: string): Strategy[] {
	switch (source) {
		case "youtube":
		case "youtubemusic":
			return [youtubeRadio, seedSearch];
		case "soundcloud":
			return [soundcloudRelated, seedSearch];
		case "spotify":
			return [spotifyRecommendations, seedSearch];
		case "deezer":
			return [deezerFlow, seedSearch];
		default:
			return [seedSearch];
	}
}

/**
 * Resolves candidate related tracks for the finished track, trying each
 * platform-appropriate strategy in turn and returning the first non-empty set.
 * Never throws.
 */
export async function resolveAutoplayCandidates(manager: Moodenglink, previous: Track, requester: Requester): Promise<Track[]> {
	const source = (previous.sourceName ?? "").toLowerCase();
	for (const strategy of strategyChain(source)) {
		const tracks = await strategy(manager, previous, requester).catch(() => []);
		if (tracks.length) return tracks;
	}
	return [];
}
