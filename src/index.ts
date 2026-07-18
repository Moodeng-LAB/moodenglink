/**
 * Moodenglink — a modern Lavalink v4 client for Node.js.
 *
 * Inspired by Sonatica, Magmastream, Moonlink.js and Erela.js.
 * @packageDocumentation
 */

// Core classes
export { Moodenglink, SearchPolicyError } from "./classes/Moodenglink";
export { Moodenglink as Manager } from "./classes/Moodenglink";
export { Node, NodeCapabilityError } from "./classes/Node";
export { Player } from "./classes/Player";
export type { PlayOptions } from "./classes/Player";
export { Queue } from "./classes/Queue";
export { Rest, RestError, RestNetworkError } from "./classes/Rest";
export { Filters } from "./classes/Filters";
export { Plugin } from "./classes/Plugin";
export { Structure } from "./classes/Structure";
export type { Extendable } from "./classes/Structure";
export { MemoryStore, RedisStore } from "./classes/stores";
export type { RedisLike } from "./classes/stores";

// Sorters (load balancing strategies)
export { default as leastLoadNode } from "./sorter/leastLoadNode";
export { default as leastUsedNode } from "./sorter/leastUsedNode";

// Utilities
export * from "./utils/sources";
export * from "./utils/equalizers";
export * from "./utils/utils";
export { TTLCache } from "./utils/cache";

// Types
export * from "./types/Moodenglink";
export * from "./types/Node";
export * from "./types/Player";
export * from "./types/Filters";
export * from "./types/Op";
export * from "./types/Rest";

export { version } from "./version";
