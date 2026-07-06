/**
 * Fluent helper for building and applying Lavalink audio filters to a player.
 * @module classes/Filters
 */

import type {
	Band,
	ChannelMixSettings,
	DistortionSettings,
	FilterPayload,
	KaraokeSettings,
	LowPassSettings,
	RotationSettings,
	TimescaleSettings,
	TremoloSettings,
	VibratoSettings,
} from "../types/Filters";
import { Equalizers, type EqualizerPreset } from "../utils/equalizers";
import type { Player } from "./Player";

export class Filters {
	public volume = 1.0;
	public equalizer: Band[] = [];
	public karaoke: KaraokeSettings | null = null;
	public timescale: TimescaleSettings | null = null;
	public tremolo: TremoloSettings | null = null;
	public vibrato: VibratoSettings | null = null;
	public rotation: RotationSettings | null = null;
	public distortion: DistortionSettings | null = null;
	public channelMix: ChannelMixSettings | null = null;
	public lowPass: LowPassSettings | null = null;
	public pluginFilters: Record<string, unknown> = {};

	constructor(private readonly player: Player) {}

	/** Serialises the current filter state into a Lavalink filters payload. */
	public toJSON(): FilterPayload {
		return {
			volume: this.volume,
			equalizer: this.equalizer,
			karaoke: this.karaoke,
			timescale: this.timescale,
			tremolo: this.tremolo,
			vibrato: this.vibrato,
			rotation: this.rotation,
			distortion: this.distortion,
			channelMix: this.channelMix,
			lowPass: this.lowPass,
			pluginFilters: this.pluginFilters,
		};
	}

	/** Pushes the current filter state to the node. Chainable. */
	public async apply(): Promise<this> {
		await this.player.node.rest.updatePlayer(this.player.guild, { filters: this.toJSON() });
		return this;
	}

	/** Merges a partial filter payload into the current state and applies it. */
	public async set(payload: FilterPayload): Promise<this> {
		if (payload.volume !== undefined) this.volume = payload.volume;
		if (payload.equalizer !== undefined) this.equalizer = payload.equalizer;
		if (payload.karaoke !== undefined) this.karaoke = payload.karaoke;
		if (payload.timescale !== undefined) this.timescale = payload.timescale;
		if (payload.tremolo !== undefined) this.tremolo = payload.tremolo;
		if (payload.vibrato !== undefined) this.vibrato = payload.vibrato;
		if (payload.rotation !== undefined) this.rotation = payload.rotation;
		if (payload.distortion !== undefined) this.distortion = payload.distortion;
		if (payload.channelMix !== undefined) this.channelMix = payload.channelMix;
		if (payload.lowPass !== undefined) this.lowPass = payload.lowPass;
		if (payload.pluginFilters !== undefined) this.pluginFilters = payload.pluginFilters;
		return this.apply();
	}

	/* ------------------------------- setters ------------------------------- */

	public setEqualizer(bands: Band[]): this {
		this.equalizer = bands;
		return this;
	}

	/** Applies a named equalizer preset (`bass`, `pop`, `rock`, ...). */
	public setPreset(preset: EqualizerPreset): this {
		this.equalizer = Equalizers[preset];
		return this;
	}

	public setKaraoke(settings: KaraokeSettings | null): this {
		this.karaoke = settings;
		return this;
	}

	public setTimescale(settings: TimescaleSettings | null): this {
		this.timescale = settings;
		return this;
	}

	public setTremolo(settings: TremoloSettings | null): this {
		this.tremolo = settings;
		return this;
	}

	public setVibrato(settings: VibratoSettings | null): this {
		this.vibrato = settings;
		return this;
	}

	public setRotation(settings: RotationSettings | null): this {
		this.rotation = settings;
		return this;
	}

	public setDistortion(settings: DistortionSettings | null): this {
		this.distortion = settings;
		return this;
	}

	public setChannelMix(settings: ChannelMixSettings | null): this {
		this.channelMix = settings;
		return this;
	}

	public setLowPass(settings: LowPassSettings | null): this {
		this.lowPass = settings;
		return this;
	}

	/** Sets a plugin-specific filter (e.g. lavalink plugins). */
	public setPluginFilter(name: string, value: unknown): this {
		this.pluginFilters[name] = value;
		return this;
	}

	/* --------------------------- one-shot presets --------------------------- */

	public bassboost(): Promise<this> {
		return this.setPreset("bass").apply();
	}

	public nightcore(): Promise<this> {
		return this.setTimescale({ speed: 1.2, pitch: 1.2, rate: 1.0 }).apply();
	}

	public vaporwave(): Promise<this> {
		return this.setTimescale({ speed: 0.8, pitch: 0.8, rate: 1.0 }).apply();
	}

	public eightD(): Promise<this> {
		return this.setRotation({ rotationHz: 0.2 }).apply();
	}

	public tremoloPreset(): Promise<this> {
		return this.setTremolo({ frequency: 4.0, depth: 0.75 }).apply();
	}

	/** Clears every filter and applies the reset. */
	public async clear(): Promise<this> {
		this.volume = 1.0;
		this.equalizer = [];
		this.karaoke = null;
		this.timescale = null;
		this.tremolo = null;
		this.vibrato = null;
		this.rotation = null;
		this.distortion = null;
		this.channelMix = null;
		this.lowPass = null;
		this.pluginFilters = {};
		return this.apply();
	}
}
