/**
 * A tiny registry that lets consumers swap in their own subclasses of the core
 * structures (Erela.js / Magmastream `Structure.extend` style).
 *
 * ```ts
 * Structure.extend("Player", (Player) => class MyPlayer extends Player {
 *   announce() { console.log("now playing", this.current?.title); }
 * });
 * ```
 * The manager instantiates via {@link Structure.get}, so extensions take effect
 * everywhere without any further wiring.
 * @module classes/Structure
 */

import { Filters } from "./Filters";
import { Node } from "./Node";
import { Player } from "./Player";
import { Queue } from "./Queue";

/** The set of structures that can be extended, keyed by name. */
export interface Extendable {
	Player: typeof Player;
	Queue: typeof Queue;
	Node: typeof Node;
	Filters: typeof Filters;
}

// Populated lazily on first access so that (bundled) circular imports between
// these classes and this registry are fully initialised before use.
const registry = new Map<keyof Extendable, unknown>();

function baseFor<K extends keyof Extendable>(name: K): Extendable[K] {
	const defaults: Extendable = { Player, Queue, Node, Filters };
	return defaults[name];
}

export abstract class Structure {
	/** Replaces a structure with a subclass produced by `extender`. */
	public static extend<K extends keyof Extendable, T extends Extendable[K]>(name: K, extender: (target: Extendable[K]) => T): T {
		const extended = extender(Structure.get(name));
		registry.set(name, extended);
		return extended;
	}

	/** Returns the (possibly extended) constructor registered for `name`. */
	public static get<K extends keyof Extendable>(name: K): Extendable[K] {
		if (!registry.has(name)) registry.set(name, baseFor(name));
		return registry.get(name) as Extendable[K];
	}

	/** Resets a structure back to its built-in implementation (mostly for tests). */
	public static reset(name?: keyof Extendable): void {
		if (name) registry.delete(name);
		else registry.clear();
	}
}
