/**
 * Types describing a Lavalink node connection, its options and reported stats.
 * @module types/Node
 */

export interface NodeOptions {
	/** The host of the node (e.g. `localhost`). */
	host: string;
	/** The port of the node. Defaults to `2333`. */
	port?: number;
	/** The password/authorization of the node. */
	password?: string;
	/** Whether to connect over TLS (wss/https). */
	secure?: boolean;
	/** A friendly identifier used for logs and lookups. */
	identifier?: string;
	/** How many times to retry a lost connection. Defaults to `5`. */
	retryAmount?: number;
	/** Delay in ms between reconnect attempts. Defaults to `5000`. */
	retryDelay?: number;
	/** REST request timeout in ms. Defaults to `10000`. */
	requestTimeout?: number;
	/** Session resuming timeout in seconds. Defaults to `60`. */
	resumeTimeout?: number;
	/** Priority weight when picking a node — higher wins ties. Defaults to `0`. */
	priority?: number;
	/** Whether this node may be used for searching. Defaults to `true`. */
	search?: boolean;
	/** Whether this node may be used for playback. Defaults to `true`. */
	playback?: boolean;
	/**
	 * Capabilities this node is expected to expose after READY. Missing
	 * capabilities emit `nodeCapabilityMismatch`; `strict` also rejects the node.
	 */
	capabilities?: NodeCapabilityRequirements;
}

/** Sources, filters and plugins a node is expected to provide. */
export interface NodeCapabilityRequirements {
	sources?: string[];
	filters?: string[];
	plugins?: string[];
	/** Remove the node when a requirement is missing or `/info` is unavailable. */
	strict?: boolean;
}

/** Result returned by {@link Node.validateCapabilities}. */
export interface NodeCapabilityReport {
	available: boolean;
	valid: boolean;
	missingSources: string[];
	missingFilters: string[];
	missingPlugins: string[];
}

export interface NodeInfo {
	version: {
		semver: string;
		major: number;
		minor: number;
		patch: number;
		preRelease: string | null;
		build: string | null;
	};
	buildTime: number;
	git: { branch: string; commit: string; commitTime: number };
	jvm: string;
	lavaplayer: string;
	sourceManagers: string[];
	filters: string[];
	plugins: { name: string; version: string }[];
}

export interface MemoryStats {
	free: number;
	used: number;
	allocated: number;
	reservable: number;
}

export interface CPUStats {
	cores: number;
	systemLoad: number;
	lavalinkLoad: number;
}

export interface FrameStats {
	sent: number;
	nulled: number;
	deficit: number;
}

export interface NodeStats {
	players: number;
	playingPlayers: number;
	uptime: number;
	memory: MemoryStats;
	cpu: CPUStats;
	frameStats: FrameStats | null;
}
