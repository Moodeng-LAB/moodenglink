/**
 * Top-level manager option and event types.
 * @module types/Moodenglink
 */

import type { Collection } from "@discordjs/collection";
import type { Node } from "../classes/Node";
import type { Player } from "../classes/Player";
import type { NodeOptions, NodeStats } from "./Node";
import type { PlayerDestroyContext, PlayerOptions, Track, UnresolvedQuery, VoiceGatewayPayload } from "./Player";
import type { SearchPlatform } from "../utils/sources";
import type {
	ChapterStartedEvent,
	ChaptersLoadedEvent,
	LyricsFoundEvent,
	LyricsLine,
	LyricsLineEvent,
	LyricsNotFoundEvent,
	LyricsResult,
	PlayerEvent,
	SegmentSkippedEvent,
	SegmentsLoadedEvent,
	SponsorBlockChapter,
	SponsorBlockSegment,
	TrackEndEvent,
	TrackExceptionEvent,
	TrackStartEvent,
	TrackStuckEvent,
	WebSocketClosedEvent,
} from "./Op";

/** A function that persists/restores player sessions across restarts. */
export interface SessionStore {
	get(key: string): Promise<string | null> | string | null;
	set(key: string, value: string): Promise<unknown> | unknown;
	delete(key: string): Promise<unknown> | unknown;
	keys(): Promise<string[]> | string[];
}

/** Built-in defaults for common deployment sizes. Omit this to preserve v1 behaviour. */
export type ManagerPreset = "minimal" | "recommended" | "resilient";

/** Controls which direct URLs may be sent to Lavalink. Search text is unaffected by default. */
export interface SearchPolicy {
	/** Allowed URL protocols. Defaults to `["http:", "https:"]`. */
	allowedProtocols?: string[];
	/** If set, direct URLs must match one of these domains (subdomains also match). */
	allowedDomains?: string[];
	/** Direct URLs matching one of these domains are always rejected. */
	blockedDomains?: string[];
	/** Whether ordinary text/prefixed searches are allowed. Defaults to `true`. */
	allowSearchQueries?: boolean;
	/** Optional final application-specific check. Return `false` or a message to reject. */
	validate?(query: string, url: URL | null): boolean | string;
}

/** Default lifecycle behaviour for every player. All switches are opt-in except voice cleanup. */
export interface PlayerBehaviorOptions {
	/** Advance after TrackStuck/TrackException. Defaults to `false`. */
	autoSkipOnError?: boolean;
	/** Destroy the player when Discord removes the bot from voice. Defaults to `true`. */
	destroyOnVoiceDisconnect?: boolean;
	/** Destroy the player after `queueEnd` is emitted. Defaults to `false`. */
	destroyOnQueueEnd?: boolean;
}

/** One-call search, queue and play helper intended for small bots and first-time users. */
export interface QuickPlayOptions extends PlayerOptions {
	query: string | SearchQuery;
	requester?: unknown;
	/** Add all search results instead of only the first. Playlists are always added in full. */
	addAll?: boolean;
}

export interface QuickPlayResult {
	player: Player;
	result: import("./Player").SearchResult;
	queued: Track[];
}

export interface ManagerOptions {
	/** The Lavalink nodes to connect to. */
	nodes: NodeOptions[];
	/** The bot's user id. May be provided later via {@link Moodenglink.init}. */
	clientId?: string;
	/** A friendly client name reported to Lavalink. */
	clientName?: string;
	/** Total shard count of the bot. Defaults to `1`. */
	shards?: number;
	/** Apply an additive set of defaults. Omit to preserve the original v1 defaults. */
	preset?: ManagerPreset;
	/** Whether to queue a related track when the queue empties. Defaults to `false`. */
	autoPlay?: boolean;
	/**
	 * How many of the top autoplay candidates to randomly sample from. Larger
	 * values add variety at the cost of relevance. Defaults to `5`.
	 */
	autoplaySampleSize?: number;
	/**
	 * The `requester` stamped on autoplay-queued tracks. Set to your client user,
	 * `null`, or any marker so panels don't credit an autoplayed pick to whoever
	 * requested the previous track. When omitted, the previous track's requester
	 * is inherited (backwards-compatible behaviour).
	 */
	autoplayRequester?: unknown;
	/** Whether to migrate players to a healthy node when one dies. Defaults to `true`. */
	autoMove?: boolean;
	/** Whether to resume players from a {@link SessionStore} on start. Defaults to `false`. */
	autoResume?: boolean;
	/** How many times to try re-establishing a dropped voice connection. Defaults to `3`. */
	voiceReconnectTries?: number;
	/** Base delay (ms) between voice reconnect attempts; scales per attempt. Defaults to `1000`. */
	voiceReconnectDelay?: number;
	/** The default platform used when a search query has no source prefix. */
	defaultSearchPlatform?: SearchPlatform;
	/** Fields to strip from tracks to save memory (never removes `encoded`). */
	trackPartial?: (keyof Track)[];
	/** Optional storage backend enabling session resuming and player persistence. */
	store?: SessionStore;
	/**
	 * Enables in-memory caching of search results to cut down on REST calls.
	 * Pass `true` for defaults (30s TTL, 100 entries) or fine-tune the values.
	 */
	searchCache?: boolean | { ttl?: number; maxSize?: number };
	/** Custom node-ordering strategy used for load balancing. */
	sorter?: (nodes: Collection<string, Node>) => Collection<string, Node>;
	/** Defaults merged into every call to {@link Moodenglink.create}. */
	playerDefaults?: Omit<Partial<PlayerOptions>, "guild">;
	/** Shared player lifecycle behaviour. */
	playerBehavior?: PlayerBehaviorOptions;
	/** Optional allow/deny policy for direct URLs and search queries. */
	searchPolicy?: SearchPolicy;
	/** REQUIRED — forwards a raw OP 4 payload to the Discord gateway. */
	send(guildId: string, payload: VoiceGatewayPayload): void;
}

/** Options accepted by {@link Moodenglink.search}. */
export interface SearchQuery {
	query: string;
	source?: SearchPlatform | (string & {});
}

/** Strongly-typed event map for the manager's EventEmitter. */
export interface ManagerEvents {
	nodeCreate: [node: Node];
	nodeConnect: [node: Node];
	nodeReconnect: [node: Node];
	nodeDisconnect: [node: Node, reason: { code?: number; reason?: string }];
	nodeError: [node: Node, error: Error];
	nodeDestroy: [node: Node];
	nodeRaw: [payload: unknown];
	nodeStats: [node: Node, stats: NodeStats];

	playerCreate: [player: Player];
	playerDestroy: [player: Player, context: PlayerDestroyContext];
	playerMove: [player: Player, oldNode: Node, newNode: Node];
	playerDisconnect: [player: Player, oldChannel: string | null];
	playerStateUpdate: [player: Player];

	queueEnd: [player: Player, track: Track | null, payload: TrackEndEvent];
	trackStart: [player: Player, track: Track, payload: TrackStartEvent];
	trackEnd: [player: Player, track: Track, payload: TrackEndEvent];
	trackStuck: [player: Player, track: Track, payload: TrackStuckEvent];
	trackError: [player: Player, track: Track, payload: TrackExceptionEvent];
	socketClosed: [player: Player, payload: WebSocketClosedEvent];

	lyricsFound: [player: Player, lyrics: LyricsResult, payload: LyricsFoundEvent];
	lyricsNotFound: [player: Player, payload: LyricsNotFoundEvent];
	lyricsLine: [player: Player, line: LyricsLine, payload: LyricsLineEvent];

	segmentsLoaded: [player: Player, segments: SponsorBlockSegment[], payload: SegmentsLoadedEvent];
	segmentSkipped: [player: Player, segment: SponsorBlockSegment, payload: SegmentSkippedEvent];
	chaptersLoaded: [player: Player, chapters: SponsorBlockChapter[], payload: ChaptersLoadedEvent];
	chapterStarted: [player: Player, chapter: SponsorBlockChapter, payload: ChapterStartedEvent];

	raw: [payload: PlayerEvent];
	debug: [message: string];
}
