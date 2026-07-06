# 🗺️ Moodenglink Roadmap & Status

Living status of the project. Legend: ✅ done · 🚧 in progress · 📋 planned · 💡 idea

Last updated: 2026-07-06

---

## ✅ Done

### Core

- ✅ **Manager (`Moodenglink`)** — nodes, players, search, init, plugins, `destroyAll`
- ✅ **Node** — WebSocket lifecycle, auto-reconnect w/ backoff, stats, `info`
- ✅ **Rest** — full Lavalink v4 REST wrapper (native `fetch`)
- ✅ **Player** — voice connect/disconnect, playback, seek, volume, pause/resume
- ✅ **Queue** — history (`previous`), repeat modes, shuffle, move, remove, dedupe
- ✅ **Filters** — 15-band EQ + presets, nightcore/vaporwave/8D/karaoke/timescale…
- ✅ **Plugin** base class + registration (`manager.use`)

### Lavalink v4 protocol

- ✅ WebSocket ops: `ready`, `stats`, `playerUpdate`, `event`
- ✅ Track events: start / end / stuck / exception / websocketClosed
- ✅ Session **resuming** (node-side, `Session-Id` header on reconnect)
- ✅ **Voice handling** — `channelId` in voice payload + guard for partial/null state
      (fixes the `Field 'channelId' is required … $.voice` 400 on some node builds)
- ✅ Search: track / playlist / search / empty / error, platform prefixes

### Systems & optimizations

- ✅ **Load balancing** — `Node.penalties` (Erela-style) + `leastUsedNode` / `leastLoadNode`
- ✅ **Auto failover** (`autoMove`) — migrate players off a dead node
- ✅ **Autoplay** related tracks with repeat de-duplication
- ✅ **Search cache** — opt-in TTL/LRU (`TTLCache`), re-stamps requester on hits
- ✅ **REST resilience** — retry transient failures, `?trace=true`, typed `RestError`
- ✅ **Lyrics** (LavaLyrics) — static + live line events (`lyricsFound/Line/NotFound`)
- ✅ **Unresolved tracks** — `manager.buildUnresolved(query)` queue items resolved
      lazily at `play()` time (Spotify/Apple metadata → playable), closest-match
      heuristic, failed items skipped automatically
- ✅ **Persistence / resume** — `SessionStore` + `MemoryStore` & `RedisStore` adapters
- ✅ **`Structure.extend()`** — subclass Player / Queue / Node / Filters; the manager
      instantiates the extended classes everywhere (Erela/Magmastream-style)
- ✅ Player user-data helpers (`set` / `get`)

### Tooling / distribution

- ✅ TypeScript, strict; builds CJS + ESM + `.d.ts` (tsup)
- ✅ `dist/` committed so `bun add github:…` / git installs work with no build step
- ✅ **CI** — GitHub Actions: type-check + **test** + build + auto-commit `dist` on push
- ✅ **Test suite (Vitest)** — 50 tests across queue, cache, sources, utils, equalizers,
      stores, filters, node penalties and a mocked manager/search/voice integration
      (found & fixed 3 bugs: Queue species leak, `dedupe` order, out-of-range EQ gain)

---

## 🚧 In progress

- _Nothing actively in progress — see Planned below._

---

## 📋 Planned (next up)

- 📋 **SponsorBlock** plugin support (categories + `SegmentsLoaded/Skipped` events)
- 📋 **Voice hardening** — region-change handling, resume-after-move, 4014 rejoin backoff
- 📋 **npm publish** — release workflow + semantic-release / changesets

---

## 💡 Ideas / backlog

- 💡 Typedoc API docs site
- 💡 `manager.search` source auto-detection from URL host (spotify/deezer/apple)
- 💡 Per-guild default volume & filters config
- 💡 Prometheus/metrics hook for node stats
- 💡 Chapter / segment metadata passthrough from `pluginInfo`

---

## Contributing notes

- `dist/` is committed. **Run `npm run build` before committing** source changes, or
  just let CI refresh it (`build: update dist [skip ci]`).
- Keep changes typed and formatted: `npm run format`, `npx tsc --noEmit`.
