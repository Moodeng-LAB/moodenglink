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
- ✅ **Voice hardening** — recover from voice close codes (4006/4009/4014/4015/1006)
      with capped, backing-off reconnects; counter resets on a healthy connection;
      never fights an intentional disconnect/destroy
- ✅ **Autoplay** related tracks with repeat de-duplication
- ✅ **Search cache** — opt-in TTL/LRU (`TTLCache`), re-stamps requester on hits
- ✅ **REST resilience** — retry transient failures, `?trace=true`, typed `RestError`
- ✅ **Lyrics** (LavaLyrics) — static + live line events (`lyricsFound/Line/NotFound`)
- ✅ **SponsorBlock** — set/get/clear categories + `segmentsLoaded` / `segmentSkipped` /
      `chaptersLoaded` / `chapterStarted` events
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
- ✅ **Test suite (Vitest)** — 71 tests across queue, cache, sources, utils, equalizers,
      stores, filters, node penalties and a mocked manager/search/voice integration
      (found & fixed 3 bugs: Queue species leak, `dedupe` order, out-of-range EQ gain)
- ✅ **Release automation** — [changesets](https://github.com/changesets/changesets) +
      `.github/workflows/release.yml`: contributors add a changeset, the workflow opens a
      "Version Packages" PR, and merging it publishes to npm (public, with provenance)
- ✅ **Published to npm** — `moodenglink@1.0.0` live (`npm install moodenglink`)

---

## 🚧 In progress

- _Nothing actively in progress — see Planned below._

---

## 📋 Planned (next up)

- _Nothing actively planned — `1.0.0` is live on npm; releases now run via changesets._

## 🚫 Not applicable (by architecture)

- **DAVE / voice E2EE** — Discord's DAVE (MLS-based A/V end-to-end encryption) is
  negotiated on the **voice transport**, which in a Lavalink setup is owned by the
  **Lavalink server**, not this client wrapper. Moodenglink only forwards the voice
  `token`/`endpoint`/`sessionId`/`channelId`, so there is nothing to implement here —
  and Discord disables E2EE on any call a bot is in, so music bots are unaffected.
  If the node adds DAVE, Moodenglink already works with it unchanged.

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

## Releasing

Releases run on [changesets](https://github.com/changesets/changesets):

1. **Describe your change** — run `npm run changeset`, pick the bump (patch/minor/major)
   and write a summary. Commit the generated `.changeset/*.md` file with your PR.
2. **Version PR** — once changesets land on `main`, the `Release` workflow opens (or
   updates) a **"chore: version packages"** PR that bumps `package.json` and updates the
   changelog.
3. **Publish** — merge that PR. The workflow runs `changeset publish` (which rebuilds
   `dist` via `prepublishOnly`) and pushes the package to npm with provenance, plus a git
   tag.

**One-time setup** (repo admin):

- Add an **`NPM_TOKEN`** repo secret (npm → Access Tokens → _Automation_ token).
- The first `1.0.0` publish is a manual bootstrap — from a clean `main` run
  `npm publish --access public` locally once. Every release after that goes through the
  changesets flow above.

