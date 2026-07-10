---
"moodenglink": minor
---

Reliability & correctness fixes:

- **autoResume:** players now resume from their persisted position instead of restarting from 0:00 (clamped to the track duration, skipped for live streams).
- **REST retries:** transient failures now use an incremental, capped backoff and only retry idempotent requests (`GET` by default, or opt-in via `RequestOptions.idempotent`) — a lost `PATCH /players` response can no longer replay playback.
- **Player.connect:** no longer marks `connected`/`CONNECTED` optimistically; the player stays `CONNECTING` until Lavalink reports a live voice connection via the first playerUpdate.
- **searchCache:** cached entries are deep-cloned on read and stored requester-free, so a consumer mutating a nested track field can't poison later cache hits.
- **Autoplay requester:** new `autoplayRequester` manager option to stamp autoplay-queued tracks (e.g. the client user or `null`) instead of inheriting the previous track's requester. Defaults to the previous behaviour when omitted.
