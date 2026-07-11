---
"moodenglink": minor
---

Performance: hot-path allocation & CPU reductions (no behaviour change).

- **Node selection** (`idealNode` / internal search node, run on every play & search) now fast-paths single-node deployments and, for the default load-balancer, selects via an allocation-free O(n) min-scan instead of `filter().sort().first()`. Benchmarks: ~6× faster for 1 node, ~8× for 3, ~16× for 12. Custom `sorter`s are still honoured verbatim.
- **`Node.playerCount`** no longer allocates an intermediate Collection — ~11× faster over 1,000 players.
- **WebSocket frame dispatch** is now synchronous on the common path; only the one-off `ready` frame does async work, so routine `playerUpdate`s (one per active player every few seconds) no longer allocate a Promise per frame.
- Added `"sideEffects": false` so consumer bundlers can tree-shake unused exports.
