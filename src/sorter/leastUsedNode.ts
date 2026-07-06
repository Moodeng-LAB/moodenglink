/**
 * Sorts connected nodes by the fewest active players.
 * @module sorter/leastUsedNode
 */

import { Collection } from "@discordjs/collection";
import type { Node } from "../classes/Node";

export default function leastUsedNode(nodes: Collection<string, Node>): Collection<string, Node> {
	return nodes
		.filter((node) => node.connected)
		.sort((a, b) => {
			const aPlayers = a.stats?.playingPlayers ?? 0;
			const bPlayers = b.stats?.playingPlayers ?? 0;
			if (aPlayers === bPlayers) return b.options.priority! - a.options.priority!;
			return aPlayers - bPlayers;
		});
}
