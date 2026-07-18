<div align="center">

# 🎧 Moodenglink

**A fast, lightweight, modern [Lavalink v4](https://lavalink.dev) client for Node.js.**

TypeScript-first · ESM + CJS + types · works with any Discord library via a single `send` callback.

[![npm version](https://img.shields.io/npm/v/moodenglink.svg?color=cb3837&label=npm)](https://www.npmjs.com/package/moodenglink)
[![npm downloads](https://img.shields.io/npm/dm/moodenglink.svg?color=cb3837)](https://www.npmjs.com/package/moodenglink)
[![CI](https://github.com/Moodeng-LAB/moodenglink/actions/workflows/build.yml/badge.svg)](https://github.com/Moodeng-LAB/moodenglink/actions/workflows/build.yml)
[![node](https://img.shields.io/node/v/moodenglink.svg?color=3c873a)](https://nodejs.org)
[![license](https://img.shields.io/npm/l/moodenglink.svg?color=blue)](./LICENSE)

</div>

```bash
npm install moodenglink
```

> Requires **Node.js ≥ 18** and a running **Lavalink v4** server. `ws` and
> `@discordjs/collection` are installed automatically.

---

## Why Moodenglink

- ⚡ **Fast & light** — allocation-free node selection, a synchronous WebSocket
  hot path, and only two small dependencies. No bloat.
- 🛡️ **Stable by design** — a correct playback state machine (repeat, skip, stop,
  autoplay are never confused), guarded async handlers (no crashes), and voice +
  node auto-recovery with backoff.
- 🎯 **Accurate** — `player.position` interpolates between node updates, so
  progress bars stay smooth.
- 🔋 **Batteries included** — load balancing, failover, persistence, filters,
  autoplay, lyrics, SponsorBlock, search cache, plugins.
- 🧩 **Extensible** — swap in your own `Player`/`Queue`/`Node`/`Filters` subclasses.

## Contents

[Quick start](#-quick-start-discordjs-v14) ·
[Options](#-manager-options) ·
[Nodes](#-node-options) ·
[Player & Queue](#-player--queue) ·
[Filters](#-filters) ·
[Autoplay](#-autoplay) ·
[Lyrics](#-lyrics) ·
[SponsorBlock](#-sponsorblock) ·
[Load balancing](#-load-balancing--failover) ·
[Persistence](#-session-resume--persistence) ·
[Plugins](#-plugins) ·
[Events](#-events)

---

## 🚀 Quick start (discord.js v14)

```ts
import { Client, GatewayIntentBits } from "discord.js";
import { Moodenglink } from "moodenglink";

const client = new Client({
	intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates],
});

const manager = new Moodenglink({
	nodes: [{ host: "localhost", port: 2333, password: "youshallnotpass", identifier: "main" }],
	defaultSearchPlatform: "youtube",
	autoPlay: true,
	// REQUIRED: forward voice payloads to Discord's gateway
	send: (guildId, payload) => client.guilds.cache.get(guildId)?.shard.send(payload),
});

manager.on("nodeConnect", (node) => console.log(`Node ${node.id} connected`));
manager.on("trackStart", (player, track) => console.log(`▶️  ${track.title}`));
manager.on("queueEnd", (player) => player.destroy());

// Feed Discord voice updates into Moodenglink
client.on("raw", (d) => manager.updateVoiceState(d));

client.once("ready", () => manager.init(client.user!.id));
await client.login(process.env.TOKEN);
```

### Play a song

```ts
async function play(guildId: string, voiceChannelId: string, textChannelId: string, query: string) {
	const { player, queued } = await manager.play({
		guild: guildId,
		voiceChannel: voiceChannelId,
		textChannel: textChannelId,
		query,
		requester: "requester-id",
	});

	return `Queued ${queued.length}: ${player.current?.title}`;
}
```

For beginner-friendly recovery and caching defaults, construct with
`Moodenglink.simple({ nodes, send })`. Advanced users can keep using the
individual `create`, `search`, queue and `play` APIs.

---

## ⚙️ Manager options

| Option                  | Type                                        | Default         | Description                                                   |
| ----------------------- | ------------------------------------------- | --------------- | ------------------------------------------------------------- |
| `nodes`                 | `NodeOptions[]`                             | —               | Lavalink nodes to connect to. **Required.**                   |
| `send`                  | `(guildId, payload) => void`                | —               | Forwards OP4 voice payloads to Discord. **Required.**         |
| `clientId`              | `string`                                    | —               | Bot user id (or pass it to `init()`).                         |
| `clientName`            | `string`                                    | `"Moodenglink/<version>"` | `Client-Name` header sent to the node.                |
| `shards`                | `number`                                    | `1`             | Total shard count.                                            |
| `preset`                | `"minimal" \| "recommended" \| "resilient"` | —               | Additive deployment defaults; omitted preserves v1 behavior.  |
| `autoPlay`              | `boolean`                                   | `false`         | Autoplay related tracks (platform radio/recs) at queue end.   |
| `autoplaySampleSize`    | `number`                                    | `5`             | How many top autoplay candidates to sample for variety.       |
| `autoplayRequester`     | `unknown`                                   | _(inherits)_    | `requester` stamped on autoplayed tracks (e.g. the bot user). |
| `autoMove`              | `boolean`                                   | `true`          | Migrate players to a healthy node when one dies.              |
| `autoResume`            | `boolean`                                   | `false`         | Restore players from `store` on a cold node session.          |
| `voiceReconnectTries`   | `number`                                    | `3`             | Max voice re-join attempts after a recoverable close.         |
| `voiceReconnectDelay`   | `number`                                    | `1000`          | Base backoff (ms); `4006`/`4009` reconnect immediately. Set `0` for always-immediate. |
| `defaultSearchPlatform` | `SearchPlatform`                            | `"youtube"`     | Default source for prefix-less queries.                       |
| `trackPartial`          | `(keyof Track)[]`                           | `[]`            | Fields to strip from tracks (never removes `encoded`).        |
| `store`                 | `SessionStore`                              | —               | Backend for persistence/resume (Redis, Map…).                 |
| `positionSaveInterval`  | `number \| false`                           | `15000`         | Throttle live-position persistence; `false` disables it.      |
| `searchCache`           | `boolean \| { ttl?, maxSize? }`             | `false`         | Cache search results (default 30s TTL, 100 entries).          |
| `sorter`                | `(nodes) => Collection<string, Node>`       | `leastUsedNode` | Node ordering strategy.                                       |
| `playerDefaults`        | `Partial<PlayerOptions>`                    | —               | Defaults merged into every player.                            |
| `playerBehavior`        | `PlayerBehaviorOptions`                     | —               | Auto-skip/error and voice/queue cleanup policies.             |
| `searchPolicy`          | `SearchPolicy`                              | —               | URL protocol/domain allow/deny rules and custom validation.   |

## 🖧 Node options

| Option           | Type      | Default             | Description                                     |
| ---------------- | --------- | ------------------- | ----------------------------------------------- |
| `host`           | `string`  | —                   | Node host. **Required.**                        |
| `port`           | `number`  | `2333`              | Node port.                                      |
| `password`       | `string`  | `"youshallnotpass"` | Node authorization.                             |
| `secure`         | `boolean` | `false`             | Use `wss`/`https`.                              |
| `identifier`     | `string`  | `host:port`         | Friendly id for logs and lookups.               |
| `priority`       | `number`  | `0`                 | Higher biases the sorter toward this node.      |
| `search`         | `boolean` | `true`              | May be used for searching.                      |
| `playback`       | `boolean` | `true`              | May be used for playback.                       |
| `retryAmount`    | `number`  | `5`                 | Reconnect / idempotent-REST retry attempts.     |
| `retryDelay`     | `number`  | `5000`              | Base reconnect backoff (ms), grows per attempt. |
| `requestTimeout` | `number`  | `10000`             | Per-request timeout (ms).                       |
| `resumeTimeout`  | `number`  | `60`                | Node-side session resume window (s).            |
| `capabilities`   | `NodeCapabilityRequirements` | `{}`       | Required sources, filters and plugins; optional strict mode. |

---

## 🎛️ Player & Queue

```ts
player.connect();
player.disconnect();
await player.play(); // next queued track
await player.stop(); // stop + clear queue  ·  stop(false) keeps it
await player.skip(); // skip(n) to jump several
await player.previous(); // back to the last track
await player.pause();
await player.resume();
await player.seek(60_000);
await player.setVolume(150); // 0–1000
player.setRepeatMode(RepeatMode.QUEUE); // NONE | TRACK | QUEUE
player.setAutoplay(true);
await player.moveNode(node);

player.position; // ✨ live position (ms), interpolated between node updates
```

```ts
player.queue.add(track); // or an array
player.queue.shuffle();
player.queue.move(from, to);
player.queue.remove(index);
player.queue.dedupe();
player.queue.findTracks("lofi"); // fuzzy title/author/URL/source
player.queue.findTrack({ author: /moodeng/i });
player.queue.removeTracks({ maxDuration: 60_000 }); // declarative bulk removal
player.queue.current; // now playing
player.queue.previous; // history (most-recent first, capped at 50)
player.queue.duration; // total upcoming ms
```

> **Correct by design:** repeat only re-plays a track that finished on its own —
> a manual `skip()` or `stop()` never loops or triggers autoplay.

Player defaults and lifecycle policy can be centralized:

```ts
const manager = Moodenglink.simple({
	nodes,
	send,
	playerDefaults: { volume: 80, selfDeafen: true },
	playerBehavior: {
		autoSkipOnError: true,
		destroyOnVoiceDisconnect: true,
		destroyOnQueueEnd: true,
	},
});

manager.on("playerDestroy", (player, context) => {
	console.log(player.guild, context.reason); // manual | manager | voice-disconnect | ...
});
```

---

## 🎚️ Filters

```ts
// One-shot presets
await player.filters.nightcore();
await player.filters.bassboost();
await player.filters.eightD();
await player.filters.vaporwave();

// Manual, chainable — call apply() to push to the node
await player.filters.setPreset("rock").setTimescale({ speed: 1.1, pitch: 1.0, rate: 1.0 }).setKaraoke({ level: 1.0 }).apply();

// Merge a partial payload and apply in one call
await player.filters.set({ timescale: { speed: 1.15 }, lowPass: { smoothing: 20 } });

await player.filters.clear();
```

Equalizer presets: `flat`, `bass`, `soft`, `treble`, `pop`, `party`, `rock`, `electronic`, `radio`.

---

## 🔀 Autoplay

When the queue drains, Moodenglink seeds a fresh recommendation from each
platform's own radio/recommendation feed — YouTube **Mix** (`RD`), SoundCloud
**recommended**, Spotify (`sprec:`), Deezer (`dzrec:`) — falling back to a
cleaned-up "artist – title" search. Already-heard and queued tracks are filtered
out, and a small `autoplaySampleSize` window keeps picks from feeling robotic.

```ts
const manager = new Moodenglink({
	nodes,
	autoPlay: true, // or per-player: player.setAutoplay(true)
	autoplaySampleSize: 5,
	autoplayRequester: client.user, // credit autoplayed tracks to the bot, not the last requester
	send,
});
```

---

## 🎤 Lyrics

```ts
// Static lyrics for the current track
const lyrics = await player.getLyrics();
console.log(lyrics?.text ?? lyrics?.lines.map((l) => l.line).join("\n"));

// Live, synced lyrics — emitted line by line
await player.subscribeLyrics();
manager.on("lyricsLine", (player, line) => console.log(line.line));
manager.on("lyricsNotFound", (player) => console.log("No lyrics available."));
```

Requires the [LavaLyrics](https://github.com/DuncteBot/java-timed-lyrics) plugin on your node.

---

## ⏭️ SponsorBlock

Skip sponsor/intro/outro segments via the
[SponsorBlock plugin](https://github.com/topi314/Sponsorblock-Plugin):

```ts
await player.setSponsorBlock(["sponsor", "selfpromo", "intro", "outro", "music_offtopic"]);

manager.on("segmentSkipped", (player, segment) => console.log("skipped", segment.category));
manager.on("chapterStarted", (player, chapter) => console.log("chapter:", chapter.name));

await player.clearSponsorBlock();
```

Categories: `sponsor`, `selfpromo`, `interaction`, `intro`, `outro`, `preview`, `music_offtopic`, `filler`.

---

## ⚖️ Load balancing & failover

```ts
import { Moodenglink, leastLoadNode } from "moodenglink";

const manager = new Moodenglink({
	nodes: [
		{ host: "eu-1", port: 2333, password: "…", priority: 10 },
		{ host: "eu-2", port: 2333, password: "…", priority: 5 },
	],
	sorter: leastLoadNode, // lowest-penalty node (CPU + frames + players)
	autoMove: true, // move players off a node that runs out of retries
	send,
});
```

`leastLoadNode` ranks by `node.penalties` — an Erela.js-style score combining
playing players, CPU load and dropped/nulled audio frames, biased by each node's
`priority`. `leastUsedNode` (default) ranks by active player count. Selection is
allocation-free and short-circuits the common single-node case.

### Capability validation

Validate what each node actually exposes through Lavalink `/info`:

```ts
const manager = new Moodenglink({
	nodes: [{
		host: "localhost",
		capabilities: {
			sources: ["youtube"],
			plugins: ["lavalyrics-plugin"],
			strict: true,
		},
	}],
	send,
});

node.supportsSource("youtube");
node.supportsFilter("timescale");
node.hasPlugin("lavalyrics-plugin");
node.validateCapabilities();
```

### Voice resilience

Dropped voice connections (close codes `4006`, `4009`, `4014`, `4015`, `1006`)
recover automatically: the player re-joins with a backing-off delay up to
`voiceReconnectTries` times. Codes `4006`/`4009` (common after a process restart)
reconnect **immediately**. Set `voiceReconnectDelay: 0` if you want every
recoverable close to rebind without backoff. The counter resets once voice is
healthy, and an intentional `disconnect()`/`destroy()` is never fought.

Moodenglink never leave→joins (channel_id `null` then rejoin) for recovery —
it only re-sends OP4 for the same channel.

> **DAVE (voice E2EE):** nothing to configure. Discord's DAVE encryption lives on
> the voice transport owned by the **Lavalink node**, not this wrapper — and
> Discord disables E2EE on any call a bot is in. Moodenglink stays compatible by
> forwarding voice updates untouched.

---

## 💾 Session resume & persistence

Players are serialised on state changes and restored when a node comes up on a
**cold** session (`autoResume: true`) — a transient reconnect that the node
resumes is left playing, never restarted.

When `ready.resumed === true` after a **full process restart**, Moodenglink
calls `syncResumedPlayers(node)`: it fetches live players from Lavalink,
recreates missing local Players from the store + live state, and `connect()`s
only — no `play()` / seek. Stale Discord voice credentials from the store are
never restored.

**Seamless** means no Lavalink play/seek restart. A process kill still needs a
fresh Discord OP4 / voice rebind (`4006` is expected); an audio gap is possible.

Position, pause state, filters, user data, node assignment and unresolved queue
items are restored. Writes are ordered per player, and `RedisStore` uses SCAN
when the provided client supports it instead of blocking Redis with `KEYS`.

```ts
import { Moodenglink, MemoryStore, RedisStore } from "moodenglink";

// Single instance — in-memory
const manager = new Moodenglink({ nodes, autoResume: true, store: new MemoryStore(), send });

// Survive full restarts — Redis (ioredis or node-redis v4)
import Redis from "ioredis";
const manager2 = new Moodenglink({ nodes, autoResume: true, store: new RedisStore(new Redis()), send });
```

Or bring your own by implementing `SessionStore` (`get` / `set` / `delete` / `keys`).
Use a unique Redis prefix per bot deployment. A shared prefix is single-writer;
multiple processes restoring the same guild require application-level ownership.

---

## 🔮 Unresolved tracks (lazy resolve)

Queue Spotify/Apple metadata now, resolve to a playable source the moment it
plays — no wasted searches for tracks the user skips past.

```ts
for (const item of spotifyItems) {
	player.queue.add(
		manager.buildUnresolved({
			title: item.name,
			author: item.artists[0].name,
			duration: item.duration_ms,
			source: "youtube", // where to resolve from
			requester: interaction.user.id,
		}),
	);
}

await player.play(); // the first item is resolved here, closest-match by author + duration
```

Unresolvable items are skipped automatically. Use `isUnresolvedTrack(item)` to tell entries apart.

---

## 🔌 Plugins

```ts
import { Plugin, Moodenglink } from "moodenglink";

class MyPlugin extends Plugin {
	readonly name = "my-plugin";
	load(manager: Moodenglink) {
		manager.on("trackStart", (player, track) => {
			/* custom behaviour */
		});
	}
	unload(manager: Moodenglink) {
		/* cleanup */
	}
}

manager.use(new MyPlugin());
manager.removePlugin("my-plugin"); // runs unload(); destroyAll() unloads everything
```

## 🧬 Extending structures

Swap in your own subclasses — the manager instantiates them everywhere:

```ts
import { Structure } from "moodenglink";

Structure.extend(
	"Player",
	(Player) =>
		class extends Player {
			async announceAndPlay() {
				await this.play();
				console.log("Now playing:", this.current?.title);
			}
		},
);
```

Extendable: `Player`, `Queue`, `Node`, `Filters`.

---

## 📡 Events

| Event                                                                                                                     | Payload                        |
| ------------------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| `nodeCreate` · `nodeConnect` · `nodeReconnect` · `nodeDisconnect` · `nodeError` · `nodeDestroy` · `nodeStats` · `nodeRaw` · `nodeCapabilityMismatch` | node lifecycle |
| `playerCreate` · `playerDestroy` · `playerMove` · `playerDisconnect` · `playerStateUpdate`                                | player lifecycle               |
| `trackStart` · `trackEnd` · `trackStuck` · `trackError`                                                                   | `(player, track, payload[, context])` — `trackEnd` context has `{ intent: "skip" \| "stop" \| null }` |
| `nodeResume`                                                                                                              | `(node, count)` synced after a resumed session |
| `queueEnd`                                                                                                                | `(player, lastTrack, payload)` |
| `socketClosed`                                                                                                            | `(player, payload)`            |
| `lyricsFound` · `lyricsLine` · `lyricsNotFound`                                                                           | `(player, …, payload)`         |
| `segmentsLoaded` · `segmentSkipped` · `chaptersLoaded` · `chapterStarted`                                                 | SponsorBlock                   |
| `storeError`                                                                                                              | `(error, operation, key?)`     |
| `raw` · `debug`                                                                                                           | low-level diagnostics          |

## 🔎 Search platforms

`youtube`, `youtubemusic`, `soundcloud`, `spotify`, `deezer`, `applemusic`,
`yandexmusic`, `flowerytts`, `bandcamp`, `vimeo`, `twitch`, `http`, `local`.

> Platforms beyond YouTube/SoundCloud require the matching Lavalink source plugin
> (e.g. LavaSrc for Spotify/Apple/Deezer).

---

## 🛠️ Development

```bash
npm install
npm test              # Vitest suite
npm run test:coverage
npm run build         # dist/ (cjs + esm + d.ts)
npm run format
```

## 📄 License

MIT © Moodeng Lab. Built on the shoulders of
[Sonatica](https://github.com/Pastel-Dream/sonatica),
[Magmastream](https://github.com/Magmastream-NPM/magmastream),
[Moonlink.js](https://github.com/Ecliptia/moonlink.js) and
[Erela.js](https://github.com/MenuDocs/erela.js).
