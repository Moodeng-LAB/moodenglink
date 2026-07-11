---
"moodenglink": minor
---

Simplification, plugin lifecycle, and docs:

- **`manager.removePlugin(plugin | name)`** — unregisters a plugin and runs its `unload` hook (previously `unload` was never called). `destroyAll()` now also unloads every registered plugin, making it a full teardown.
- Fixed the stale hardcoded `clientName` default (`"Moodenglink/1.0.0"` → `"Moodenglink"`) so the `Client-Name` header no longer reports an old version.
- Rewrote the README: centered header, table of contents, highlights, a Node-options table, and docs for `autoplayRequester`, `voiceReconnectTries`/`voiceReconnectDelay`, and the interpolated `player.position`.
