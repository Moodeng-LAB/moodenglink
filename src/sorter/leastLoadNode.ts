/**
 * Sorts connected nodes by lowest CPU load (Lavalink-weighted).
 * @module sorter/leastLoadNode
 */

import { Collection } from "@discordjs/collection";
import type { Node } from "../classes/Node";

export default function leastLoadNode(nodes: Collection<string, Node>): Collection<string, Node> {
	return nodes
		.filter((node) => node.connected)
		.sort((a, b) => {
			const aLoad = a.stats ? (a.stats.cpu.lavalinkLoad / a.stats.cpu.cores) * 100 : 0;
			const bLoad = b.stats ? (b.stats.cpu.lavalinkLoad / b.stats.cpu.cores) * 100 : 0;
			if (aLoad === bLoad) return b.options.priority! - a.options.priority!;
			return aLoad - bLoad;
		});
}
