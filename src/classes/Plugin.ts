/**
 * Base class for Moodenglink plugins (Magmastream / Moonlink style).
 * Extend it and override {@link Plugin.load}.
 * @module classes/Plugin
 */

import type { Moodenglink } from "./Moodenglink";

export abstract class Plugin {
	/** A unique name for the plugin, used for logs and de-duplication. */
	public abstract readonly name: string;

	/** Called once when the plugin is registered on a {@link Moodenglink} manager. */
	public load(_manager: Moodenglink): void {
		/* override me */
	}

	/** Called when the plugin is removed / the manager is destroyed. */
	public unload(_manager: Moodenglink): void {
		/* override me */
	}
}
