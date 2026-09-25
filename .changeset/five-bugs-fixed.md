---
"moodenglink": patch
---

Fix five production bugs found while auditing real-world usage:

- `Player.save()` no longer throws on a circular `toJSON()` snapshot (e.g. a host-app `requester` object referencing back to its own client) — serialises with a cycle-safe stringify and reports failures via `storeError` instead of rejecting, since several internal call sites fire it with `void` and have no way to catch a rejection.
- `Moodenglink.updateVoiceState()`'s two voice-state dispatches are now caught and reported via `nodeError` instead of producing unhandled promise rejections when a node's REST call fails during an outage.
- `handleTrackEnd()` no longer strands the player when a node re-encodes the same track (LavaSrc/Spotify rewrite, resume rehydration) — matched by track identifier instead of the raw `encoded` blob, so a legitimate re-encode isn't treated as an orphan event.
- `resumePlayers()` now cleans up a malformed persisted player (deletes the store key, destroys any half-created player) instead of only logging, so a corrupt snapshot doesn't retry forever on every future resume.
- Default node selection (no custom `sorter` configured) now scores nodes by `node.penalties` (player count + CPU + frame-drop load, priority folded in) instead of raw `stats.playingPlayers`, which ignored CPU/frame load and, being sourced from Lavalink's periodic stats broadcast, tied to node insertion order between broadcasts instead of actually spreading load.
