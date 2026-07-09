# moodenglink

## 1.1.0

### Minor Changes

- 7e07bbe: Riffy-style, source-aware autoplay. When a queue drains, recommendations are now
  drawn from each platform's own radio/recommendation feed — YouTube "Mix" (`RD`)
  radios, SoundCloud `recommended`, Spotify `sprec` and Deezer `dzrec` seeds — with
  a graceful fallback to a cleaned seed search. Candidates are deduped against
  everything already heard or queued (by identifier **and** uri) to prevent loops,
  and sampled from the most-relevant head of the list for variety
  (`autoplaySampleSize`, default `5`). A per-player guard prevents overlapping
  autoplay lookups when a queue drains rapidly.

## 1.0.3

### Patch Changes

- 804e6a8: Add `publishConfig.access=public` so the package is always published publicly,
  independent of any local npm config.

## 1.0.2

### Patch Changes

- Sanitize the autoplay search seed. Previously `handleAutoplay` searched with the finished track's raw `author`, which for YouTube-sourced tracks is the auto-generated channel name (`"<Artist> - Topic"`, `"<Artist>VEVO"`) — looping autoplay back onto the same channel. The seed is now cleaned (strips `- Topic`, trailing `VEVO`, `Official`) and combined with the track title for a genuine recommendation, falling back to the title when no artist survives.

## 1.0.1

### Patch Changes

- d8d1533: Add npm version, downloads, CI, and license badges to the README.
