// src/classes/Moodenglink.ts
import { Collection } from "@discordjs/collection";
import { EventEmitter } from "events";

// src/sorter/leastUsedNode.ts
function leastUsedNode(nodes) {
  return nodes.filter((node) => node.connected).sort((a, b) => {
    const aPlayers = a.stats?.playingPlayers ?? 0;
    const bPlayers = b.stats?.playingPlayers ?? 0;
    if (aPlayers === bPlayers) return b.options.priority - a.options.priority;
    return aPlayers - bPlayers;
  });
}

// src/utils/sources.ts
var SearchPrefixes = {
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
  local: "local"
};
var URL_REGEX = /^https?:\/\//i;
function isUrl(input) {
  return URL_REGEX.test(input);
}
function buildSearchIdentifier(query, platform = "youtube") {
  if (isUrl(query)) return query;
  const trimmed = query.trim();
  if (/^[a-z]+(search|rec):/i.test(trimmed) || trimmed.startsWith("ftts:")) return trimmed;
  const prefix = SearchPrefixes[platform] ?? SearchPrefixes.youtube;
  return `${prefix}:${trimmed}`;
}

// src/utils/cache.ts
var TTLCache = class {
  constructor(ttl, maxSize) {
    this.ttl = ttl;
    this.maxSize = maxSize;
    this.store = /* @__PURE__ */ new Map();
  }
  /** Returns a live (non-expired) value, or `undefined`. Refreshes LRU order. */
  get(key) {
    const entry = this.store.get(key);
    if (!entry) return void 0;
    if (entry.expires <= Date.now()) {
      this.store.delete(key);
      return void 0;
    }
    this.store.delete(key);
    this.store.set(key, entry);
    return entry.value;
  }
  /** Stores a value, evicting the oldest entry when over capacity. */
  set(key, value) {
    if (this.store.has(key)) this.store.delete(key);
    this.store.set(key, { value, expires: Date.now() + this.ttl });
    if (this.store.size > this.maxSize) {
      const oldest = this.store.keys().next().value;
      if (oldest !== void 0) this.store.delete(oldest);
    }
  }
  clear() {
    this.store.clear();
  }
  get size() {
    return this.store.size;
  }
};

// src/utils/utils.ts
function buildTrack(data, requester) {
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
    requester
  };
}
function partialTrack(track, partial) {
  if (!partial?.length) return track;
  const clone = { ...track };
  const keep = /* @__PURE__ */ new Set(["encoded", ...partial]);
  for (const key of Object.keys(clone)) {
    if (!keep.has(key)) delete clone[key];
  }
  return clone;
}
function isObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function isUnresolvedTrack(item) {
  return item?.unresolved === true;
}
function pickClosestTrack(tracks, ref) {
  if (!tracks.length) return void 0;
  const author = ref.author?.toLowerCase();
  if (author) {
    const byAuthor = tracks.find((t) => {
      const a = t.author?.toLowerCase() ?? "";
      return a.includes(author) || author.includes(a);
    });
    if (byAuthor) return byAuthor;
  }
  if (typeof ref.duration === "number") {
    const byDuration = tracks.find((t) => Math.abs((t.duration || 0) - ref.duration) <= 2e3);
    if (byDuration) return byDuration;
  }
  return tracks[0];
}
function formatDuration(ms) {
  if (!Number.isFinite(ms) || ms < 0) return "00:00";
  const totalSeconds = Math.floor(ms / 1e3);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor(totalSeconds % 3600 / 60);
  const seconds = totalSeconds % 60;
  const pad = (n) => n.toString().padStart(2, "0");
  return hours > 0 ? `${pad(hours)}:${pad(minutes)}:${pad(seconds)}` : `${pad(minutes)}:${pad(seconds)}`;
}
function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
function buildAutoplaySeed(track) {
  const artist = (track.author ?? "").replace(/\s*-\s*topic$/i, "").replace(/vevo\b/gi, "").replace(/\bofficial\b/gi, "").replace(/\s+/g, " ").trim();
  const title = (track.title ?? "").trim();
  if (artist && title) return `${artist} ${title}`;
  return artist || title;
}
function shuffleArray(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

// src/utils/autoplay.ts
function trackKeys(track) {
  const keys = [];
  if (track.identifier) keys.push(track.identifier);
  if (track.uri) keys.push(track.uri);
  return keys;
}
var search = async (manager, query, requester) => {
  const res = await manager.search(query, requester).catch(() => null);
  return res?.tracks ?? [];
};
var youtubeRadio = (manager, previous, requester) => {
  const id = previous.identifier;
  if (!id) return Promise.resolve([]);
  const query = `https://www.youtube.com/watch?v=${id}&list=RD${id}`;
  return search(manager, { query, source: "youtubemusic" }, requester);
};
var soundcloudRelated = (manager, previous, requester) => {
  if (!previous.uri) return Promise.resolve([]);
  const query = `${previous.uri.replace(/\/+$/, "")}/recommended`;
  return search(manager, { query, source: "soundcloud" }, requester);
};
var spotifyRecommendations = (manager, previous, requester) => {
  if (!previous.identifier) return Promise.resolve([]);
  const query = `sprec:seed_tracks=${previous.identifier}`;
  return search(manager, { query, source: "spotify" }, requester);
};
var deezerFlow = (manager, previous, requester) => {
  if (!previous.identifier) return Promise.resolve([]);
  const query = `dzrec:${previous.identifier}`;
  return search(manager, { query, source: "deezer" }, requester);
};
var seedSearch = (manager, previous, requester) => {
  const seed = buildAutoplaySeed(previous);
  if (!seed) return Promise.resolve([]);
  const source = previous.sourceName || manager.options.defaultSearchPlatform;
  return search(manager, { query: seed, source }, requester);
};
function strategyChain(source) {
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
async function resolveAutoplayCandidates(manager, previous, requester) {
  const source = (previous.sourceName ?? "").toLowerCase();
  for (const strategy of strategyChain(source)) {
    const tracks = await strategy(manager, previous, requester).catch(() => []);
    if (tracks.length) return tracks;
  }
  return [];
}

// src/utils/equalizers.ts
var bands = (gains) => gains.map((gain, band) => ({ band, gain }));
var Equalizers = {
  flat: bands(new Array(15).fill(0)),
  bass: bands([0.6, 0.67, 0.67, 0.4, 0.2, 0.05, 0, 0, 0, 0, 0, 0, 0, 0, 0]),
  soft: bands([0, 0, 0, 0, 0, 0, 0, 0, -0.25, -0.25, -0.25, -0.25, -0.25, -0.25, -0.25]),
  treble: bands([-0.1, -0.12, -0.12, -0.12, -0.08, -0.04, 0, 0.1, 0.2, 0.3, 0.35, 0.4, 0.4, 0.4, 0.4]),
  pop: bands([-0.02, -0.01, 0.08, 0.1, 0.15, 0.1, 0.03, -0.02, -0.035, -0.05, -0.05, -0.05, -0.05, -0.05, -0.05]),
  party: bands([0.1, 0.1, 0.05, 0.05, 0.02, 0, 0, 0, 0, 0, 0, 0.02, 0.05, 0.05, 0.1]),
  rock: bands([0.3, 0.25, 0.2, 0.1, 0.05, -0.05, -0.15, -0.2, -0.1, -0.05, 0.05, 0.1, 0.2, 0.25, 0.3]),
  electronic: bands([0.375, 0.35, 0.125, 0, 0, -0.125, -0.125, 0, 0.25, 0.125, 0.15, 0.2, 0.25, 0.35, 0.4]),
  // Lavalink accepts band gains in the range -0.25 … 1.0.
  radio: bands([0.65, 0.45, 0.35, 0.25, 0.2, 0.15, 0.1, 0.05, 0, -0.05, -0.1, -0.15, -0.2, -0.25, -0.25])
};

// src/classes/Filters.ts
var Filters = class {
  constructor(player) {
    this.player = player;
    this.volume = 1;
    this.equalizer = [];
    this.karaoke = null;
    this.timescale = null;
    this.tremolo = null;
    this.vibrato = null;
    this.rotation = null;
    this.distortion = null;
    this.channelMix = null;
    this.lowPass = null;
    this.pluginFilters = {};
  }
  /** Serialises the current filter state into a Lavalink filters payload. */
  toJSON() {
    return {
      volume: this.volume,
      equalizer: this.equalizer,
      karaoke: this.karaoke,
      timescale: this.timescale,
      tremolo: this.tremolo,
      vibrato: this.vibrato,
      rotation: this.rotation,
      distortion: this.distortion,
      channelMix: this.channelMix,
      lowPass: this.lowPass,
      pluginFilters: this.pluginFilters
    };
  }
  /** Pushes the current filter state to the node. Chainable. */
  async apply() {
    await this.player.node.rest.updatePlayer(this.player.guild, { filters: this.toJSON() });
    return this;
  }
  /** Merges a partial filter payload into the current state and applies it. */
  async set(payload) {
    if (payload.volume !== void 0) this.volume = payload.volume;
    if (payload.equalizer !== void 0) this.equalizer = payload.equalizer;
    if (payload.karaoke !== void 0) this.karaoke = payload.karaoke;
    if (payload.timescale !== void 0) this.timescale = payload.timescale;
    if (payload.tremolo !== void 0) this.tremolo = payload.tremolo;
    if (payload.vibrato !== void 0) this.vibrato = payload.vibrato;
    if (payload.rotation !== void 0) this.rotation = payload.rotation;
    if (payload.distortion !== void 0) this.distortion = payload.distortion;
    if (payload.channelMix !== void 0) this.channelMix = payload.channelMix;
    if (payload.lowPass !== void 0) this.lowPass = payload.lowPass;
    if (payload.pluginFilters !== void 0) this.pluginFilters = payload.pluginFilters;
    return this.apply();
  }
  /* ------------------------------- setters ------------------------------- */
  setEqualizer(bands2) {
    this.equalizer = bands2;
    return this;
  }
  /** Applies a named equalizer preset (`bass`, `pop`, `rock`, ...). */
  setPreset(preset) {
    this.equalizer = Equalizers[preset];
    return this;
  }
  setKaraoke(settings) {
    this.karaoke = settings;
    return this;
  }
  setTimescale(settings) {
    this.timescale = settings;
    return this;
  }
  setTremolo(settings) {
    this.tremolo = settings;
    return this;
  }
  setVibrato(settings) {
    this.vibrato = settings;
    return this;
  }
  setRotation(settings) {
    this.rotation = settings;
    return this;
  }
  setDistortion(settings) {
    this.distortion = settings;
    return this;
  }
  setChannelMix(settings) {
    this.channelMix = settings;
    return this;
  }
  setLowPass(settings) {
    this.lowPass = settings;
    return this;
  }
  /** Sets a plugin-specific filter (e.g. lavalink plugins). */
  setPluginFilter(name, value) {
    this.pluginFilters[name] = value;
    return this;
  }
  /* --------------------------- one-shot presets --------------------------- */
  bassboost() {
    return this.setPreset("bass").apply();
  }
  nightcore() {
    return this.setTimescale({ speed: 1.2, pitch: 1.2, rate: 1 }).apply();
  }
  vaporwave() {
    return this.setTimescale({ speed: 0.8, pitch: 0.8, rate: 1 }).apply();
  }
  eightD() {
    return this.setRotation({ rotationHz: 0.2 }).apply();
  }
  tremoloPreset() {
    return this.setTremolo({ frequency: 4, depth: 0.75 }).apply();
  }
  /** Clears every filter and applies the reset. */
  async clear() {
    this.volume = 1;
    this.equalizer = [];
    this.karaoke = null;
    this.timescale = null;
    this.tremolo = null;
    this.vibrato = null;
    this.rotation = null;
    this.distortion = null;
    this.channelMix = null;
    this.lowPass = null;
    this.pluginFilters = {};
    return this.apply();
  }
};

// src/classes/Node.ts
import WebSocket from "ws";

// src/types/Op.ts
var OpCodes = /* @__PURE__ */ ((OpCodes2) => {
  OpCodes2["READY"] = "ready";
  OpCodes2["PLAYER_UPDATE"] = "playerUpdate";
  OpCodes2["STATS"] = "stats";
  OpCodes2["EVENT"] = "event";
  return OpCodes2;
})(OpCodes || {});
var EventTypes = /* @__PURE__ */ ((EventTypes2) => {
  EventTypes2["TrackStartEvent"] = "TrackStartEvent";
  EventTypes2["TrackEndEvent"] = "TrackEndEvent";
  EventTypes2["TrackExceptionEvent"] = "TrackExceptionEvent";
  EventTypes2["TrackStuckEvent"] = "TrackStuckEvent";
  EventTypes2["WebSocketClosedEvent"] = "WebSocketClosedEvent";
  EventTypes2["LyricsFoundEvent"] = "LyricsFoundEvent";
  EventTypes2["LyricsNotFoundEvent"] = "LyricsNotFoundEvent";
  EventTypes2["LyricsLineEvent"] = "LyricsLineEvent";
  EventTypes2["SegmentsLoaded"] = "SegmentsLoaded";
  EventTypes2["SegmentSkipped"] = "SegmentSkipped";
  EventTypes2["ChaptersLoaded"] = "ChaptersLoaded";
  EventTypes2["ChapterStarted"] = "ChapterStarted";
  return EventTypes2;
})(EventTypes || {});

// src/classes/Rest.ts
var Rest = class {
  constructor(node) {
    this.node = node;
    /** The active Lavalink session id (set once the node is `ready`). */
    this.sessionId = null;
    const { host, port, secure } = node.options;
    this.baseUrl = `${secure ? "https" : "http"}://${host}:${port}/v4`;
  }
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
  async request(endpoint, options = {}) {
    const method = options.method ?? "GET";
    const url = new URL(this.baseUrl + endpoint);
    if (options.query) {
      for (const [key, value] of Object.entries(options.query)) {
        if (value !== void 0) url.searchParams.set(key, String(value));
      }
    }
    url.searchParams.set("trace", "true");
    const body = options.body !== void 0 ? JSON.stringify(options.body) : void 0;
    const headers = {
      Authorization: this.node.options.password,
      "Content-Type": "application/json",
      ...options.headers
    };
    const canRetry = options.idempotent ?? method === "GET";
    const maxAttempts = canRetry ? Math.max(1, this.node.options.retryAmount) : 1;
    let lastError;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.node.options.requestTimeout);
      try {
        const response = await fetch(url, { method, headers, body, signal: controller.signal });
        if (response.status === 204) return void 0;
        const text = await response.text();
        const data = text ? JSON.parse(text) : void 0;
        if (!response.ok) {
          const trace = typeof data?.trace === "string" ? ` \u2014 ${data.trace.split("\n")[0]}` : "";
          const message = data && (data.message || data.error) || response.statusText;
          throw new RestError(`Lavalink REST ${response.status} on ${method} ${endpoint}: ${message}${trace}`, response.status);
        }
        return data;
      } catch (error) {
        lastError = error;
        if (error instanceof RestError || attempt >= maxAttempts) throw error;
        const abort = error?.name === "AbortError";
        this.node.manager.emit(
          "debug",
          `[Rest ${this.node.id}] ${method} ${endpoint} ${abort ? "timed out" : "failed"} (${error?.message ?? error}); retry ${attempt}/${maxAttempts - 1}.`
        );
        await sleep(Math.min(this.node.options.retryDelay * attempt, 15e3));
      } finally {
        clearTimeout(timeout);
      }
    }
    throw lastError;
  }
  /* ------------------------------- tracks ------------------------------- */
  loadTracks(identifier) {
    return this.request("/loadtracks", { query: { identifier } });
  }
  decodeTrack(encodedTrack) {
    return this.request("/decodetrack", { query: { encodedTrack } });
  }
  decodeTracks(encodedTracks) {
    return this.request("/decodetracks", { method: "POST", body: encodedTracks });
  }
  /* ------------------------------- players ------------------------------- */
  get sessionPath() {
    if (!this.sessionId) throw new Error(`Node "${this.node.options.identifier}" has no session id yet.`);
    return `/sessions/${this.sessionId}`;
  }
  getPlayers() {
    return this.request(`${this.sessionPath}/players`);
  }
  getPlayer(guildId) {
    return this.request(`${this.sessionPath}/players/${guildId}`);
  }
  updatePlayer(guildId, body, noReplace = false) {
    return this.request(`${this.sessionPath}/players/${guildId}`, {
      method: "PATCH",
      query: { noReplace },
      body
    });
  }
  destroyPlayer(guildId) {
    return this.request(`${this.sessionPath}/players/${guildId}`, { method: "DELETE" });
  }
  /* ------------------------------- session ------------------------------- */
  updateSession(resuming, timeout) {
    return this.request(this.sessionPath, { method: "PATCH", body: { resuming, timeout } });
  }
  /* ------------------------------- node info ------------------------------- */
  getInfo() {
    return this.request("/info");
  }
  getStats() {
    return this.request("/stats");
  }
  /* ------------------------- lyrics (LavaLyrics) ------------------------- */
  /** Fetches lyrics for a guild's currently-playing track. */
  getLyrics(guildId, skipTrackSource = false) {
    return this.request(`${this.sessionPath}/players/${guildId}/track/lyrics`, { query: { skipTrackSource } });
  }
  /** Fetches lyrics for an arbitrary encoded track. */
  getLyricsForTrack(encoded, skipTrackSource = false) {
    return this.request("/lyrics", { query: { track: encoded, skipTrackSource } });
  }
  /** Subscribes to live (line-by-line) lyrics events for a guild. */
  subscribeLyrics(guildId) {
    return this.request(`${this.sessionPath}/players/${guildId}/lyrics/subscribe`, { method: "POST" });
  }
  /** Cancels a live lyrics subscription for a guild. */
  unsubscribeLyrics(guildId) {
    return this.request(`${this.sessionPath}/players/${guildId}/lyrics/subscribe`, { method: "DELETE" });
  }
  /* ----------------------- SponsorBlock plugin ----------------------- */
  /** Sets the SponsorBlock categories the node should skip for a guild. */
  setSponsorBlockCategories(guildId, categories) {
    return this.request(`${this.sessionPath}/players/${guildId}/sponsorblock/categories`, { method: "PUT", body: categories });
  }
  /** Gets the SponsorBlock categories currently enabled for a guild. */
  getSponsorBlockCategories(guildId) {
    return this.request(`${this.sessionPath}/players/${guildId}/sponsorblock/categories`);
  }
  /** Clears all SponsorBlock categories for a guild. */
  clearSponsorBlockCategories(guildId) {
    return this.request(`${this.sessionPath}/players/${guildId}/sponsorblock/categories`, { method: "DELETE" });
  }
};
var RestError = class extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
    this.name = "RestError";
  }
};

// src/classes/Node.ts
var DEFAULTS = {
  port: 2333,
  password: "youshallnotpass",
  secure: false,
  retryAmount: 5,
  retryDelay: 5e3,
  requestTimeout: 1e4,
  resumeTimeout: 60,
  priority: 0,
  search: true,
  playback: true
};
var Node = class {
  constructor(manager, options) {
    this.manager = manager;
    this.socket = null;
    this.stats = null;
    this.info = null;
    this.connected = false;
    this.reconnectAttempts = 0;
    this.reconnectTimer = null;
    this.lastPing = 0;
    this.options = {
      ...DEFAULTS,
      identifier: options.identifier ?? `${options.host}:${options.port ?? DEFAULTS.port}`,
      ...options,
      port: options.port ?? DEFAULTS.port,
      password: options.password ?? DEFAULTS.password
    };
    this.rest = new Rest(this);
  }
  /** The node identifier. */
  get id() {
    return this.options.identifier;
  }
  /** WebSocket round-trip latency in ms (from the last `stats` frame). */
  get ping() {
    return this.lastPing;
  }
  /** Total number of players currently bound to this node. */
  get playerCount() {
    return this.manager.players.filter((p) => p.node === this).size;
  }
  /**
   * A composite load score (lower is better) used by the load-balancing
   * sorters. Combines player count, CPU load and dropped-frame penalties —
   * the same heuristic Lavalink recommends and Erela.js popularised.
   */
  get penalties() {
    if (!this.connected || !this.stats) return Number.MAX_SAFE_INTEGER;
    const playerPenalty = this.stats.playingPlayers;
    const cpuPenalty = Math.pow(1.05, 100 * this.stats.cpu.systemLoad) * 10 - 10;
    let framePenalty = 0;
    if (this.stats.frameStats && this.stats.frameStats.sent > 0) {
      framePenalty += Math.pow(1.03, 500 * (this.stats.frameStats.deficit / 3e3)) * 300 - 300;
      framePenalty += (Math.pow(1.03, 500 * (this.stats.frameStats.nulled / 3e3)) * 300 - 300) * 2;
    }
    return Math.round(playerPenalty + cpuPenalty + framePenalty) - this.options.priority;
  }
  /** Opens the WebSocket connection to the node. */
  connect() {
    if (this.connected || this.socket) return;
    const clientId = this.manager.options.clientId;
    if (!clientId) throw new Error("Cannot connect a node before Moodenglink.init(clientId) is called.");
    const headers = {
      Authorization: this.options.password,
      "User-Id": clientId,
      "Client-Name": this.manager.options.clientName ?? "Moodenglink",
      "Num-Shards": String(this.manager.options.shards ?? 1)
    };
    if (this.rest.sessionId) headers["Session-Id"] = this.rest.sessionId;
    const protocol = this.options.secure ? "wss" : "ws";
    this.socket = new WebSocket(`${protocol}://${this.options.host}:${this.options.port}/v4/websocket`, { headers });
    this.socket.on("open", () => this.onOpen());
    this.socket.on("message", (data) => this.onMessage(data));
    this.socket.on("close", (code, reason) => this.onClose(code, reason.toString()));
    this.socket.on("error", (error) => this.onError(error));
  }
  /** Closes the connection and stops reconnecting. */
  destroy() {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    if (this.socket) {
      this.socket.removeAllListeners();
      this.socket.close(1e3, "destroy");
      this.socket = null;
    }
    this.connected = false;
    this.manager.emit("nodeDestroy", this);
    this.manager.nodes.delete(this.id);
  }
  onOpen() {
    this.reconnectAttempts = 0;
    this.manager.emit("debug", `[Node ${this.id}] WebSocket opened.`);
  }
  async onMessage(raw) {
    let payload;
    try {
      payload = JSON.parse(raw.toString());
    } catch {
      this.manager.emit("debug", `[Node ${this.id}] Failed to parse frame.`);
      return;
    }
    this.manager.emit("nodeRaw", payload);
    switch (payload.op) {
      case "ready" /* READY */: {
        this.connected = true;
        this.rest.sessionId = payload.sessionId;
        this.reconnectAttempts = 0;
        await this.rest.updateSession(true, this.options.resumeTimeout).catch(() => null);
        this.info = await this.rest.getInfo().catch(() => null);
        this.manager.emit("nodeConnect", this);
        this.manager.emit("debug", `[Node ${this.id}] Ready (session=${payload.sessionId}, resumed=${payload.resumed}).`);
        if (this.manager.options.autoResume) await this.manager.resumePlayers(this).catch(() => null);
        break;
      }
      case "stats" /* STATS */: {
        const { op, ...stats } = payload;
        this.stats = stats;
        this.manager.emit("nodeStats", this, this.stats);
        break;
      }
      case "playerUpdate" /* PLAYER_UPDATE */: {
        const player = this.manager.players.get(payload.guildId);
        if (player) {
          this.lastPing = payload.state.ping;
          player.updateState(payload.state);
        }
        break;
      }
      case "event" /* EVENT */: {
        this.manager.emit("raw", payload);
        this.handleEvent(payload);
        break;
      }
    }
  }
  handleEvent(payload) {
    const player = this.manager.players.get(payload.guildId);
    if (!player) return;
    switch (payload.type) {
      case "TrackStartEvent" /* TrackStartEvent */:
        player.handleTrackStart(payload);
        break;
      case "TrackEndEvent" /* TrackEndEvent */:
        player.handleTrackEnd(payload);
        break;
      case "TrackStuckEvent" /* TrackStuckEvent */:
        player.handleTrackStuck(payload);
        break;
      case "TrackExceptionEvent" /* TrackExceptionEvent */:
        player.handleTrackException(payload);
        break;
      case "WebSocketClosedEvent" /* WebSocketClosedEvent */:
        void player.handleSocketClosed(payload);
        break;
      case "LyricsFoundEvent" /* LyricsFoundEvent */:
        this.manager.emit("lyricsFound", player, payload.lyrics, payload);
        break;
      case "LyricsNotFoundEvent" /* LyricsNotFoundEvent */:
        this.manager.emit("lyricsNotFound", player, payload);
        break;
      case "LyricsLineEvent" /* LyricsLineEvent */:
        this.manager.emit("lyricsLine", player, payload.line, payload);
        break;
      case "SegmentsLoaded" /* SegmentsLoaded */:
        this.manager.emit("segmentsLoaded", player, payload.segments, payload);
        break;
      case "SegmentSkipped" /* SegmentSkipped */:
        this.manager.emit("segmentSkipped", player, payload.segment, payload);
        break;
      case "ChaptersLoaded" /* ChaptersLoaded */:
        this.manager.emit("chaptersLoaded", player, payload.chapters, payload);
        break;
      case "ChapterStarted" /* ChapterStarted */:
        this.manager.emit("chapterStarted", player, payload.chapter, payload);
        break;
    }
  }
  onClose(code, reason) {
    this.connected = false;
    this.socket = null;
    this.manager.emit("nodeDisconnect", this, { code, reason });
    this.manager.emit("debug", `[Node ${this.id}] Closed (code=${code}, reason=${reason || "none"}).`);
    if (code !== 1e3) this.reconnect();
  }
  onError(error) {
    this.manager.emit("nodeError", this, error);
  }
  reconnect() {
    if (this.reconnectAttempts >= this.options.retryAmount) {
      this.manager.emit("nodeError", this, new Error(`Ran out of reconnect attempts (${this.options.retryAmount}).`));
      if (this.manager.options.autoMove) void this.manager.handleNodeFailover(this);
      this.destroy();
      return;
    }
    this.reconnectTimer = setTimeout(() => {
      this.reconnectAttempts++;
      this.manager.emit("nodeReconnect", this);
      this.manager.emit("debug", `[Node ${this.id}] Reconnecting (attempt ${this.reconnectAttempts}/${this.options.retryAmount}).`);
      this.connect();
    }, this.options.retryDelay);
  }
};

// src/types/Player.ts
var RepeatMode = /* @__PURE__ */ ((RepeatMode2) => {
  RepeatMode2[RepeatMode2["NONE"] = 0] = "NONE";
  RepeatMode2[RepeatMode2["TRACK"] = 1] = "TRACK";
  RepeatMode2[RepeatMode2["QUEUE"] = 2] = "QUEUE";
  return RepeatMode2;
})(RepeatMode || {});

// src/classes/Player.ts
var Player = class _Player {
  constructor(manager, options, node) {
    this.position = 0;
    this.ping = 0;
    this.timestamp = 0;
    this.playing = false;
    this.paused = false;
    this.connected = false;
    this.state = "DISCONNECTED";
    this.repeatMode = 0 /* NONE */;
    this.autoplay = false;
    /** Raw Discord voice state/server used to hand off to Lavalink. */
    this.voiceState = {};
    /** How many consecutive voice reconnects have been attempted (reset on connect). */
    this.voiceReconnectAttempts = 0;
    /** Guards against overlapping autoplay lookups when a queue drains rapidly. */
    this.autoplaying = false;
    this.manager = manager;
    this.node = node;
    this.guild = options.guild;
    this.voiceChannel = options.voiceChannel ?? null;
    this.textChannel = options.textChannel ?? null;
    this.volume = clamp(options.volume ?? 100, 0, 1e3);
    this.selfMute = options.selfMute ?? false;
    this.selfDeafen = options.selfDeafen ?? true;
    this.data = options.data ?? {};
    this.queue = new (Structure.get("Queue"))();
    this.filters = new (Structure.get("Filters"))(this);
  }
  /** The track currently playing, if any. */
  get current() {
    return this.queue.current;
  }
  /* ------------------------------ connection ------------------------------ */
  /** Joins the configured voice channel via the Discord gateway. */
  connect() {
    if (!this.voiceChannel) throw new Error(`Player "${this.guild}" has no voice channel set.`);
    this.state = "CONNECTING";
    this.manager.options.send(this.guild, {
      op: 4,
      d: {
        guild_id: this.guild,
        channel_id: this.voiceChannel,
        self_mute: this.selfMute,
        self_deaf: this.selfDeafen
      }
    });
    return this;
  }
  /** Leaves the voice channel but keeps the player and queue alive. */
  disconnect() {
    const previous = this.voiceChannel;
    this.state = "DISCONNECTING";
    this.manager.options.send(this.guild, {
      op: 4,
      d: { guild_id: this.guild, channel_id: null, self_mute: false, self_deaf: false }
    });
    this.voiceChannel = null;
    this.connected = false;
    this.state = "DISCONNECTED";
    this.manager.emit("playerDisconnect", this, previous);
    return this;
  }
  /** Moves the player to another voice channel. */
  setVoiceChannel(channelId) {
    this.voiceChannel = channelId;
    this.connect();
    return this;
  }
  /** Rebinds the text channel used for informational events. */
  setTextChannel(channelId) {
    this.textChannel = channelId;
    return this;
  }
  /** Moves this player (and its playback state) to another node. */
  async moveNode(node) {
    if (node === this.node) return this;
    const oldNode = this.node;
    this.state = "MOVING";
    await oldNode.rest.destroyPlayer(this.guild).catch(() => null);
    this.node = node;
    await this.sendVoiceUpdate();
    if (this.current) {
      await this.node.rest.updatePlayer(this.guild, {
        track: { encoded: this.current.encoded },
        position: this.position,
        volume: this.volume,
        paused: this.paused,
        filters: this.filters.toJSON()
      });
    }
    this.state = "CONNECTED";
    this.manager.emit("playerMove", this, oldNode, node);
    return this;
  }
  /* ------------------------------- playback ------------------------------- */
  /** Starts playback. With no options, plays the next queued track. */
  async play(options = {}) {
    let track = null;
    if (options.track) {
      track = isUnresolvedTrack(options.track) ? await this.resolveUnresolved(options.track) : options.track;
    } else {
      while (this.queue.length && !track) {
        const item = this.queue.shift();
        track = isUnresolvedTrack(item) ? await this.resolveUnresolved(item) : item;
      }
    }
    if (!track) throw new Error("Queue is empty \u2014 nothing to play.");
    this.queue.current = track;
    const body = {
      track: { encoded: track.encoded, userData: track.userData ?? {} },
      volume: this.volume
    };
    if (options.startTime !== void 0) body.position = options.startTime;
    if (options.endTime !== void 0) body.endTime = options.endTime;
    if (options.paused !== void 0) body.paused = options.paused;
    await this.node.rest.updatePlayer(this.guild, body, options.noReplace ?? false);
    this.playing = true;
    this.paused = options.paused ?? false;
    this.position = options.startTime ?? 0;
    await this.save();
    return this;
  }
  /** @internal Resolves an unresolved queue item, swallowing failures (returns null). */
  async resolveUnresolved(item) {
    try {
      return await item.resolve();
    } catch (error) {
      this.manager.emit("debug", `[Player ${this.guild}] Failed to resolve "${item.title}": ${error.message}`);
      return null;
    }
  }
  /** Stops the current track. Pass `false` to keep the queue intact. */
  async stop(clearQueue = true) {
    if (clearQueue) this.queue.clear();
    await this.node.rest.updatePlayer(this.guild, { track: { encoded: null } });
    this.playing = false;
    this.queue.current = null;
    return this;
  }
  /** Skips `amount` tracks (default 1) by ending the current track early. */
  async skip(amount = 1) {
    if (amount > 1) this.queue.splice(0, amount - 1);
    await this.node.rest.updatePlayer(this.guild, { track: { encoded: null } });
    return this;
  }
  /** Skips backwards to the previously played track. */
  async previous() {
    const prev = this.queue.previous.shift();
    if (!prev) throw new Error("No previous track to play.");
    if (this.current) this.queue.unshift(this.current);
    return this.play({ track: prev });
  }
  async pause(state = true) {
    await this.node.rest.updatePlayer(this.guild, { paused: state });
    this.paused = state;
    this.playing = !state;
    return this;
  }
  resume() {
    return this.pause(false);
  }
  /** Seeks to `position` ms within the current track. */
  async seek(position) {
    if (!this.current) throw new Error("Nothing is playing.");
    if (!this.current.isSeekable) throw new Error("The current track is not seekable.");
    const target = clamp(position, 0, this.current.duration);
    await this.node.rest.updatePlayer(this.guild, { position: target });
    this.position = target;
    return this;
  }
  /** Sets the volume (0-1000). */
  async setVolume(volume) {
    this.volume = clamp(volume, 0, 1e3);
    await this.node.rest.updatePlayer(this.guild, { volume: this.volume });
    this.filters.volume = this.volume / 100;
    await this.save();
    return this;
  }
  /** Sets the repeat mode (`NONE`, `TRACK`, `QUEUE`). */
  setRepeatMode(mode) {
    this.repeatMode = mode;
    return this;
  }
  /** Toggles autoplay of related tracks when the queue empties. */
  setAutoplay(state) {
    this.autoplay = state;
    return this;
  }
  /** Destroys the player: leaves voice, tears down the node player, forgets it. */
  async destroy(disconnect = true) {
    this.state = "DESTROYING";
    if (disconnect) this.disconnect();
    await this.node.rest.destroyPlayer(this.guild).catch(() => null);
    if (this.manager.options.store) {
      await Promise.resolve(this.manager.options.store.delete(`moodenglink:player:${this.guild}`)).catch(() => null);
    }
    this.manager.players.delete(this.guild);
    this.manager.emit("playerDestroy", this);
  }
  /* ------------------------------ user data ------------------------------ */
  /** Stores an arbitrary value on the player. Chainable. */
  set(key, value) {
    this.data[key] = value;
    return this;
  }
  /** Reads a previously-stored value from the player. */
  get(key) {
    return this.data[key];
  }
  /* ------------------------- lyrics (LavaLyrics) ------------------------- */
  /** Fetches lyrics for the currently-playing track (requires the LavaLyrics plugin). */
  getLyrics(skipTrackSource = false) {
    return this.node.rest.getLyrics(this.guild, skipTrackSource);
  }
  /** Subscribes to live, line-by-line lyrics — listen on the `lyricsLine` event. */
  subscribeLyrics() {
    return this.node.rest.subscribeLyrics(this.guild);
  }
  /** Cancels a live lyrics subscription. */
  unsubscribeLyrics() {
    return this.node.rest.unsubscribeLyrics(this.guild);
  }
  /* ----------------------- SponsorBlock (plugin) ----------------------- */
  /** Sets the SponsorBlock categories to skip — listen on `segmentSkipped`. */
  setSponsorBlock(categories) {
    return this.node.rest.setSponsorBlockCategories(this.guild, categories);
  }
  /** Gets the SponsorBlock categories currently enabled for this player. */
  getSponsorBlock() {
    return this.node.rest.getSponsorBlockCategories(this.guild);
  }
  /** Disables SponsorBlock skipping for this player. */
  clearSponsorBlock() {
    return this.node.rest.clearSponsorBlockCategories(this.guild);
  }
  /* ---------------------------- voice handling ---------------------------- */
  /** @internal Feeds a raw Discord VOICE_STATE_UPDATE / VOICE_SERVER_UPDATE. */
  async setVoiceState(sessionId, event) {
    if (sessionId) this.voiceState.sessionId = sessionId;
    if (event) this.voiceState.event = event;
    if (this.voiceState.sessionId && this.voiceState.event) {
      await this.sendVoiceUpdate();
    }
  }
  async sendVoiceUpdate() {
    const { sessionId, event } = this.voiceState;
    if (!event?.token || !event.endpoint || !sessionId || !this.voiceChannel) return;
    await this.node.rest.updatePlayer(this.guild, {
      voice: {
        token: event.token,
        endpoint: event.endpoint,
        sessionId,
        channelId: this.voiceChannel
      }
    });
  }
  /* --------------------------- internal (Node) --------------------------- */
  /** @internal */
  updateState(state) {
    this.position = state.position;
    this.connected = state.connected;
    this.ping = state.ping;
    this.timestamp = state.time;
    if (state.connected) {
      this.voiceReconnectAttempts = 0;
      if (this.state === "RESUMING" || this.state === "CONNECTING") this.state = "CONNECTED";
    }
    this.manager.emit("playerStateUpdate", this);
  }
  /** @internal */
  handleTrackStart(payload) {
    this.playing = true;
    this.paused = false;
    const track = this.current ?? buildTrack(payload.track);
    this.manager.emit("trackStart", this, track, payload);
  }
  /** @internal */
  async handleTrackEnd(payload) {
    const track = this.current ?? buildTrack(payload.track);
    this.manager.emit("trackEnd", this, track, payload);
    if (payload.reason === "replaced") return;
    if (payload.reason === "loadFailed" || payload.reason === "cleanup") {
      return void this.advance(track, payload);
    }
    if (this.repeatMode === 1 /* TRACK */ && track) {
      return void this.play({ track });
    }
    if (this.repeatMode === 2 /* QUEUE */ && track) {
      this.queue.push(track);
    }
    await this.advance(track, payload);
  }
  async advance(previous, payload) {
    if (previous) this.queue.previous.unshift(previous);
    if (this.queue.previous.length > 50) this.queue.previous.length = 50;
    if (this.queue.length > 0) {
      await this.play().catch((error) => this.manager.emit("nodeError", this.node, error));
      return;
    }
    if ((this.autoplay || this.manager.options.autoPlay) && previous && !this.autoplaying) {
      this.autoplaying = true;
      try {
        const queued = await this.manager.handleAutoplay(this, previous).catch(() => false);
        if (queued) return;
      } finally {
        this.autoplaying = false;
      }
    }
    this.playing = false;
    this.queue.current = null;
    await this.save();
    this.manager.emit("queueEnd", this, previous, payload);
  }
  /** @internal */
  handleTrackStuck(payload) {
    const track = this.current ?? buildTrack(payload.track);
    this.manager.emit("trackStuck", this, track, payload);
  }
  /** @internal */
  handleTrackException(payload) {
    const track = this.current ?? buildTrack(payload.track);
    this.manager.emit("trackError", this, track, payload);
  }
  static {
    /**
     * Voice close codes worth recovering from — session invalidations, timeouts,
     * voice-server crashes and abnormal drops. Fatal ones (4004 auth failed,
     * 4011/4012 unknown, etc.) are left alone.
     */
    this.RECOVERABLE_VOICE_CLOSE = /* @__PURE__ */ new Set([4006, 4009, 4014, 4015, 1006]);
  }
  /** @internal */
  async handleSocketClosed(payload) {
    this.manager.emit("socketClosed", this, payload);
    if (this.state === "DESTROYING" || this.state === "DISCONNECTING" || !this.voiceChannel) return;
    if (!_Player.RECOVERABLE_VOICE_CLOSE.has(payload.code)) return;
    const maxTries = this.manager.options.voiceReconnectTries ?? 3;
    if (this.voiceReconnectAttempts >= maxTries) {
      this.manager.emit("debug", `[Player ${this.guild}] Gave up voice reconnect after ${maxTries} tries (close ${payload.code}).`);
      this.voiceReconnectAttempts = 0;
      return;
    }
    this.voiceReconnectAttempts++;
    const delay = (this.manager.options.voiceReconnectDelay ?? 1e3) * this.voiceReconnectAttempts;
    this.state = "RESUMING";
    this.manager.emit("debug", `[Player ${this.guild}] Voice closed (${payload.code}); reconnect ${this.voiceReconnectAttempts}/${maxTries} in ${delay}ms.`);
    await sleep(delay);
    if (!this.voiceChannel || this.state === "DESTROYING") return;
    try {
      this.connect();
    } catch (error) {
      this.manager.emit("nodeError", this.node, error);
    }
  }
  /* ---------------------------- persistence ---------------------------- */
  /** Serialises the resumable state of this player. */
  toJSON() {
    return {
      guild: this.guild,
      voiceChannel: this.voiceChannel,
      textChannel: this.textChannel,
      node: this.node.id,
      volume: this.volume,
      position: this.position,
      paused: this.paused,
      repeatMode: this.repeatMode,
      autoplay: this.autoplay,
      current: this.current,
      queue: [...this.queue],
      previous: this.queue.previous,
      voiceState: this.voiceState,
      data: this.data
    };
  }
  /** @internal Persists this player to the configured store, if any. */
  async save() {
    const store = this.manager.options.store;
    if (!store) return;
    await Promise.resolve(store.set(`moodenglink:player:${this.guild}`, JSON.stringify(this.toJSON()))).catch(() => null);
  }
};

// src/classes/Queue.ts
var Queue = class extends Array {
  constructor() {
    super(...arguments);
    /** The track that is currently playing (or was, once it ends). Always resolved. */
    this.current = null;
    /** Previously played tracks, most-recent-first. */
    this.previous = [];
  }
  // Derived operations (map/filter/slice/splice) return plain arrays instead of
  // Queue instances — otherwise they'd carry this class's `current`/`previous`
  // fields and leak them into results.
  static get [Symbol.species]() {
    return Array;
  }
  /** Total duration of the upcoming tracks (best-effort for unresolved ones), in ms. */
  get duration() {
    return this.reduce((acc, track) => acc + (track.duration || 0), 0);
  }
  /** Total number of upcoming tracks. */
  get size() {
    return this.length;
  }
  /** Whether there are no upcoming tracks. */
  get isEmpty() {
    return this.length === 0;
  }
  /** Adds one or more tracks (resolved or unresolved) to the queue, or at `offset`. */
  add(track, offset) {
    const tracks = Array.isArray(track) ? track : [track];
    if (offset === void 0 || offset >= this.length) this.push(...tracks);
    else this.splice(offset, 0, ...tracks);
    return this;
  }
  /** Removes and returns tracks. `remove(index)` or `remove(start, end)`. */
  remove(start = 0, end) {
    if (end === void 0) return this.splice(start, 1);
    return this.splice(start, end - start);
  }
  /** Empties all upcoming tracks. */
  clear() {
    this.length = 0;
  }
  /** Shuffles the upcoming tracks in place. */
  shuffle() {
    shuffleArray(this);
  }
  /** Moves a track from one position to another. */
  move(from, to) {
    if (from < 0 || from >= this.length) return;
    const [track] = this.splice(from, 1);
    this.splice(to, 0, track);
  }
  /** Removes duplicate tracks, keeping the first occurrence. */
  dedupe() {
    const seen = /* @__PURE__ */ new Set();
    for (let i = 0; i < this.length; i++) {
      const item = this[i];
      const key = isUnresolvedTrack(item) ? item.uri ?? item.title : item.encoded;
      if (seen.has(key)) {
        this.splice(i, 1);
        i--;
      } else {
        seen.add(key);
      }
    }
  }
};

// src/classes/Structure.ts
var registry = /* @__PURE__ */ new Map();
function baseFor(name) {
  const defaults = { Player, Queue, Node, Filters };
  return defaults[name];
}
var Structure = class _Structure {
  /** Replaces a structure with a subclass produced by `extender`. */
  static extend(name, extender) {
    const extended = extender(_Structure.get(name));
    registry.set(name, extended);
    return extended;
  }
  /** Returns the (possibly extended) constructor registered for `name`. */
  static get(name) {
    if (!registry.has(name)) registry.set(name, baseFor(name));
    return registry.get(name);
  }
  /** Resets a structure back to its built-in implementation (mostly for tests). */
  static reset(name) {
    if (name) registry.delete(name);
    else registry.clear();
  }
};

// src/classes/Moodenglink.ts
var Moodenglink = class extends EventEmitter {
  constructor(options) {
    super();
    this.nodes = new Collection();
    this.players = new Collection();
    this.plugins = new Collection();
    this.initialized = false;
    if (!options?.nodes?.length) throw new Error("Moodenglink requires at least one node.");
    if (typeof options.send !== "function") throw new Error("Moodenglink requires a `send` function.");
    this.options = {
      shards: 1,
      clientName: "Moodenglink/1.0.0",
      autoPlay: false,
      autoMove: true,
      autoResume: false,
      defaultSearchPlatform: "youtube",
      trackPartial: [],
      ...options
    };
    if (options.searchCache) {
      const cfg = options.searchCache === true ? {} : options.searchCache;
      this.searchCache = new TTLCache(cfg.ttl ?? 3e4, cfg.maxSize ?? 100);
    } else {
      this.searchCache = null;
    }
    for (const nodeOptions of this.options.nodes) {
      const node = new (Structure.get("Node"))(this, nodeOptions);
      this.nodes.set(node.id, node);
      this.emit("nodeCreate", node);
    }
  }
  /**
   * Registers the bot's client id and connects every node.
   * Call this once your Discord client is ready.
   */
  init(clientId) {
    if (this.initialized) return this;
    if (clientId) this.options.clientId = clientId;
    if (!this.options.clientId) throw new Error("A clientId is required to initialise Moodenglink.");
    for (const node of this.nodes.values()) node.connect();
    this.initialized = true;
    this.emit("debug", `[Moodenglink] Initialised with ${this.nodes.size} node(s).`);
    return this;
  }
  /* ------------------------------- nodes ------------------------------- */
  /** Adds and connects a node at runtime. */
  addNode(options) {
    const node = new (Structure.get("Node"))(this, options);
    this.nodes.set(node.id, node);
    this.emit("nodeCreate", node);
    if (this.initialized) node.connect();
    return node;
  }
  /** The best available node according to the configured sorter. */
  get idealNode() {
    const sorter = this.options.sorter ?? leastUsedNode;
    const sorted = sorter(this.nodes.filter((n) => n.connected && n.options.playback));
    const node = sorted.first();
    if (!node) throw new Error("No connected nodes are available.");
    return node;
  }
  searchNode() {
    const sorter = this.options.sorter ?? leastUsedNode;
    const candidates = this.nodes.filter((n) => n.connected && n.options.search);
    const node = sorter(candidates).first() ?? this.nodes.filter((n) => n.connected).first();
    if (!node) throw new Error("No connected nodes are available for searching.");
    return node;
  }
  /* ------------------------------ players ------------------------------ */
  /** Creates (or returns the existing) player for a guild. */
  create(options) {
    const existing = this.players.get(options.guild);
    if (existing) return existing;
    const node = options.node ? this.nodes.get(options.node) : void 0;
    const player = new (Structure.get("Player"))(this, options, node?.connected ? node : this.idealNode);
    this.players.set(options.guild, player);
    this.emit("playerCreate", player);
    return player;
  }
  /** Gets an existing player. */
  get(guild) {
    return this.players.get(guild);
  }
  /** Destroys a guild's player, if any. */
  async destroy(guild) {
    await this.players.get(guild)?.destroy();
  }
  /* ------------------------------ searching ------------------------------ */
  /**
   * Resolves a query into playable tracks via a node's `loadtracks` endpoint.
   * Accepts a raw string or a `{ query, source }` object.
   */
  async search(query, requester) {
    const node = this.searchNode();
    const raw = typeof query === "string" ? query : query.query;
    const source = (typeof query === "string" ? void 0 : query.source) ?? this.options.defaultSearchPlatform;
    const identifier = buildSearchIdentifier(raw, source);
    const cached = this.searchCache?.get(identifier);
    if (cached) {
      return {
        ...cached,
        playlist: cached.playlist ? { ...cached.playlist } : cached.playlist,
        tracks: cached.tracks.map((t) => ({ ...structuredClone(t), requester }))
      };
    }
    const res = await node.rest.loadTracks(identifier);
    const result = this.resolveLoadResult(res, requester);
    if (this.searchCache && (result.loadType === "track" || result.loadType === "search" || result.loadType === "playlist")) {
      this.searchCache.set(identifier, {
        ...result,
        playlist: result.playlist ? { ...result.playlist } : result.playlist,
        tracks: result.tracks.map((t) => structuredClone({ ...t, requester: void 0 }))
      });
    }
    return result;
  }
  resolveLoadResult(res, requester) {
    const result = { loadType: res.loadType, tracks: [], playlist: null, exception: null };
    const make = (data) => partialTrack(buildTrack(data, requester), this.options.trackPartial ?? []);
    switch (res.loadType) {
      case "track":
        result.tracks = [make(res.data)];
        break;
      case "search":
        result.tracks = res.data.map(make);
        break;
      case "playlist": {
        const data = res.data;
        result.tracks = data.tracks.map(make);
        result.playlist = {
          name: data.info.name,
          selectedTrack: data.info.selectedTrack,
          duration: result.tracks.reduce((acc, t) => acc + (t.duration || 0), 0)
        };
        break;
      }
      case "error":
        result.exception = res.data;
        break;
      case "empty":
      default:
        break;
    }
    return result;
  }
  /** Decodes a base64 track back into a {@link Track}. */
  async decodeTrack(encoded, requester) {
    const node = this.searchNode();
    const data = await node.rest.decodeTrack(encoded);
    return buildTrack(data, requester);
  }
  /* ------------------------------ autoplay ------------------------------ */
  /**
   * @internal Queues a related track when a queue ends (best-effort).
   *
   * Draws candidates from the finished track's platform radio/recommendation
   * feed (falling back to a cleaned seed search), filters out anything already
   * heard or queued to avoid loops, then samples from the most-relevant head of
   * the list for a little variety — much like Riffy's autoplay.
   */
  async handleAutoplay(player, previous) {
    if (!previous) return false;
    const seedRequester = previous.requester;
    const requester = "autoplayRequester" in this.options ? this.options.autoplayRequester : previous.requester;
    const candidates = await resolveAutoplayCandidates(this, previous, seedRequester).catch(() => []);
    if (!candidates.length) return false;
    const seen = /* @__PURE__ */ new Set();
    const mark = (track) => {
      if (track) for (const key of trackKeys(track)) seen.add(key);
    };
    mark(previous);
    mark(player.queue.current);
    for (const track of player.queue.previous) mark(track);
    for (const item of player.queue) mark(item);
    const fresh = candidates.filter((t) => !trackKeys(t).some((key) => seen.has(key)));
    const previousKeys = new Set(trackKeys(previous));
    const pool = fresh.length ? fresh : candidates.filter((t) => !trackKeys(t).some((key) => previousKeys.has(key)));
    if (!pool.length) return false;
    const window = Math.max(1, Math.min(this.options.autoplaySampleSize ?? 5, pool.length));
    const next = { ...pool[Math.floor(Math.random() * window)], requester };
    player.queue.add(next);
    await player.play();
    return true;
  }
  /* ---------------------------- voice updates ---------------------------- */
  /**
   * Feed raw Discord gateway VOICE_STATE_UPDATE / VOICE_SERVER_UPDATE packets here.
   * Wire this to your library's raw event handler.
   */
  updateVoiceState(data) {
    if (!data?.t) return;
    if (data.t === "VOICE_SERVER_UPDATE") {
      const event = data.d;
      const player = this.players.get(event.guild_id);
      if (!player) return;
      void player.setVoiceState(void 0, event);
      return;
    }
    if (data.t === "VOICE_STATE_UPDATE") {
      const state = data.d;
      if (state.user_id !== this.options.clientId) return;
      const player = this.players.get(state.guild_id);
      if (!player) return;
      if (!state.channel_id) {
        void player.destroy();
        return;
      }
      player.voiceChannel = state.channel_id;
      void player.setVoiceState(state.session_id);
    }
  }
  /* ----------------------------- resilience ----------------------------- */
  /** @internal Migrates all players off a dead node onto the next best one. */
  async handleNodeFailover(deadNode) {
    const target = this.nodes.filter((n) => n !== deadNode && n.connected && n.options.playback).first();
    if (!target) return;
    const affected = this.players.filter((p) => p.node === deadNode);
    for (const player of affected.values()) {
      await player.moveNode(target).catch((error) => this.emit("nodeError", target, error));
    }
  }
  /** @internal Restores persisted players onto a freshly-connected node. */
  async resumePlayers(node) {
    const store = this.options.store;
    if (!store) return;
    const keys = await Promise.resolve(store.keys());
    for (const key of keys) {
      if (!key.startsWith("moodenglink:player:")) continue;
      const raw = await Promise.resolve(store.get(key));
      if (!raw) continue;
      try {
        const data = JSON.parse(raw);
        if (data.node !== node.id) continue;
        const player = this.create({
          guild: data.guild,
          voiceChannel: data.voiceChannel ?? void 0,
          textChannel: data.textChannel ?? void 0,
          node: node.id,
          volume: data.volume
        });
        player.repeatMode = data.repeatMode;
        player.autoplay = data.autoplay;
        if (Array.isArray(data.queue)) player.queue.add(data.queue);
        if (data.current) player.queue.current = data.current;
        if (Array.isArray(data.previous)) player.queue.previous = data.previous;
        player.connect();
        if (player.queue.current) {
          const current = player.queue.current;
          const saved = typeof data.position === "number" ? data.position : 0;
          const startTime = current.isStream ? 0 : Math.max(0, Math.min(saved, current.duration || saved));
          await player.play({ track: current, startTime });
        }
        this.emit("debug", `[Moodenglink] Resumed player for guild ${data.guild}.`);
      } catch {
      }
    }
  }
  /* ------------------------------ plugins ------------------------------ */
  /** Registers a plugin instance. */
  use(plugin) {
    if (this.plugins.has(plugin.name)) return this;
    this.plugins.set(plugin.name, plugin);
    plugin.load(this);
    this.emit("debug", `[Moodenglink] Loaded plugin "${plugin.name}".`);
    return this;
  }
  /* -------------------------- unresolved tracks -------------------------- */
  /** Resolves an {@link UnresolvedQuery} into a playable {@link Track}. */
  async resolve(query) {
    const search2 = `${query.author ? `${query.author} - ` : ""}${query.title}`;
    const res = await this.search({ query: query.uri ?? search2, source: query.source }, query.requester).catch(() => null);
    if (!res?.tracks.length) return null;
    return pickClosestTrack(res.tracks, query) ?? res.tracks[0];
  }
  /**
   * Wraps a query into an {@link UnresolvedTrack} you can push straight onto a
   * queue. It is resolved to a playable track lazily, the moment it plays —
   * ideal for Spotify/Apple metadata that only YouTube/SoundCloud can stream.
   */
  buildUnresolved(query) {
    const manager = this;
    const unresolved = {
      unresolved: true,
      title: query.title,
      author: query.author,
      duration: query.duration,
      uri: query.uri,
      sourceName: query.source,
      isrc: null,
      artworkUrl: null,
      pluginInfo: {},
      userData: {},
      requester: query.requester,
      async resolve() {
        const track = await manager.resolve(query);
        if (!track) throw new Error(`No playable match for "${query.title}".`);
        track.requester = query.requester;
        return track;
      }
    };
    return unresolved;
  }
  /** Cleanly disconnects every node and destroys every player. */
  async destroyAll() {
    for (const player of this.players.values()) await player.destroy().catch(() => null);
    for (const node of this.nodes.values()) node.destroy();
  }
};

// src/classes/Plugin.ts
var Plugin = class {
  /** Called once when the plugin is registered on a {@link Moodenglink} manager. */
  load(_manager) {
  }
  /** Called when the plugin is removed / the manager is destroyed. */
  unload(_manager) {
  }
};

// src/classes/stores.ts
var MemoryStore = class {
  constructor() {
    this.map = /* @__PURE__ */ new Map();
  }
  get(key) {
    return this.map.get(key) ?? null;
  }
  set(key, value) {
    this.map.set(key, value);
  }
  delete(key) {
    this.map.delete(key);
  }
  keys() {
    return [...this.map.keys()];
  }
};
var RedisStore = class {
  constructor(redis, prefix = "") {
    this.redis = redis;
    this.prefix = prefix;
  }
  get(key) {
    return this.redis.get(this.prefix + key);
  }
  set(key, value) {
    return this.redis.set(this.prefix + key, value);
  }
  delete(key) {
    return this.redis.del(this.prefix + key);
  }
  async keys() {
    const keys = await this.redis.keys(`${this.prefix}moodenglink:player:*`);
    return this.prefix ? keys.map((k) => k.slice(this.prefix.length)) : keys;
  }
};

// src/sorter/leastLoadNode.ts
function leastLoadNode(nodes) {
  return nodes.filter((node) => node.connected).sort((a, b) => a.penalties - b.penalties);
}

// src/index.ts
var version = "1.0.0";
export {
  Equalizers,
  EventTypes,
  Filters,
  Moodenglink as Manager,
  MemoryStore,
  Moodenglink,
  Node,
  OpCodes,
  Player,
  Plugin,
  Queue,
  RedisStore,
  RepeatMode,
  Rest,
  RestError,
  SearchPrefixes,
  Structure,
  TTLCache,
  buildAutoplaySeed,
  buildSearchIdentifier,
  buildTrack,
  clamp,
  formatDuration,
  isObject,
  isUnresolvedTrack,
  isUrl,
  leastLoadNode,
  leastUsedNode,
  partialTrack,
  pickClosestTrack,
  shuffleArray,
  sleep,
  version
};
//# sourceMappingURL=index.mjs.map