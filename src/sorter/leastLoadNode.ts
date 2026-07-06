/**
 * Sorts connected nodes by lowest CPU load (Lavalink-weighted).
 * @module sorter/leastLoadNode
 */

import { Collection } from "@discordjs/collection";
import type { Node } from "../classes/Node";

export default function leastLoadNode(nodes: Collection<string, Node>): Collection<string, Node> {
	return nodes.filter((node) => node.connected).sort((a, b) => a.penalties - b.penalties);
}
