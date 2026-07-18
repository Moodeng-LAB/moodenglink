# moodenglink

## 1.7.0

### Minor Changes

- e4524ed: Harden production playback, nodes, REST and persistence:

  - prevent delayed/stale track events, exception double-skips, command races, and autoplay from replacing newer user intent
  - reconnect clean remote closes, ignore old-node frames after failover, preserve retry budgets until READY, and reconcile empty local state
  - add source/filter/plugin capability validation with optional strict failover
  - retry idempotent transient HTTP failures and expose structured `RestError` / `RestNetworkError` diagnostics
  - restore paused state, filters, data and unresolved tracks; serialize store writes and use Redis SCAN when available
  - keep the public `version` export synchronized with package.json and harden the Changesets release workflow

## 1.6.0

### Minor Changes

- f41ee29: Add an additive beginner-to-advanced API layer:

  - `Moodenglink.simple()` presets and one-call `manager.play()`
  - shared `playerDefaults` and configurable player lifecycle behavior
  - fuzzy/declarative queue query and bulk removal helpers
  - direct URL allow/deny/custom search policy with typed `SearchPolicyError`
  - machine-readable player destroy reasons while preserving `destroy(boolean)`

## 1.5.0

### Minor Changes

- 39c46c1: Simplification, plugin lifecycle, and docs:

  - **`manager.removePlugin(plugin | name)`** — unregisters a plugin and runs its `unload` hook (previously `unload` was never called). `destroyAll()` now also unloads every registered plugin, making it a full teardown.
  - Fixed the stale hardcoded `clientName` default (`"Moodenglink/1.0.0"` → `"Moodenglink"`) so the `Client-Name` header no longer reports an old version.
  - Rewrote the README: centered header, table of contents, highlights, a Node-options table, and docs for `autoplayRequester`, `voiceReconnectTries`/`voiceReconnectDelay`, and the interpolated `player.position`.

## 1.4.0

### Minor Changes

- 2d5565b: Stability & correctness hardening, aligned with how mature Lavalink clients (lavalink-client, shoukaku) behave:

  - **Repeat no longer fires on stop/skip.** `RepeatMode.TRACK`/`QUEUE` previously replayed or re-queued a track on _any_ end reason, so a manual `skip()` or `stop()` while repeat was on would replay the same track. Repeat now applies only to a track that finished on its own.
  - **`stop()` no longer autoplays or advances.** Stopping now ends playback cleanly (records the track in history, keeps the queue for `stop(false)`) instead of pulling in an autoplay track or skipping to the next one. `skip()` and `stop()` are told apart by intent even though Lavalink reports both as `"stopped"`.
  - **No replay on transient reconnect.** When a dropped WebSocket is resumed (`ready.resumed === true`) the node is still playing, so the client no longer re-issues `play()` from the persisted position — which used to restart/jump every live track. Store-based restore now runs only on a cold session.
  - **No unhandled promise rejections.** The async track-end and socket-closed handlers are now guarded at the node dispatch, surfacing failures via `nodeError` instead of crashing the process.
  - **Live position interpolation.** `player.position` now interpolates from the last node report using elapsed time (clamped to the track duration, frozen while paused) so progress bars stay accurate between the ~5s updates.
  - **Incremental node reconnect backoff** (capped at 60s) so a node that stays down isn't hammered on a fixed interval.

  Adds a dedicated `player.test.ts` suite (18 cases) covering the playback state machine — advancing, repeat modes, stop/skip intent, autoplay gating and position interpolation.

## 1.3.0

### Minor Changes

- 5f515a9: Performance: hot-path allocation & CPU reductions (no behaviour change).

  - **Node selection** (`idealNode` / internal search node, run on every play & search) now fast-paths single-node deployments and, for the default load-balancer, selects via an allocation-free O(n) min-scan instead of `filter().sort().first()`. Benchmarks: ~6× faster for 1 node, ~8× for 3, ~16× for 12. Custom `sorter`s are still honoured verbatim.
  - **`Node.playerCount`** no longer allocates an intermediate Collection — ~11× faster over 1,000 players.
  - **WebSocket frame dispatch** is now synchronous on the common path; only the one-off `ready` frame does async work, so routine `playerUpdate`s (one per active player every few seconds) no longer allocate a Promise per frame.
  - Added `"sideEffects": false` so consumer bundlers can tree-shake unused exports.

## 1.2.0

### Minor Changes

- b40ce53: Reliability & correctness fixes:

  - **autoResume:** players now resume from their persisted position instead of restarting from 0:00 (clamped to the track duration, skipped for live streams).
  - **REST retries:** transient failures now use an incremental, capped backoff and only retry idempotent requests (`GET` by default, or opt-in via `RequestOptions.idempotent`) — a lost `PATCH /players` response can no longer replay playback.
  - **Player.connect:** no longer marks `connected`/`CONNECTED` optimistically; the player stays `CONNECTING` until Lavalink reports a live voice connection via the first playerUpdate.
  - **searchCache:** cached entries are deep-cloned on read and stored requester-free, so a consumer mutating a nested track field can't poison later cache hits.
  - **Autoplay requester:** new `autoplayRequester` manager option to stamp autoplay-queued tracks (e.g. the client user or `null`) instead of inheriting the previous track's requester. Defaults to the previous behaviour when omitted.

## 1.1.0

### Minor Changes

- 7e07bbe: Riffy-style, source-aware autoplay. When a queue drains, recommendations are now
  drawn from each platform's own radio/recommendation feed — YouTube "Mix" (`RD`)
  radios, SoundCloud `recommended`, Spotify `sprec` and Deezer `dzrec` seeds — with
  a graceful fallback to a cleaned seed search. Candidates are deduped against
  everything already heard or queued (by identifier **and** uri) to prevent loops,
  and sampled from the most-relevant head of the list for variety
  (`autoplaySampleSize`, default `5`). A per-player guard prevents overlapping
  autoplay lookups when a queue drains rapidly.

## 1.0.3

### Patch Changes

- 804e6a8: Add `publishConfig.access=public` so the package is always published publicly,
  independent of any local npm config.

## 1.0.2

### Patch Changes

- Sanitize the autoplay search seed. Previously `handleAutoplay` searched with the finished track's raw `author`, which for YouTube-sourced tracks is the auto-generated channel name (`"<Artist> - Topic"`, `"<Artist>VEVO"`) — looping autoplay back onto the same channel. The seed is now cleaned (strips `- Topic`, trailing `VEVO`, `Official`) and combined with the track title for a genuine recommendation, falling back to the title when no artist survives.

## 1.0.1

### Patch Changes

- d8d1533: Add npm version, downloads, CI, and license badges to the README.
