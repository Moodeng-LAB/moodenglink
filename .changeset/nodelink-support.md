---
"moodenglink": minor
---

Add full [NodeLink](https://github.com/PerformanC/NodeLink) support:

- `node.isNodeLink` reports whether a connected node is NodeLink (`true`), Lavalink (`false`), or unresolved (`null` until `/v4/info` returns on READY).
- `search()`/`play()` now handle NodeLink's extended `loadType`s (`album`, `artist`, `podcast`, `station`) the same as standard Lavalink's `playlist` — every track is queued and `result.playlist` is populated instead of silently coming back empty.

NodeLink already speaks the same `/v4` REST/WebSocket protocol as Lavalink otherwise, so no other connection or playback behavior needed to change.
