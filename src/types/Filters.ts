/**
 * Audio filter payload types, mirroring the Lavalink v4 filters object.
 * @module types/Filters
 */

export interface Band {
	/** Band index, 0-14. */
	band: number;
	/** Gain, -0.25 to 1.0. */
	gain: number;
}

export interface KaraokeSettings {
	level?: number;
	monoLevel?: number;
	filterBand?: number;
	filterWidth?: number;
}

export interface TimescaleSettings {
	speed?: number;
	pitch?: number;
	rate?: number;
}

export interface TremoloSettings {
	frequency?: number;
	depth?: number;
}

export interface VibratoSettings {
	frequency?: number;
	depth?: number;
}

export interface RotationSettings {
	rotationHz?: number;
}

export interface DistortionSettings {
	sinOffset?: number;
	sinScale?: number;
	cosOffset?: number;
	cosScale?: number;
	tanOffset?: number;
	tanScale?: number;
	offset?: number;
	scale?: number;
}

export interface ChannelMixSettings {
	leftToLeft?: number;
	leftToRight?: number;
	rightToLeft?: number;
	rightToRight?: number;
}

export interface LowPassSettings {
	smoothing?: number;
}

/** The complete filters object accepted by Lavalink's update-player endpoint. */
export interface FilterPayload {
	volume?: number;
	equalizer?: Band[];
	karaoke?: KaraokeSettings | null;
	timescale?: TimescaleSettings | null;
	tremolo?: TremoloSettings | null;
	vibrato?: VibratoSettings | null;
	rotation?: RotationSettings | null;
	distortion?: DistortionSettings | null;
	channelMix?: ChannelMixSettings | null;
	lowPass?: LowPassSettings | null;
	/** Plugin filters, keyed by plugin name. */
	pluginFilters?: Record<string, unknown>;
}
