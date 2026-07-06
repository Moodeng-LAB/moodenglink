/**
 * Moodenglink — a modern Lavalink v4 client for Node.js.
 *
 * Inspired by Sonatica, Magmastream, Moonlink.js and Erela.js.
 * @packageDocumentation
 */

// Core classes
export { Moodenglink } from "./classes/Moodenglink";
export { Moodenglink as Manager } from "./classes/Moodenglink";
export { Node } from "./classes/Node";
export { Player } from "./classes/Player";
export type { PlayOptions } from "./classes/Player";
export { Queue } from "./classes/Queue";
export { Rest } from "./classes/Rest";
export { Filters } from "./classes/Filters";
export { Plugin } from "./classes/Plugin";

// Sorters (load balancing strategies)
export { default as leastLoadNode } from "./sorter/leastLoadNode";
export { default as leastUsedNode } from "./sorter/leastUsedNode";

// Utilities
export * from "./utils/sources";
export * from "./utils/equalizers";
export * from "./utils/utils";

// Types
export * from "./types/Moodenglink";
export * from "./types/Node";
export * from "./types/Player";
export * from "./types/Filters";
export * from "./types/Op";
export * from "./types/Rest";

export const version = "1.0.0";
