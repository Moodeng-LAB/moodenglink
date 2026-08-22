---
"moodenglink": patch
---

Fix `Filters.setPreset()` assigning the shared `Equalizers[preset]` array by reference instead of cloning it — mutating `player.filters.equalizer` in place could corrupt the preset for every player process-wide. Presets are now cloned per-call and the `Equalizers` table itself is frozen as defense in depth.
