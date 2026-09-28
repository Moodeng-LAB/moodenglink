---
"moodenglink": minor
---

Add `maxSameArtistInRow` manager option (default `3`) so autoplay stops picking candidates that would extend a same-artist streak beyond the configured length, falling back to the rest of the pool when one exists. Checked against the most recent history only, so an artist who dominated earlier in the session isn't penalised forever. Set to `0` to disable and restore the old behaviour.
