# 🎧 Moodenglink

[![npm version](https://img.shields.io/npm/v/moodenglink.svg)](https://www.npmjs.com/package/moodenglink)
[![npm downloads](https://img.shields.io/npm/dm/moodenglink.svg)](https://www.npmjs.com/package/moodenglink)
[![CI](https://github.com/Moodeng-LAB/moodenglink/actions/workflows/build.yml/badge.svg)](https://github.com/Moodeng-LAB/moodenglink/actions/workflows/build.yml)
[![license](https://img.shields.io/npm/l/moodenglink.svg)](./LICENSE)

A powerful, modern **Lavalink v4** client for Node.js — inspired by
[Sonatica](https://github.com/Pastel-Dream/sonatica), [Magmastream](https://github.com/Magmastream-NPM/magmastream),
[Moonlink.js](https://github.com/Ecliptia/moonlink.js) and [Erela.js](https://github.com/MenuDocs/erela.js).

Written in **TypeScript**, ships with **ESM + CJS + types**, and works with any Discord library
(discord.js, Eris, oceanic, seyfert…) via a single `send` callback.

## ✨ Features

- **Lavalink v4** REST + WebSocket, session **resuming** on the node side.
- **Node load balancing** — pluggable sorters (`leastUsedNode`, `leastLoadNode`) or bring your own.
- **Automatic failover** — migrate players to a healthy node when one dies (`autoMove`).
- **Player persistence & resume** across restarts via a swappable `store` (Redis, Map, file…).
- **Queue** with history, repeat modes, shuffle, move, dedupe.
- **Audio filters** — equalizer presets, nightcore, vaporwave, 8D, karaoke, timescale and more.
- **Autoplay** of related tracks when the queue ends (with repeat de-duplication).
- **Lyrics** — static + live line-by-line via the LavaLyrics plugin.
- **SponsorBlock** — skip sponsor/intro/outro segments + segment/chapter events.
- **Search cache** — optional TTL/LRU cache to cut REST calls.
- **Plugins** — extend the manager Magmastream/Moonlink-style.
- Fully **typed events** and errors (`RestError` carries the HTTP status).

## 📦 Install

```bash
npm install moodenglink
# peer requirements are bundled: ws, @discordjs/collection
```

Requires **Node.js ≥ 18** and a running **Lavalink v4** server.

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

// Wire node lifecycle logs
manager.on("nodeConnect", (node) => console.log(`Node ${node.id} connected`));
manager.on("trackStart", (player, track) =>
  console.log(`▶️  ${track.title} in guild ${player.guild}`),
);
manager.on("queueEnd", (player) => player.destroy());

// Feed Discord voice updates into Moodenglink
client.on("raw", (d) => manager.updateVoiceState(d));

client.once("ready", () => manager.init(client.user!.id));
await client.login(process.env.TOKEN);
```

### Play a song

```ts
async function play(guildId: string, voiceChannelId: string, textChannelId: string, query: string) {
  const player = manager.create({
    guild: guildId,
    voiceChannel: voiceChannelId,
    textChannel: textChannelId,
    selfDeafen: true,
  });

  player.connect();

  const res = await manager.search({ query, source: "youtube" }, "requester-id");
  if (!res.tracks.length) return "No results.";

  if (res.loadType === "playlist") player.queue.add(res.tracks);
  else player.queue.add(res.tracks[0]);

  if (!player.playing) await player.play();
  return res.playlist ? `Queued ${res.tracks.length} tracks` : `Queued **${res.tracks[0].title}**`;
}
```

## 🧩 API overview

### `new Moodenglink(options)`

| Option                  | Type                                   | Default        | Description                                            |
| ----------------------- | -------------------------------------- | -------------- | ----------------------------------------------------- |
| `nodes`                 | `NodeOptions[]`                        | —              | Lavalink nodes to connect to.                         |
| `send`                  | `(guildId, payload) => void`           | —              | Forwards OP4 voice payloads to Discord. **Required.** |
| `clientId`              | `string`                               | —              | Bot user id (or pass to `init()`).                    |
| `shards`                | `number`                               | `1`            | Total shard count.                                    |
| `autoPlay`              | `boolean`                              | `false`        | Autoplay related tracks (platform radio/recs) at queue end. |
| `autoplaySampleSize`    | `number`                               | `5`            | How many top autoplay candidates to sample from for variety. |
| `autoMove`              | `boolean`                              | `true`         | Migrate players when a node dies.                     |
| `autoResume`            | `boolean`                              | `false`        | Restore players from `store` on node ready.           |
| `defaultSearchPlatform` | `SearchPlatform`                       | `"youtube"`    | Default source for prefix-less queries.               |
| `trackPartial`          | `(keyof Track)[]`                      | `[]`           | Fields to strip from tracks (never removes `encoded`).|
| `store`                 | `SessionStore`                         | —              | Backend for persistence/resume (Redis, Map…).         |
| `searchCache`           | `boolean \| { ttl?, maxSize? }`        | `false`        | Cache search results (default 30s TTL, 100 entries).  |
| `sorter`                | `(nodes) => Collection<string, Node>`  | `leastUsedNode`| Node ordering strategy.                               |

### Manager methods

- `init(clientId?)` — connect all nodes.
- `create(options)` / `get(guild)` / `destroy(guild)` — player lifecycle.
- `search(query, requester?)` — resolve a string or `{ query, source }`.
- `decodeTrack(encoded)` / `resolve(unresolved)`.
- `addNode(options)` — hot-add a node.
- `use(plugin)` — register a plugin.
- `updateVoiceState(packet)` — feed raw Discord voice packets.
- `idealNode` — best node per the sorter.

### Player methods

`connect()` · `disconnect()` · `play()` · `stop()` · `skip(n)` · `previous()` · `pause()` ·
`resume()` · `seek(ms)` · `setVolume(0-1000)` · `setRepeatMode(mode)` · `setAutoplay(bool)` ·
`setVoiceChannel(id)` · `setTextChannel(id)` · `moveNode(node)` · `set(k,v)` · `get(k)` ·
`getLyrics()` · `subscribeLyrics()` · `unsubscribeLyrics()` · `destroy()`

### Queue

```ts
player.queue.add(track);        // or an array
player.queue.shuffle();
player.queue.move(from, to);
player.queue.remove(index);
player.queue.dedupe();
player.queue.previous;          // history
player.queue.current;           // now playing
player.queue.duration;          // total ms
```

### Repeat modes

```ts
import { RepeatMode } from "moodenglink";
player.setRepeatMode(RepeatMode.TRACK); // NONE | TRACK | QUEUE
```

## 🎚️ Filters

```ts
// One-shot presets
await player.filters.nightcore();
await player.filters.bassboost();
await player.filters.eightD();
await player.filters.vaporwave();

// Manual, chainable — call apply() to push to the node
await player.filters
  .setPreset("rock")
  .setTimescale({ speed: 1.1, pitch: 1.0, rate: 1.0 })
  .setKaraoke({ level: 1.0 })
  .apply();

// Merge a partial payload and apply in one call
await player.filters.set({ timescale: { speed: 1.15 }, lowPass: { smoothing: 20 } });

await player.filters.clear();
```

Equalizer presets: `flat`, `bass`, `soft`, `treble`, `pop`, `party`, `rock`, `electronic`, `radio`.

## 🎤 Lyrics (LavaLyrics plugin)

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

## ⏭️ SponsorBlock

Skip sponsor/intro/outro segments in YouTube playback via the
[SponsorBlock plugin](https://github.com/topi314/Sponsorblock-Plugin):

```ts
await player.setSponsorBlock(["sponsor", "selfpromo", "intro", "outro", "music_offtopic"]);

manager.on("segmentSkipped", (player, segment) => console.log("skipped", segment.category));
manager.on("segmentsLoaded", (player, segments) => console.log(segments.length, "segments"));
manager.on("chapterStarted", (player, chapter) => console.log("chapter:", chapter.name));

await player.clearSponsorBlock();
```

Categories: `sponsor`, `selfpromo`, `interaction`, `intro`, `outro`, `preview`,
`music_offtopic`, `filler`.

## 🗃️ Search cache

```ts
const manager = new Moodenglink({
  nodes,
  searchCache: { ttl: 30_000, maxSize: 100 }, // or `true` for defaults
  send,
});
```

Identical queries are served from an in-memory LRU within the TTL window, and the
`requester` is always re-stamped so cached tracks still attribute correctly.

## ⚖️ Load balancing & failover

```ts
import { Moodenglink, leastLoadNode } from "moodenglink";

const manager = new Moodenglink({
  nodes: [
    { host: "eu-1", port: 2333, password: "…", priority: 10 },
    { host: "eu-2", port: 2333, password: "…", priority: 5 },
  ],
  sorter: leastLoadNode, // pick the lowest-penalty node (CPU + frames + players)
  autoMove: true,        // move players off a node that runs out of retries
  send,
});
```

`leastLoadNode` ranks by `node.penalties` — an Erela.js-style score combining playing
players, CPU system load and dropped/nulled audio frames, biased by each node's
`priority`. `leastUsedNode` (the default) simply ranks by active player count.

### Voice resilience

Dropped voice connections (Discord close codes `4006`, `4009`, `4014`, `4015`, `1006`)
are recovered automatically: the player re-joins with a backing-off delay, up to
`voiceReconnectTries` times (default `3`, base delay `voiceReconnectDelay` = `1000ms`).
The counter resets once voice is healthy again, and intentional
`disconnect()`/`destroy()` are never fought.

> **DAVE (voice E2EE):** nothing to configure. Discord's DAVE encryption lives on the
> voice transport owned by the **Lavalink node**, not this wrapper — and Discord
> disables E2EE on any call a bot is in. Moodenglink stays compatible by simply
> forwarding voice updates untouched.

## 💾 Session resume & persistence

Players are serialised on state changes and restored when a node reconnects
(`autoResume: true`). Ship-with-batteries adapters are included:

```ts
import { Moodenglink, MemoryStore, RedisStore } from "moodenglink";

// Single instance — in-memory
const manager = new Moodenglink({ nodes, autoResume: true, store: new MemoryStore(), send });

// Survive full restarts — Redis (ioredis or node-redis v4)
import Redis from "ioredis";
const manager2 = new Moodenglink({ nodes, autoResume: true, store: new RedisStore(new Redis()), send });
```

Or bring your own by implementing the `SessionStore` interface (`get/set/delete/keys`).

## 🔌 Plugins

```ts
import { Plugin, Moodenglink } from "moodenglink";

class MyPlugin extends Plugin {
  readonly name = "my-plugin";
  load(manager: Moodenglink) {
    manager.on("trackStart", (player, track) => {
      // custom behaviour
    });
  }
}

manager.use(new MyPlugin());
```

## 🔮 Unresolved tracks (lazy resolve)

Queue Spotify/Apple metadata now, resolve to a playable source the moment it plays —
no wasted searches for tracks the user skips past.

```ts
// e.g. from a Spotify playlist you fetched yourself
for (const item of spotifyItems) {
  player.queue.add(
    manager.buildUnresolved({
      title: item.name,
      author: item.artists[0].name,
      duration: item.duration_ms,
      source: "youtube",      // where to resolve from
      requester: interaction.user.id,
    }),
  );
}

await player.play(); // the first item is resolved here, closest-match by author + duration
```

Items that can't be resolved are skipped automatically. Use `isUnresolvedTrack(item)`
to tell queue entries apart.

## 🧬 Extending structures

Swap in your own subclasses — the manager will instantiate them everywhere:

```ts
import { Structure } from "moodenglink";

Structure.extend("Player", (Player) => class extends Player {
  async announceAndPlay() {
    await this.play();
    console.log("Now playing:", this.current?.title);
  }
});

Structure.extend("Queue", (Queue) => class extends Queue {
  get totalPretty() {
    return this.length + " tracks";
  }
});

// manager.create(...) now returns your extended Player, with an extended queue.
```

Extendable: `Player`, `Queue`, `Node`, `Filters`.

## 📡 Events

| Event                                    | Payload                                   |
| ---------------------------------------- | ----------------------------------------- |
| `nodeCreate` / `nodeConnect` / `nodeReconnect` / `nodeDisconnect` / `nodeError` / `nodeDestroy` / `nodeStats` / `nodeRaw` | node lifecycle |
| `playerCreate` / `playerDestroy` / `playerMove` / `playerDisconnect` / `playerStateUpdate` | player lifecycle |
| `trackStart` / `trackEnd` / `trackStuck` / `trackError` | `(player, track, payload)` |
| `queueEnd`                               | `(player, lastTrack, payload)`            |
| `socketClosed`                           | `(player, payload)`                       |
| `lyricsFound` / `lyricsLine` / `lyricsNotFound` | `(player, …, payload)`             |
| `segmentsLoaded` / `segmentSkipped`      | SponsorBlock `(player, segment(s), payload)` |
| `chaptersLoaded` / `chapterStarted`      | SponsorBlock `(player, chapter(s), payload)` |
| `raw` / `debug`                          | low-level diagnostics                     |

## 🔎 Search platforms

`youtube`, `youtubemusic`, `soundcloud`, `spotify`, `deezer`, `applemusic`, `yandexmusic`,
`flowerytts`, `bandcamp`, `vimeo`, `twitch`, `http`, `local`.

> Platforms beyond YouTube/SoundCloud require the matching Lavalink source plugin
> (e.g. LavaSrc for Spotify/Apple/Deezer).

## 🧪 Testing

```bash
npm test            # run the Vitest suite
npm run test:watch  # watch mode
npm run test:coverage
```

## 🛠️ Building from source

```bash
npm install
npm run build     # dist/ (cjs + esm + d.ts)
npm run format
```

## 📄 License

MIT © Moodeng Lab. Built on the shoulders of Sonatica, Magmastream, Moonlink.js and Erela.js.
