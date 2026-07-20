---
"moodenglink": minor
---

Add an augmentable `RequesterTypes` interface (and resolved `Requester` type) so consumers can pin the shape of `track.requester` once via declaration merging and get it typed across tracks, events, `search()`, `buildTrack()` and autoplay — no per-read casts. Fully opt-in and backwards-compatible: without merging, `requester` stays `unknown`.
