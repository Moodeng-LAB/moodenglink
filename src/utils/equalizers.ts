/**
 * Ready-made 15-band equalizer presets for the {@link Filters} helper.
 * @module utils/equalizers
 */

import type { Band } from "../types/Filters";

// Frozen (band objects included) so a consumer mutating a preset in place — the
// bug the shared reference in Filters.setPreset used to cause — fails loudly
// instead of silently corrupting every player that uses the same preset.
const bands = (gains: number[]): Band[] => Object.freeze(gains.map((gain, band) => Object.freeze({ band, gain }))) as Band[];

export const Equalizers = {
	flat: bands(new Array(15).fill(0)),

	bass: bands([0.6, 0.67, 0.67, 0.4, 0.2, 0.05, 0, 0, 0, 0, 0, 0, 0, 0, 0]),

	soft: bands([0, 0, 0, 0, 0, 0, 0, 0, -0.25, -0.25, -0.25, -0.25, -0.25, -0.25, -0.25]),

	treble: bands([-0.1, -0.12, -0.12, -0.12, -0.08, -0.04, 0.0, 0.1, 0.2, 0.3, 0.35, 0.4, 0.4, 0.4, 0.4]),

	pop: bands([-0.02, -0.01, 0.08, 0.1, 0.15, 0.1, 0.03, -0.02, -0.035, -0.05, -0.05, -0.05, -0.05, -0.05, -0.05]),

	party: bands([0.1, 0.1, 0.05, 0.05, 0.02, 0, 0, 0, 0, 0, 0, 0.02, 0.05, 0.05, 0.1]),

	rock: bands([0.3, 0.25, 0.2, 0.1, 0.05, -0.05, -0.15, -0.2, -0.1, -0.05, 0.05, 0.1, 0.2, 0.25, 0.3]),

	electronic: bands([0.375, 0.35, 0.125, 0, 0, -0.125, -0.125, 0, 0.25, 0.125, 0.15, 0.2, 0.25, 0.35, 0.4]),

	// Lavalink accepts band gains in the range -0.25 … 1.0.
	radio: bands([0.65, 0.45, 0.35, 0.25, 0.2, 0.15, 0.1, 0.05, 0, -0.05, -0.1, -0.15, -0.2, -0.25, -0.25]),
} as const satisfies Record<string, Band[]>;

Object.freeze(Equalizers);

export type EqualizerPreset = keyof typeof Equalizers;
