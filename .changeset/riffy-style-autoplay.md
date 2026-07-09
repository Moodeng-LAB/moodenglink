---
"moodenglink": minor
---

Riffy-style, source-aware autoplay. When a queue drains, recommendations are now
drawn from each platform's own radio/recommendation feed — YouTube "Mix" (`RD`)
radios, SoundCloud `recommended`, Spotify `sprec` and Deezer `dzrec` seeds — with
a graceful fallback to a cleaned seed search. Candidates are deduped against
everything already heard or queued (by identifier **and** uri) to prevent loops,
and sampled from the most-relevant head of the list for variety
(`autoplaySampleSize`, default `5`). A per-player guard prevents overlapping
autoplay lookups when a queue drains rapidly.
