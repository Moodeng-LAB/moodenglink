---
"moodenglink": minor
---

Round out [NodeLink](https://github.com/PerformanC/NodeLink) support (`node.isNodeLink`, added in 1.10.0):

- `search()`/`play()` now handle NodeLink's extended `loadType`s (`album`, `artist`, `podcast`, `station`) the same as standard Lavalink's `playlist` — every track is queued and `result.playlist` is populated instead of silently coming back empty.
- `player.getLyrics()` / `node.rest.getLyricsForTrack()` now detect NodeLink and transparently route through its `/v4/loadlyrics` endpoint (a different shape than Lavalink's LavaLyrics-plugin REST paths), mapping the response back into the same `LyricsResult` shape — no plugin required on NodeLink, no branching required in your code.
