# moodenglink

## 1.0.2

### Patch Changes

- Sanitize the autoplay search seed. Previously `handleAutoplay` searched with the finished track's raw `author`, which for YouTube-sourced tracks is the auto-generated channel name (`"<Artist> - Topic"`, `"<Artist>VEVO"`) — looping autoplay back onto the same channel. The seed is now cleaned (strips `- Topic`, trailing `VEVO`, `Official`) and combined with the track title for a genuine recommendation, falling back to the title when no artist survives.

## 1.0.1

### Patch Changes

- d8d1533: Add npm version, downloads, CI, and license badges to the README.
