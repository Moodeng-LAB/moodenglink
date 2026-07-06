/**
 * Top-level manager option and event types.
 * @module types/Moodenglink
 */

import type { Collection } from "@discordjs/collection";
import type { Node } from "../classes/Node";
import type { Player } from "../classes/Player";
import type { NodeOptions, NodeStats } from "./Node";
import type { Track, UnresolvedQuery, VoiceGatewayPayload } from "./Player";
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

export interface ManagerOptions {
	/** The Lavalink nodes to connect to. */
	nodes: NodeOptions[];
	/** The bot's user id. May be provided later via {@link Moodenglink.init}. */
	clientId?: string;
	/** A friendly client name reported to Lavalink. */
	clientName?: string;
	/** Total shard count of the bot. Defaults to `1`. */
	shards?: number;
	/** Whether to queue a related track when the queue empties. Defaults to `false`. */
	autoPlay?: boolean;
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
	playerDestroy: [player: Player];
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
