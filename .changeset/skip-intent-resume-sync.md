---
"moodenglink": patch
---

Fix skip() silent stops with LavaSrc/Spotify and add seamless resumed-session sync:

- `skip()` with a non-empty queue now replaces via `play()` (TrackEnd `replaced`) so advancement does not depend on encoded equality
- `endIntent` no longer requires exact encoded match; stale intents are dropped when current already moved on
- `trackEnd` emits `{ intent: "skip" | "stop" | null }` for correct bot logging
- `syncResumedPlayers(node)` reattaches local players after `ready.resumed` (connect only, no play/seek; never restores stale Discord voiceState)
- `4006`/`4009` voice closes reconnect immediately; docs clarify process-restart OP4 rebind vs Lavalink seamless resume
