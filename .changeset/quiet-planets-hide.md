---
"moodenglink": minor
---

Stability & correctness hardening, aligned with how mature Lavalink clients (lavalink-client, shoukaku) behave:

- **Repeat no longer fires on stop/skip.** `RepeatMode.TRACK`/`QUEUE` previously replayed or re-queued a track on *any* end reason, so a manual `skip()` or `stop()` while repeat was on would replay the same track. Repeat now applies only to a track that finished on its own.
- **`stop()` no longer autoplays or advances.** Stopping now ends playback cleanly (records the track in history, keeps the queue for `stop(false)`) instead of pulling in an autoplay track or skipping to the next one. `skip()` and `stop()` are told apart by intent even though Lavalink reports both as `"stopped"`.
- **No replay on transient reconnect.** When a dropped WebSocket is resumed (`ready.resumed === true`) the node is still playing, so the client no longer re-issues `play()` from the persisted position — which used to restart/jump every live track. Store-based restore now runs only on a cold session.
- **No unhandled promise rejections.** The async track-end and socket-closed handlers are now guarded at the node dispatch, surfacing failures via `nodeError` instead of crashing the process.
- **Live position interpolation.** `player.position` now interpolates from the last node report using elapsed time (clamped to the track duration, frozen while paused) so progress bars stay accurate between the ~5s updates.
- **Incremental node reconnect backoff** (capped at 60s) so a node that stays down isn't hammered on a fixed interval.

Adds a dedicated `player.test.ts` suite (18 cases) covering the playback state machine — advancing, repeat modes, stop/skip intent, autoplay gating and position interpolation.
