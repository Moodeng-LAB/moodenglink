---
"moodenglink": patch
---

Fix silent Lavalink playback bugs found against Shoukaku and the v4 REST spec. Player volume no longer overwrites filter volume, track changes clear `endTime`, and `trackStart` reports the track committed before the REST call. Playback waits until voice connects, a non-resumed session rebinds in-memory players, `disconnect()` keeps the queue, playlists start at `selectedTrack`, and the progress position follows timescale speed and rate.
