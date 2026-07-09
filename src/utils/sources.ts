/**
 * Search platforms and helpers for building Lavalink search identifiers.
 * @module utils/sources
 */

/** Built-in / common plugin search platforms. */
export type SearchPlatform =
	| "youtube"
	| "youtubemusic"
	| "soundcloud"
	| "spotify"
	| "deezer"
	| "applemusic"
	| "yandexmusic"
	| "flowerytts"
	| "bandcamp"
	| "vimeo"
	| "twitch"
	| "http"
	| "local";

/** Maps a friendly platform name to its Lavalink search prefix. */
export const SearchPrefixes: Record<SearchPlatform, string> = {
	youtube: "ytsearch",
	youtubemusic: "ytmsearch",
	soundcloud: "scsearch",
	spotify: "spsearch",
	deezer: "dzsearch",
	applemusic: "amsearch",
	yandexmusic: "ymsearch",
	flowerytts: "ftts",
	bandcamp: "bcsearch",
	vimeo: "vmsearch",
	twitch: "twsearch",
	http: "http",
	local: "local",
};

const URL_REGEX = /^https?:\/\//i;

/** Whether the given string looks like a direct URL. */
export function isUrl(input: string): boolean {
	return URL_REGEX.test(input);
}

/**
 * Builds a Lavalink `loadtracks` identifier from a raw query + platform.
 * URLs are passed through untouched; everything else gets a search prefix.
 */
export function buildSearchIdentifier(query: string, platform: SearchPlatform = "youtube"): string {
	if (isUrl(query)) return query;

	const trimmed = query.trim();
	// Already prefixed (e.g. "ytsearch:foo", "sprec:seed_tracks=...") — respect it.
	if (/^[a-z]+(search|rec):/i.test(trimmed) || trimmed.startsWith("ftts:")) return trimmed;

	const prefix = SearchPrefixes[platform] ?? SearchPrefixes.youtube;
	return `${prefix}:${trimmed}`;
}
