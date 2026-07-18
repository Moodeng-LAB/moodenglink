---
"moodenglink": minor
---

Harden production playback, nodes, REST and persistence:

- prevent delayed/stale track events, exception double-skips, command races, and autoplay from replacing newer user intent
- reconnect clean remote closes, ignore old-node frames after failover, preserve retry budgets until READY, and reconcile empty local state
- add source/filter/plugin capability validation with optional strict failover
- retry idempotent transient HTTP failures and expose structured `RestError` / `RestNetworkError` diagnostics
- restore paused state, filters, data and unresolved tracks; serialize store writes and use Redis SCAN when available
- keep the public `version` export synchronized with package.json and harden the Changesets release workflow
