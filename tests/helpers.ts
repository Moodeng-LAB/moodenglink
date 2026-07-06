import type { TrackData } from "../src/types/Player";

/** Builds a raw Lavalink TrackData object for tests. */
export function makeTrackData(overrides: Partial<TrackData["info"]> = {}, encoded = "ENC_DEFAULT"): TrackData {
	return {
		encoded,
		info: {
			identifier: "id-1",
			isSeekable: true,
			author: "Rick Astley",
			length: 213000,
			isStream: false,
			position: 0,
			title: "Never Gonna Give You Up",
			uri: "https://youtu.be/dQw4w9WgXcQ",
			sourceName: "youtube",
			artworkUrl: "https://img/art.jpg",
			isrc: null,
			...overrides,
		},
		pluginInfo: {},
		userData: {},
	};
}

/** Minimal fake Node stats. */
export function makeStats(overrides: Record<string, unknown> = {}) {
	return {
		players: 1,
		playingPlayers: 1,
		uptime: 1000,
		memory: { free: 1, used: 1, allocated: 1, reservable: 1 },
		cpu: { cores: 4, systemLoad: 0.25, lavalinkLoad: 0.1 },
		frameStats: null,
		...overrides,
	};
}
