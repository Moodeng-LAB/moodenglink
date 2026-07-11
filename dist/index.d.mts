import { Collection } from '@discordjs/collection';
import { EventEmitter } from 'node:events';
import WebSocket from 'ws';

/**
 * Types describing a Lavalink node connection, its options and reported stats.
 * @module types/Node
 */
interface NodeOptions {
    /** The host of the node (e.g. `localhost`). */
    host: string;
    /** The port of the node. Defaults to `2333`. */
    port?: number;
    /** The password/authorization of the node. */
    password?: string;
    /** Whether to connect over TLS (wss/https). */
    secure?: boolean;
    /** A friendly identifier used for logs and lookups. */
    identifier?: string;
    /** How many times to retry a lost connection. Defaults to `5`. */
    retryAmount?: number;
    /** Delay in ms between reconnect attempts. Defaults to `5000`. */
    retryDelay?: number;
    /** REST request timeout in ms. Defaults to `10000`. */
    requestTimeout?: number;
    /** Session resuming timeout in seconds. Defaults to `60`. */
    resumeTimeout?: number;
    /** Priority weight when picking a node — higher wins ties. Defaults to `0`. */
    priority?: number;
    /** Whether this node may be used for searching. Defaults to `true`. */
    search?: boolean;
    /** Whether this node may be used for playback. Defaults to `true`. */
    playback?: boolean;
}
interface NodeInfo {
    version: {
        semver: string;
        major: number;
        minor: number;
        patch: number;
        preRelease: string | null;
        build: string | null;
    };
    buildTime: number;
    git: {
        branch: string;
        commit: string;
        commitTime: number;
    };
    jvm: string;
    lavaplayer: string;
    sourceManagers: string[];
    filters: string[];
    plugins: {
        name: string;
        version: string;
    }[];
}
interface MemoryStats {
    free: number;
    used: number;
    allocated: number;
    reservable: number;
}
interface CPUStats {
    cores: number;
    systemLoad: number;
    lavalinkLoad: number;
}
interface FrameStats {
    sent: number;
    nulled: number;
    deficit: number;
}
interface NodeStats {
    players: number;
    playingPlayers: number;
    uptime: number;
    memory: MemoryStats;
    cpu: CPUStats;
    frameStats: FrameStats | null;
}

/**
 * Types for players, tracks, search results and voice payloads.
 * @module types/Player
 */
/** Lifecycle state of a {@link Player}. */
type State = "CONNECTED" | "CONNECTING" | "DISCONNECTED" | "DISCONNECTING" | "DESTROYING" | "MOVING" | "RESUMING";
/** Repeat behaviour of the player queue. */
declare enum RepeatMode {
    NONE = 0,
    TRACK = 1,
    QUEUE = 2
}
interface PlayerOptions {
    /** The guild the player belongs to. */
    guild: string;
    /** The text channel used for now-playing messages (optional, informational). */
    textChannel?: string;
    /** The voice channel to join. */
    voiceChannel?: string;
    /** A specific node identifier to bind the player to. */
    node?: string;
    /** Initial volume (0-1000). Defaults to `100`. */
    volume?: number;
    /** Whether to join self-muted. */
    selfMute?: boolean;
    /** Whether to join self-deafened. Defaults to `true`. */
    selfDeafen?: boolean;
    /** Arbitrary user data stored on the player. */
    data?: Record<string, unknown>;
}
/** Raw track info exactly as returned by Lavalink. */
interface TrackInfo {
    identifier: string;
    isSeekable: boolean;
    author: string;
    length: number;
    isStream: boolean;
    position: number;
    title: string;
    uri: string | null;
    sourceName: string;
    artworkUrl: string | null;
    isrc: string | null;
}
/** Raw track object from the Lavalink REST/WebSocket API. */
interface TrackData {
    encoded: string;
    info: TrackInfo;
    pluginInfo: Record<string, unknown>;
    userData: Record<string, unknown>;
}
/** A fully-resolved, flattened track used throughout Moodenglink. */
interface Track {
    /** The base64 encoded track — send this to Lavalink to play. */
    encoded: string;
    title: string;
    author: string;
    duration: number;
    identifier: string;
    uri: string | null;
    artworkUrl: string | null;
    isrc: string | null;
    sourceName: string;
    isSeekable: boolean;
    isStream: boolean;
    position: number;
    /** Plugin-provided metadata (lavasrc, etc.). */
    pluginInfo: Record<string, unknown>;
    /** User data persisted with the track on the node. */
    userData: Record<string, unknown>;
    /** Whoever requested the track — set by you at search/add time. */
    requester?: unknown;
}
/** A track that has not yet been resolved into a playable {@link Track}. */
interface UnresolvedQuery {
    title: string;
    author?: string;
    duration?: number;
    uri?: string;
    source?: string;
    requester?: unknown;
}
/**
 * A queue item that carries only search hints (title/author/…) and is resolved
 * into a playable {@link Track} lazily, right before it plays. Build one with
 * `manager.buildUnresolved(query)`.
 */
interface UnresolvedTrack {
    /** Discriminator — always `true`. */
    readonly unresolved: true;
    title: string;
    author?: string;
    duration?: number;
    uri?: string;
    sourceName?: string;
    isrc?: string | null;
    artworkUrl?: string | null;
    pluginInfo?: Record<string, unknown>;
    userData?: Record<string, unknown>;
    requester?: unknown;
    /** Resolves this into a playable {@link Track} (throws if nothing matches). */
    resolve(): Promise<Track>;
}
/** Anything that can live in the {@link Queue}: a resolved or unresolved track. */
type QueueItem = Track | UnresolvedTrack;
type LoadType = "track" | "playlist" | "search" | "empty" | "error";
interface PlaylistInfo {
    name: string;
    selectedTrack: number;
}
interface SearchResult {
    loadType: LoadType;
    tracks: Track[];
    playlist: (PlaylistInfo & {
        duration: number;
    }) | null;
    exception: {
        message: string;
        severity: string;
    } | null;
}
interface VoiceServer {
    token: string;
    guild_id: string;
    endpoint: string;
}
interface VoiceState {
    guild_id: string;
    user_id: string;
    session_id: string;
    channel_id: string | null;
    self_deaf?: boolean;
    self_mute?: boolean;
}
interface VoicePacket {
    t?: "VOICE_SERVER_UPDATE" | "VOICE_STATE_UPDATE";
    d: VoiceState | VoiceServer;
}
/** OP 4 gateway payload used to (dis)connect from a voice channel. */
interface VoiceGatewayPayload {
    op: number;
    d: {
        guild_id: string;
        channel_id: string | null;
        self_mute: boolean;
        self_deaf: boolean;
    };
}

/**
 * Lavalink v4 WebSocket op-codes and dispatched event payloads.
 * @module types/Op
 */
/** Op-codes sent by the Lavalink node over the WebSocket. */
declare enum OpCodes {
    READY = "ready",
    PLAYER_UPDATE = "playerUpdate",
    STATS = "stats",
    EVENT = "event"
}
/** Event types dispatched inside an `event` op. */
declare enum EventTypes {
    TrackStartEvent = "TrackStartEvent",
    TrackEndEvent = "TrackEndEvent",
    TrackExceptionEvent = "TrackExceptionEvent",
    TrackStuckEvent = "TrackStuckEvent",
    WebSocketClosedEvent = "WebSocketClosedEvent",
    LyricsFoundEvent = "LyricsFoundEvent",
    LyricsNotFoundEvent = "LyricsNotFoundEvent",
    LyricsLineEvent = "LyricsLineEvent",
    SegmentsLoaded = "SegmentsLoaded",
    SegmentSkipped = "SegmentSkipped",
    ChaptersLoaded = "ChaptersLoaded",
    ChapterStarted = "ChapterStarted"
}
/** Reason a track stopped playing. */
type TrackEndReason = "finished" | "loadFailed" | "stopped" | "replaced" | "cleanup";
/** Severity of a Lavalink exception. */
type Severity = "common" | "suspicious" | "fault";
interface Exception {
    message: string | null;
    severity: Severity;
    cause: string;
}
interface PlayerState {
    time: number;
    position: number;
    connected: boolean;
    ping: number;
}
interface ReadyPayload {
    op: OpCodes.READY;
    resumed: boolean;
    sessionId: string;
}
interface PlayerUpdatePayload {
    op: OpCodes.PLAYER_UPDATE;
    guildId: string;
    state: PlayerState;
}
interface StatsPayload {
    op: OpCodes.STATS;
    players: number;
    playingPlayers: number;
    uptime: number;
    memory: {
        free: number;
        used: number;
        allocated: number;
        reservable: number;
    };
    cpu: {
        cores: number;
        systemLoad: number;
        lavalinkLoad: number;
    };
    frameStats: {
        sent: number;
        nulled: number;
        deficit: number;
    } | null;
}
interface EventPayloadBase {
    op: OpCodes.EVENT;
    guildId: string;
    type: EventTypes;
}
interface TrackStartEvent extends EventPayloadBase {
    type: EventTypes.TrackStartEvent;
    track: TrackData;
}
interface TrackEndEvent extends EventPayloadBase {
    type: EventTypes.TrackEndEvent;
    track: TrackData;
    reason: TrackEndReason;
}
interface TrackExceptionEvent extends EventPayloadBase {
    type: EventTypes.TrackExceptionEvent;
    track: TrackData;
    exception: Exception;
}
interface TrackStuckEvent extends EventPayloadBase {
    type: EventTypes.TrackStuckEvent;
    track: TrackData;
    thresholdMs: number;
}
interface WebSocketClosedEvent extends EventPayloadBase {
    type: EventTypes.WebSocketClosedEvent;
    code: number;
    reason: string;
    byRemote: boolean;
}
interface LyricsLine {
    timestamp: number;
    duration: number | null;
    line: string;
    plugin: Record<string, unknown>;
}
interface LyricsResult {
    sourceName: string;
    provider: string;
    text: string | null;
    lines: LyricsLine[];
    plugin: Record<string, unknown>;
}
interface LyricsFoundEvent extends EventPayloadBase {
    type: EventTypes.LyricsFoundEvent;
    lyrics: LyricsResult;
}
interface LyricsNotFoundEvent extends EventPayloadBase {
    type: EventTypes.LyricsNotFoundEvent;
}
interface LyricsLineEvent extends EventPayloadBase {
    type: EventTypes.LyricsLineEvent;
    lineIndex: number;
    line: LyricsLine;
    skipped: boolean;
}
/** SponsorBlock segment categories (see the SponsorBlock plugin docs). */
type SponsorBlockCategory = "sponsor" | "selfpromo" | "interaction" | "intro" | "outro" | "preview" | "music_offtopic" | "filler";
interface SponsorBlockSegment {
    category: SponsorBlockCategory;
    /** Segment start, in milliseconds. */
    start: number;
    /** Segment end, in milliseconds. */
    end: number;
}
interface SponsorBlockChapter {
    name: string;
    start: number;
    end: number;
    duration: number;
}
interface SegmentsLoadedEvent extends EventPayloadBase {
    type: EventTypes.SegmentsLoaded;
    segments: SponsorBlockSegment[];
}
interface SegmentSkippedEvent extends EventPayloadBase {
    type: EventTypes.SegmentSkipped;
    segment: SponsorBlockSegment;
}
interface ChaptersLoadedEvent extends EventPayloadBase {
    type: EventTypes.ChaptersLoaded;
    chapters: SponsorBlockChapter[];
}
interface ChapterStartedEvent extends EventPayloadBase {
    type: EventTypes.ChapterStarted;
    chapter: SponsorBlockChapter;
}
type PlayerEvent = TrackStartEvent | TrackEndEvent | TrackExceptionEvent | TrackStuckEvent | WebSocketClosedEvent | LyricsFoundEvent | LyricsNotFoundEvent | LyricsLineEvent | SegmentsLoadedEvent | SegmentSkippedEvent | ChaptersLoadedEvent | ChapterStartedEvent;
type IncomingPayload = ReadyPayload | PlayerUpdatePayload | StatsPayload | PlayerEvent;

/**
 * Audio filter payload types, mirroring the Lavalink v4 filters object.
 * @module types/Filters
 */
interface Band {
    /** Band index, 0-14. */
    band: number;
    /** Gain, -0.25 to 1.0. */
    gain: number;
}
interface KaraokeSettings {
    level?: number;
    monoLevel?: number;
    filterBand?: number;
    filterWidth?: number;
}
interface TimescaleSettings {
    speed?: number;
    pitch?: number;
    rate?: number;
}
interface TremoloSettings {
    frequency?: number;
    depth?: number;
}
interface VibratoSettings {
    frequency?: number;
    depth?: number;
}
interface RotationSettings {
    rotationHz?: number;
}
interface DistortionSettings {
    sinOffset?: number;
    sinScale?: number;
    cosOffset?: number;
    cosScale?: number;
    tanOffset?: number;
    tanScale?: number;
    offset?: number;
    scale?: number;
}
interface ChannelMixSettings {
    leftToLeft?: number;
    leftToRight?: number;
    rightToLeft?: number;
    rightToRight?: number;
}
interface LowPassSettings {
    smoothing?: number;
}
/** The complete filters object accepted by Lavalink's update-player endpoint. */
interface FilterPayload {
    volume?: number;
    equalizer?: Band[];
    karaoke?: KaraokeSettings | null;
    timescale?: TimescaleSettings | null;
    tremolo?: TremoloSettings | null;
    vibrato?: VibratoSettings | null;
    rotation?: RotationSettings | null;
    distortion?: DistortionSettings | null;
    channelMix?: ChannelMixSettings | null;
    lowPass?: LowPassSettings | null;
    /** Plugin filters, keyed by plugin name. */
    pluginFilters?: Record<string, unknown>;
}

/**
 * Types describing the Lavalink v4 REST payloads.
 * @module types/Rest
 */

type HttpMethod = "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
interface RequestOptions {
    method?: HttpMethod;
    body?: unknown;
    query?: Record<string, string | number | boolean | undefined>;
    headers?: Record<string, string>;
    /**
     * Whether a transient (network/timeout) failure may be safely retried.
     * Defaults to `true` for `GET` only — non-`GET` requests are not retried by
     * default because a lost response (e.g. an aborted `PATCH /players`) could
     * otherwise re-issue a state change like play/seek. Override per call when a
     * write is genuinely idempotent.
     */
    idempotent?: boolean;
}
/** The voice state Lavalink needs to establish a connection. */
interface LavalinkVoiceState {
    token: string;
    endpoint: string;
    sessionId: string;
    /**
     * The voice channel id. Optional in the stock Lavalink v4 protocol (extra
     * keys are ignored) but **required** by some node builds, which otherwise
     * reject the update with `Field 'channelId' is required ... at path: $.voice`.
     */
    channelId?: string;
}
/** Body accepted by `PATCH /sessions/{sessionId}/players/{guildId}`. */
interface UpdatePlayerBody {
    track?: {
        encoded?: string | null;
        identifier?: string;
        userData?: Record<string, unknown>;
    };
    position?: number;
    endTime?: number | null;
    volume?: number;
    paused?: boolean;
    filters?: FilterPayload;
    voice?: LavalinkVoiceState;
}
interface LavalinkPlayer {
    guildId: string;
    track: TrackData | null;
    volume: number;
    paused: boolean;
    state: PlayerState;
    voice: LavalinkVoiceState;
    filters: FilterPayload;
}
interface LavalinkTrackLoadResult {
    loadType: "track" | "playlist" | "search" | "empty" | "error";
    data: unknown;
}

/**
 * Thin, typed wrapper over the Lavalink v4 REST API.
 * @module classes/Rest
 */

declare class Rest {
    private readonly node;
    /** The active Lavalink session id (set once the node is `ready`). */
    sessionId: string | null;
    private readonly baseUrl;
    constructor(node: Node);
    /**
     * Performs an authenticated request and parses the JSON body (if any).
     *
     * Transient network/timeout failures are retried up to `retryAmount` times
     * with an incremental backoff (`retryDelay * attempt`, capped) so a struggling
     * node isn't hammered. Only idempotent requests are retried — `GET` by default,
     * or any call that opts in via `options.idempotent` — because replaying a
     * non-idempotent write (e.g. `PATCH /players`) whose response was merely lost
     * could restart or duplicate playback. HTTP (4xx/5xx) errors are never retried
     * and are surfaced with Lavalink's stack trace (requested via `?trace=true`).
     */
    request<T = unknown>(endpoint: string, options?: RequestOptions): Promise<T>;
    loadTracks(identifier: string): Promise<{
        loadType: string;
        data: unknown;
    }>;
    decodeTrack(encodedTrack: string): Promise<unknown>;
    decodeTracks(encodedTracks: string[]): Promise<unknown>;
    private get sessionPath();
    getPlayers(): Promise<LavalinkPlayer[]>;
    getPlayer(guildId: string): Promise<LavalinkPlayer>;
    updatePlayer(guildId: string, body: UpdatePlayerBody, noReplace?: boolean): Promise<LavalinkPlayer>;
    destroyPlayer(guildId: string): Promise<void>;
    updateSession(resuming: boolean, timeout: number): Promise<{
        resuming: boolean;
        timeout: number;
    }>;
    getInfo(): Promise<NodeInfo>;
    getStats(): Promise<NodeStats>;
    /** Fetches lyrics for a guild's currently-playing track. */
    getLyrics(guildId: string, skipTrackSource?: boolean): Promise<LyricsResult | null>;
    /** Fetches lyrics for an arbitrary encoded track. */
    getLyricsForTrack(encoded: string, skipTrackSource?: boolean): Promise<LyricsResult | null>;
    /** Subscribes to live (line-by-line) lyrics events for a guild. */
    subscribeLyrics(guildId: string): Promise<void>;
    /** Cancels a live lyrics subscription for a guild. */
    unsubscribeLyrics(guildId: string): Promise<void>;
    /** Sets the SponsorBlock categories the node should skip for a guild. */
    setSponsorBlockCategories(guildId: string, categories: SponsorBlockCategory[]): Promise<void>;
    /** Gets the SponsorBlock categories currently enabled for a guild. */
    getSponsorBlockCategories(guildId: string): Promise<SponsorBlockCategory[]>;
    /** Clears all SponsorBlock categories for a guild. */
    clearSponsorBlockCategories(guildId: string): Promise<void>;
}
/** Error thrown for non-2xx Lavalink REST responses (carries the HTTP status). */
declare class RestError extends Error {
    readonly status: number;
    constructor(message: string, status: number);
}

/**
 * Represents a single Lavalink node: its WebSocket, REST client and stats.
 * @module classes/Node
 */

declare class Node {
    readonly manager: Moodenglink;
    readonly options: Required<NodeOptions>;
    readonly rest: Rest;
    socket: WebSocket | null;
    stats: NodeStats | null;
    info: NodeInfo | null;
    connected: boolean;
    reconnectAttempts: number;
    private reconnectTimer;
    private lastPing;
    constructor(manager: Moodenglink, options: NodeOptions);
    /** The node identifier. */
    get id(): string;
    /** WebSocket round-trip latency in ms (from the last `stats` frame). */
    get ping(): number;
    /** Total number of players currently bound to this node. */
    get playerCount(): number;
    /**
     * A composite load score (lower is better) used by the load-balancing
     * sorters. Combines player count, CPU load and dropped-frame penalties —
     * the same heuristic Lavalink recommends and Erela.js popularised.
     */
    get penalties(): number;
    /** Opens the WebSocket connection to the node. */
    connect(): void;
    /** Closes the connection and stops reconnecting. */
    destroy(): void;
    private onOpen;
    private onMessage;
    /** Handles the one-off READY frame's async setup (session resume, info fetch). */
    private handleReady;
    private handleEvent;
    private onClose;
    private onError;
    private reconnect;
}

/**
 * Ready-made 15-band equalizer presets for the {@link Filters} helper.
 * @module utils/equalizers
 */

declare const Equalizers: {
    flat: Band[];
    bass: Band[];
    soft: Band[];
    treble: Band[];
    pop: Band[];
    party: Band[];
    rock: Band[];
    electronic: Band[];
    radio: Band[];
};
type EqualizerPreset = keyof typeof Equalizers;

/**
 * Fluent helper for building and applying Lavalink audio filters to a player.
 * @module classes/Filters
 */

declare class Filters {
    private readonly player;
    volume: number;
    equalizer: Band[];
    karaoke: KaraokeSettings | null;
    timescale: TimescaleSettings | null;
    tremolo: TremoloSettings | null;
    vibrato: VibratoSettings | null;
    rotation: RotationSettings | null;
    distortion: DistortionSettings | null;
    channelMix: ChannelMixSettings | null;
    lowPass: LowPassSettings | null;
    pluginFilters: Record<string, unknown>;
    constructor(player: Player);
    /** Serialises the current filter state into a Lavalink filters payload. */
    toJSON(): FilterPayload;
    /** Pushes the current filter state to the node. Chainable. */
    apply(): Promise<this>;
    /** Merges a partial filter payload into the current state and applies it. */
    set(payload: FilterPayload): Promise<this>;
    setEqualizer(bands: Band[]): this;
    /** Applies a named equalizer preset (`bass`, `pop`, `rock`, ...). */
    setPreset(preset: EqualizerPreset): this;
    setKaraoke(settings: KaraokeSettings | null): this;
    setTimescale(settings: TimescaleSettings | null): this;
    setTremolo(settings: TremoloSettings | null): this;
    setVibrato(settings: VibratoSettings | null): this;
    setRotation(settings: RotationSettings | null): this;
    setDistortion(settings: DistortionSettings | null): this;
    setChannelMix(settings: ChannelMixSettings | null): this;
    setLowPass(settings: LowPassSettings | null): this;
    /** Sets a plugin-specific filter (e.g. lavalink plugins). */
    setPluginFilter(name: string, value: unknown): this;
    bassboost(): Promise<this>;
    nightcore(): Promise<this>;
    vaporwave(): Promise<this>;
    eightD(): Promise<this>;
    tremoloPreset(): Promise<this>;
    /** Clears every filter and applies the reset. */
    clear(): Promise<this>;
}

/**
 * An ordered queue of tracks with history and repeat-aware helpers.
 * @module classes/Queue
 */

declare class Queue extends Array<QueueItem> {
    static get [Symbol.species](): ArrayConstructor;
    /** The track that is currently playing (or was, once it ends). Always resolved. */
    current: Track | null;
    /** Previously played tracks, most-recent-first. */
    previous: Track[];
    /** Total duration of the upcoming tracks (best-effort for unresolved ones), in ms. */
    get duration(): number;
    /** Total number of upcoming tracks. */
    get size(): number;
    /** Whether there are no upcoming tracks. */
    get isEmpty(): boolean;
    /** Adds one or more tracks (resolved or unresolved) to the queue, or at `offset`. */
    add(track: QueueItem | QueueItem[], offset?: number): this;
    /** Removes and returns tracks. `remove(index)` or `remove(start, end)`. */
    remove(start?: number, end?: number): QueueItem[];
    /** Empties all upcoming tracks. */
    clear(): void;
    /** Shuffles the upcoming tracks in place. */
    shuffle(): void;
    /** Moves a track from one position to another. */
    move(from: number, to: number): void;
    /** Removes duplicate tracks, keeping the first occurrence. */
    dedupe(): void;
}

interface PlayOptions {
    /** A specific track to play instead of pulling from the queue. */
    track?: QueueItem;
    /** Start position in ms. */
    startTime?: number;
    /** End position in ms. */
    endTime?: number;
    /** When true, does not replace the currently playing track. */
    noReplace?: boolean;
    /** Pause immediately after starting. */
    paused?: boolean;
}
declare class Player {
    readonly manager: Moodenglink;
    node: Node;
    readonly guild: string;
    voiceChannel: string | null;
    textChannel: string | null;
    readonly queue: Queue;
    readonly filters: Filters;
    volume: number;
    position: number;
    ping: number;
    timestamp: number;
    playing: boolean;
    paused: boolean;
    connected: boolean;
    state: State;
    repeatMode: RepeatMode;
    autoplay: boolean;
    readonly selfMute: boolean;
    readonly selfDeafen: boolean;
    readonly data: Record<string, unknown>;
    /** Raw Discord voice state/server used to hand off to Lavalink. */
    voiceState: {
        sessionId?: string;
        event?: VoiceServer;
    };
    /** How many consecutive voice reconnects have been attempted (reset on connect). */
    private voiceReconnectAttempts;
    /** Guards against overlapping autoplay lookups when a queue drains rapidly. */
    private autoplaying;
    constructor(manager: Moodenglink, options: PlayerOptions, node: Node);
    /** The track currently playing, if any. */
    get current(): Track | null;
    /** Joins the configured voice channel via the Discord gateway. */
    connect(): this;
    /** Leaves the voice channel but keeps the player and queue alive. */
    disconnect(): this;
    /** Moves the player to another voice channel. */
    setVoiceChannel(channelId: string): this;
    /** Rebinds the text channel used for informational events. */
    setTextChannel(channelId: string): this;
    /** Moves this player (and its playback state) to another node. */
    moveNode(node: Node): Promise<this>;
    /** Starts playback. With no options, plays the next queued track. */
    play(options?: PlayOptions): Promise<this>;
    /** @internal Resolves an unresolved queue item, swallowing failures (returns null). */
    private resolveUnresolved;
    /** Stops the current track. Pass `false` to keep the queue intact. */
    stop(clearQueue?: boolean): Promise<this>;
    /** Skips `amount` tracks (default 1) by ending the current track early. */
    skip(amount?: number): Promise<this>;
    /** Skips backwards to the previously played track. */
    previous(): Promise<this>;
    pause(state?: boolean): Promise<this>;
    resume(): Promise<this>;
    /** Seeks to `position` ms within the current track. */
    seek(position: number): Promise<this>;
    /** Sets the volume (0-1000). */
    setVolume(volume: number): Promise<this>;
    /** Sets the repeat mode (`NONE`, `TRACK`, `QUEUE`). */
    setRepeatMode(mode: RepeatMode): this;
    /** Toggles autoplay of related tracks when the queue empties. */
    setAutoplay(state: boolean): this;
    /** Destroys the player: leaves voice, tears down the node player, forgets it. */
    destroy(disconnect?: boolean): Promise<void>;
    /** Stores an arbitrary value on the player. Chainable. */
    set<T = unknown>(key: string, value: T): this;
    /** Reads a previously-stored value from the player. */
    get<T = unknown>(key: string): T | undefined;
    /** Fetches lyrics for the currently-playing track (requires the LavaLyrics plugin). */
    getLyrics(skipTrackSource?: boolean): Promise<LyricsResult | null>;
    /** Subscribes to live, line-by-line lyrics — listen on the `lyricsLine` event. */
    subscribeLyrics(): Promise<void>;
    /** Cancels a live lyrics subscription. */
    unsubscribeLyrics(): Promise<void>;
    /** Sets the SponsorBlock categories to skip — listen on `segmentSkipped`. */
    setSponsorBlock(categories: SponsorBlockCategory[]): Promise<void>;
    /** Gets the SponsorBlock categories currently enabled for this player. */
    getSponsorBlock(): Promise<SponsorBlockCategory[]>;
    /** Disables SponsorBlock skipping for this player. */
    clearSponsorBlock(): Promise<void>;
    /** @internal Feeds a raw Discord VOICE_STATE_UPDATE / VOICE_SERVER_UPDATE. */
    setVoiceState(sessionId?: string, event?: VoiceServer): Promise<void>;
    private sendVoiceUpdate;
    /** @internal */
    updateState(state: PlayerState): void;
    /** @internal */
    handleTrackStart(payload: TrackStartEvent): void;
    /** @internal */
    handleTrackEnd(payload: TrackEndEvent): Promise<void>;
    private advance;
    /** @internal */
    handleTrackStuck(payload: TrackStuckEvent): void;
    /** @internal */
    handleTrackException(payload: TrackExceptionEvent): void;
    /**
     * Voice close codes worth recovering from — session invalidations, timeouts,
     * voice-server crashes and abnormal drops. Fatal ones (4004 auth failed,
     * 4011/4012 unknown, etc.) are left alone.
     */
    private static readonly RECOVERABLE_VOICE_CLOSE;
    /** @internal */
    handleSocketClosed(payload: WebSocketClosedEvent): Promise<void>;
    /** Serialises the resumable state of this player. */
    toJSON(): Record<string, unknown>;
    /** @internal Persists this player to the configured store, if any. */
    save(): Promise<void>;
}

/**
 * Search platforms and helpers for building Lavalink search identifiers.
 * @module utils/sources
 */
/** Built-in / common plugin search platforms. */
type SearchPlatform = "youtube" | "youtubemusic" | "soundcloud" | "spotify" | "deezer" | "applemusic" | "yandexmusic" | "flowerytts" | "bandcamp" | "vimeo" | "twitch" | "http" | "local";
/** Maps a friendly platform name to its Lavalink search prefix. */
declare const SearchPrefixes: Record<SearchPlatform, string>;
/** Whether the given string looks like a direct URL. */
declare function isUrl(input: string): boolean;
/**
 * Builds a Lavalink `loadtracks` identifier from a raw query + platform.
 * URLs are passed through untouched; everything else gets a search prefix.
 */
declare function buildSearchIdentifier(query: string, platform?: SearchPlatform): string;

/**
 * Top-level manager option and event types.
 * @module types/Moodenglink
 */

/** A function that persists/restores player sessions across restarts. */
interface SessionStore {
    get(key: string): Promise<string | null> | string | null;
    set(key: string, value: string): Promise<unknown> | unknown;
    delete(key: string): Promise<unknown> | unknown;
    keys(): Promise<string[]> | string[];
}
interface ManagerOptions {
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
    searchCache?: boolean | {
        ttl?: number;
        maxSize?: number;
    };
    /** Custom node-ordering strategy used for load balancing. */
    sorter?: (nodes: Collection<string, Node>) => Collection<string, Node>;
    /** REQUIRED — forwards a raw OP 4 payload to the Discord gateway. */
    send(guildId: string, payload: VoiceGatewayPayload): void;
}
/** Options accepted by {@link Moodenglink.search}. */
interface SearchQuery {
    query: string;
    source?: SearchPlatform | (string & {});
}
/** Strongly-typed event map for the manager's EventEmitter. */
interface ManagerEvents {
    nodeCreate: [node: Node];
    nodeConnect: [node: Node];
    nodeReconnect: [node: Node];
    nodeDisconnect: [node: Node, reason: {
        code?: number;
        reason?: string;
    }];
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

/**
 * Base class for Moodenglink plugins (Magmastream / Moonlink style).
 * Extend it and override {@link Plugin.load}.
 * @module classes/Plugin
 */

declare abstract class Plugin {
    /** A unique name for the plugin, used for logs and de-duplication. */
    abstract readonly name: string;
    /** Called once when the plugin is registered on a {@link Moodenglink} manager. */
    load(_manager: Moodenglink): void;
    /** Called when the plugin is removed / the manager is destroyed. */
    unload(_manager: Moodenglink): void;
}

/**
 * The Moodenglink manager — the entry point that ties nodes and players together.
 * @module classes/Moodenglink
 */

interface Moodenglink {
    on<E extends keyof ManagerEvents>(event: E, listener: (...args: ManagerEvents[E]) => void): this;
    once<E extends keyof ManagerEvents>(event: E, listener: (...args: ManagerEvents[E]) => void): this;
    off<E extends keyof ManagerEvents>(event: E, listener: (...args: ManagerEvents[E]) => void): this;
    emit<E extends keyof ManagerEvents>(event: E, ...args: ManagerEvents[E]): boolean;
}
declare class Moodenglink extends EventEmitter {
    readonly options: ManagerOptions;
    readonly nodes: Collection<string, Node>;
    readonly players: Collection<string, Player>;
    readonly plugins: Collection<string, Plugin>;
    initialized: boolean;
    /** Optional search-result cache (enabled via `options.searchCache`). */
    private readonly searchCache;
    constructor(options: ManagerOptions);
    /**
     * Registers the bot's client id and connects every node.
     * Call this once your Discord client is ready.
     */
    init(clientId?: string): this;
    /** Adds and connects a node at runtime. */
    addNode(options: ManagerOptions["nodes"][number]): Node;
    /**
     * Picks the best connected node matching `usable` via the configured sorter.
     * Fast-paths the overwhelmingly common single-node deployment — no Collection
     * allocation and no sort — and only materialises a filtered Collection for the
     * sorter when there is an actual choice to make.
     */
    private selectNode;
    /** The best available node according to the configured sorter. */
    get idealNode(): Node;
    private searchNode;
    /** Creates (or returns the existing) player for a guild. */
    create(options: PlayerOptions): Player;
    /** Gets an existing player. */
    get(guild: string): Player | undefined;
    /** Destroys a guild's player, if any. */
    destroy(guild: string): Promise<void>;
    /**
     * Resolves a query into playable tracks via a node's `loadtracks` endpoint.
     * Accepts a raw string or a `{ query, source }` object.
     */
    search(query: string | SearchQuery, requester?: unknown): Promise<SearchResult>;
    private resolveLoadResult;
    /** Decodes a base64 track back into a {@link Track}. */
    decodeTrack(encoded: string, requester?: unknown): Promise<Track>;
    /**
     * @internal Queues a related track when a queue ends (best-effort).
     *
     * Draws candidates from the finished track's platform radio/recommendation
     * feed (falling back to a cleaned seed search), filters out anything already
     * heard or queued to avoid loops, then samples from the most-relevant head of
     * the list for a little variety — much like Riffy's autoplay.
     */
    handleAutoplay(player: Player, previous: Track): Promise<boolean>;
    /**
     * Feed raw Discord gateway VOICE_STATE_UPDATE / VOICE_SERVER_UPDATE packets here.
     * Wire this to your library's raw event handler.
     */
    updateVoiceState(data: VoicePacket): void;
    /** @internal Migrates all players off a dead node onto the next best one. */
    handleNodeFailover(deadNode: Node): Promise<void>;
    /** @internal Restores persisted players onto a freshly-connected node. */
    resumePlayers(node: Node): Promise<void>;
    /** Registers a plugin instance. */
    use(plugin: Plugin): this;
    /** Resolves an {@link UnresolvedQuery} into a playable {@link Track}. */
    resolve(query: UnresolvedQuery): Promise<Track | null>;
    /**
     * Wraps a query into an {@link UnresolvedTrack} you can push straight onto a
     * queue. It is resolved to a playable track lazily, the moment it plays —
     * ideal for Spotify/Apple metadata that only YouTube/SoundCloud can stream.
     */
    buildUnresolved(query: UnresolvedQuery): UnresolvedTrack;
    /** Cleanly disconnects every node and destroys every player. */
    destroyAll(): Promise<void>;
}

/**
 * A tiny registry that lets consumers swap in their own subclasses of the core
 * structures (Erela.js / Magmastream `Structure.extend` style).
 *
 * ```ts
 * Structure.extend("Player", (Player) => class MyPlayer extends Player {
 *   announce() { console.log("now playing", this.current?.title); }
 * });
 * ```
 * The manager instantiates via {@link Structure.get}, so extensions take effect
 * everywhere without any further wiring.
 * @module classes/Structure
 */

/** The set of structures that can be extended, keyed by name. */
interface Extendable {
    Player: typeof Player;
    Queue: typeof Queue;
    Node: typeof Node;
    Filters: typeof Filters;
}
declare abstract class Structure {
    /** Replaces a structure with a subclass produced by `extender`. */
    static extend<K extends keyof Extendable, T extends Extendable[K]>(name: K, extender: (target: Extendable[K]) => T): T;
    /** Returns the (possibly extended) constructor registered for `name`. */
    static get<K extends keyof Extendable>(name: K): Extendable[K];
    /** Resets a structure back to its built-in implementation (mostly for tests). */
    static reset(name?: keyof Extendable): void;
}

/**
 * Ready-made {@link SessionStore} backends for player persistence & resuming.
 * @module classes/stores
 */

/** An in-process, `Map`-backed store. Great for a single-instance bot. */
declare class MemoryStore implements SessionStore {
    private readonly map;
    get(key: string): string | null;
    set(key: string, value: string): void;
    delete(key: string): void;
    keys(): string[];
}
/**
 * The minimal client shape {@link RedisStore} needs — satisfied by both
 * `ioredis` and `redis` (v4) clients.
 */
interface RedisLike {
    get(key: string): Promise<string | null>;
    set(key: string, value: string): Promise<unknown>;
    del(key: string): Promise<unknown>;
    keys(pattern: string): Promise<string[]>;
}
/**
 * A Redis-backed store that survives full process restarts. Pass an existing
 * `ioredis` / `redis` client; an optional key `prefix` namespaces the data.
 *
 * ```ts
 * import Redis from "ioredis";
 * const manager = new Moodenglink({ nodes, autoResume: true, store: new RedisStore(new Redis()), send });
 * ```
 */
declare class RedisStore implements SessionStore {
    private readonly redis;
    private readonly prefix;
    constructor(redis: RedisLike, prefix?: string);
    get(key: string): Promise<string | null>;
    set(key: string, value: string): Promise<unknown>;
    delete(key: string): Promise<unknown>;
    keys(): Promise<string[]>;
}

/**
 * Sorts connected nodes by lowest CPU load (Lavalink-weighted).
 * @module sorter/leastLoadNode
 */

declare function leastLoadNode(nodes: Collection<string, Node>): Collection<string, Node>;

/**
 * Sorts connected nodes by the fewest active players.
 * @module sorter/leastUsedNode
 */

declare function leastUsedNode(nodes: Collection<string, Node>): Collection<string, Node>;

/**
 * Shared helpers: track building, partials, formatting and validation.
 * @module utils/utils
 */

/** Builds a flattened {@link Track} from raw Lavalink track data. */
declare function buildTrack(data: TrackData, requester?: unknown): Track;
/** Removes the given fields from a track (used by `trackPartial`). */
declare function partialTrack(track: Track, partial: (keyof Track)[]): Track;
/** Type-guard that a value is a plain object. */
declare function isObject(value: unknown): value is Record<string, unknown>;
/** Type-guard for a queue item that still needs resolving before playback. */
declare function isUnresolvedTrack(item: QueueItem): item is UnresolvedTrack;
/**
 * Picks the search result that best matches an unresolved track — preferring a
 * matching author and the closest duration (within ~2s), else the first result.
 */
declare function pickClosestTrack(tracks: Track[], ref: {
    author?: string;
    duration?: number;
}): Track | undefined;
/** Formats a millisecond duration as `hh:mm:ss` / `mm:ss`. */
declare function formatDuration(ms: number): string;
/** Clamps a number into an inclusive range. */
declare function clamp(value: number, min: number, max: number): number;
/** Resolves after `ms` milliseconds. */
declare function sleep(ms: number): Promise<void>;
/**
 * Builds a clean autoplay search seed from a finished track.
 *
 * Raw `author` values from YouTube-sourced tracks are often the auto-generated
 * channel name (e.g. `"<Artist> - Topic"`, `"<Artist>VEVO"`), which loops the
 * follow-up search back onto the same channel. We strip that noise and, when an
 * artist name survives, combine it with the title for a stronger recommendation
 * seed. Falls back to the raw title when nothing useful remains.
 */
declare function buildAutoplaySeed(track: {
    author?: string;
    title?: string;
}): string;
/** Fisher-Yates in-place shuffle. */
declare function shuffleArray<T>(array: T[]): T[];

/**
 * A tiny LRU cache with per-entry TTL, used for optional search-result caching.
 * @module utils/cache
 */
declare class TTLCache<K, V> {
    private readonly ttl;
    private readonly maxSize;
    private readonly store;
    constructor(ttl: number, maxSize: number);
    /** Returns a live (non-expired) value, or `undefined`. Refreshes LRU order. */
    get(key: K): V | undefined;
    /** Stores a value, evicting the oldest entry when over capacity. */
    set(key: K, value: V): void;
    clear(): void;
    get size(): number;
}

/**
 * Moodenglink — a modern Lavalink v4 client for Node.js.
 *
 * Inspired by Sonatica, Magmastream, Moonlink.js and Erela.js.
 * @packageDocumentation
 */

declare const version = "1.0.0";

export { type Band, type CPUStats, type ChannelMixSettings, type ChapterStartedEvent, type ChaptersLoadedEvent, type DistortionSettings, type EqualizerPreset, Equalizers, type EventPayloadBase, EventTypes, type Exception, type Extendable, type FilterPayload, Filters, type FrameStats, type HttpMethod, type IncomingPayload, type KaraokeSettings, type LavalinkPlayer, type LavalinkTrackLoadResult, type LavalinkVoiceState, type LoadType, type LowPassSettings, type LyricsFoundEvent, type LyricsLine, type LyricsLineEvent, type LyricsNotFoundEvent, type LyricsResult, Moodenglink as Manager, type ManagerEvents, type ManagerOptions, type MemoryStats, MemoryStore, Moodenglink, Node, type NodeInfo, type NodeOptions, type NodeStats, OpCodes, type PlayOptions, Player, type PlayerEvent, type PlayerOptions, type PlayerState, type PlayerUpdatePayload, type PlaylistInfo, Plugin, Queue, type QueueItem, type ReadyPayload, type RedisLike, RedisStore, RepeatMode, type RequestOptions, Rest, RestError, type RotationSettings, type SearchPlatform, SearchPrefixes, type SearchQuery, type SearchResult, type SegmentSkippedEvent, type SegmentsLoadedEvent, type SessionStore, type Severity, type SponsorBlockCategory, type SponsorBlockChapter, type SponsorBlockSegment, type State, type StatsPayload, Structure, TTLCache, type TimescaleSettings, type Track, type TrackData, type TrackEndEvent, type TrackEndReason, type TrackExceptionEvent, type TrackInfo, type TrackStartEvent, type TrackStuckEvent, type TremoloSettings, type UnresolvedQuery, type UnresolvedTrack, type UpdatePlayerBody, type VibratoSettings, type VoiceGatewayPayload, type VoicePacket, type VoiceServer, type VoiceState, type WebSocketClosedEvent, buildAutoplaySeed, buildSearchIdentifier, buildTrack, clamp, formatDuration, isObject, isUnresolvedTrack, isUrl, leastLoadNode, leastUsedNode, partialTrack, pickClosestTrack, shuffleArray, sleep, version };
