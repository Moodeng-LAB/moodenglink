---
"moodenglink": minor
---

Add NodeLink detection: `node.isNodeLink` reports whether a connected node is a [NodeLink](https://github.com/PerformanC/NodeLink) instance (`true`), Lavalink (`false`), or unresolved (`null` until `/v4/info` returns on READY). NodeLink already speaks the same `/v4` REST/WebSocket protocol, so no other connection or playback behavior changes — this is purely informational for consumers that want to branch on node kind.
