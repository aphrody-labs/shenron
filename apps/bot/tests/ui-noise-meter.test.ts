import "./setup";
import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  NoiseMeter,
  botNoiseMeter,
  classifyBotMessage,
  isEditorial,
  jsonFileNoiseStore,
  noiseStorePath,
  type NoiseKind,
  type NoiseStore,
} from "../src/ui/noise-meter";

const HOUR = 3_600_000;
const T0 = Date.UTC(2026, 9, 20, 10, 30);

function clock(start = T0) {
  let now = start;
  return {
    now: () => now,
    set: (value: number) => (now = value),
    advance: (ms: number) => (now += ms),
  };
}

function memoryStore(initial: unknown = null) {
  let saved: unknown = initial;
  const store: NoiseStore & { saves: number; saved: () => unknown } = {
    saves: 0,
    saved: () => saved,
    load: async () => saved,
    save: async (data) => {
      store.saves += 1;
      saved = JSON.parse(JSON.stringify(data));
    },
  };
  return store;
}

describe("counting", () => {
  test("totals split editorial content from noise, per kind and per channel", () => {
    const time = clock();
    const meter = new NoiseMeter({ now: time.now });
    meter.record({ channelId: "chat", kind: "command" });
    meter.record({ channelId: "chat", kind: "command" });
    meter.record({ channelId: "levels", kind: "level" });
    meter.record({ channelId: "news", kind: "news" });
    meter.record({ channelId: "chat", kind: "game" });
    const snap = meter.snapshot();
    expect(snap.totals).toEqual({ all: 5, noise: 3, editorial: 2 });
    expect(snap.byKind.command).toEqual({ count: 2, editorial: false });
    expect(snap.byKind.news).toEqual({ count: 1, editorial: true });
    expect(snap.channels.map((c) => [c.channelId, c.all, c.noise])).toEqual([
      ["chat", 3, 2],
      ["levels", 1, 1],
      ["news", 1, 0],
    ]);
    expect(snap.channels[0]!.kinds).toEqual({ command: 2, game: 1 });
    expect(snap.since).toBe(new Date(Math.floor(T0 / HOUR) * HOUR).toISOString());
    expect(["news", "giveaway", "game"].every(isEditorial)).toBe(true);
    expect(isEditorial("level")).toBe(false);
  });

  test("the window selects recent buckets; the daily trend covers the retention", () => {
    const time = clock();
    const meter = new NoiseMeter({ now: time.now });
    meter.record({ channelId: "a", kind: "level" }); // day 20
    time.set(T0 + 30 * HOUR); // day 21, 16:30
    meter.record({ channelId: "a", kind: "level" });
    meter.record({ channelId: "a", kind: "news" });
    const day = meter.snapshot({ windowMs: 24 * HOUR });
    expect(day.totals).toEqual({ all: 2, noise: 1, editorial: 1 });
    const week = meter.snapshot({ windowMs: 7 * 24 * HOUR });
    expect(week.totals.all).toBe(3);
    expect(week.daily).toEqual([
      { day: "2026-10-20", noise: 1, editorial: 0 },
      { day: "2026-10-21", noise: 1, editorial: 1 },
    ]);
  });

  test("memory is bounded: a bucket folds extra channels, old buckets are dropped", () => {
    const time = clock();
    const meter = new NoiseMeter({ now: time.now, maxKeysPerBucket: 3, retentionMs: 48 * HOUR });
    for (const channel of ["a", "b", "c", "d", "e"])
      meter.record({ channelId: channel, kind: "level" });
    meter.record({ channelId: "a", kind: "level" });
    const snap = meter.snapshot();
    expect(snap.totals.all).toBe(6);
    expect(snap.channels.map((c) => c.channelId).toSorted()).toEqual(["*", "a", "b", "c"]);
    expect(snap.channels.find((c) => c.channelId === "*")!.all).toBe(2);

    time.advance(100 * HOUR);
    meter.record({ channelId: "a", kind: "level" });
    expect(meter.snapshot({ windowMs: 1_000 * HOUR }).totals.all).toBe(1);
  });

  test("record() is synchronous and never touches the store (no write per message)", async () => {
    const store = memoryStore();
    const meter = new NoiseMeter({ store });
    for (let i = 0; i < 500; i++) meter.record({ channelId: "a", kind: "command" });
    expect(store.saves).toBe(0);
    await meter.flush();
    expect(store.saves).toBe(1);
  });
});

describe("persistence", () => {
  test("flush writes only when something changed; load restores and merges", async () => {
    const time = clock();
    const store = memoryStore();
    const first = new NoiseMeter({ now: time.now, store });
    expect(await first.flush()).toBe(false);
    first.record({ channelId: "a", kind: "level" });
    first.record({ channelId: "a", kind: "level" });
    expect(await first.flush()).toBe(true);
    expect(await first.flush()).toBe(false);
    expect(store.saves).toBe(1);

    const second = new NoiseMeter({ now: time.now, store });
    second.record({ channelId: "a", kind: "level" }); // counted before the load finishes
    await second.load();
    expect(second.snapshot().totals.all).toBe(3);
    expect(second.snapshot().channels[0]).toMatchObject({ channelId: "a", all: 3 });
  });

  test("an unreadable, foreign or mismatched file is ignored, a failing save is retried", async () => {
    for (const bad of [
      null,
      "garbage",
      { version: 2 },
      { version: 1, bucketMs: 1, buckets: {} },
      42,
    ]) {
      const meter = new NoiseMeter({ store: memoryStore(bad) });
      await meter.load();
      expect(meter.snapshot().totals.all).toBe(0);
    }
    const throwing = new NoiseMeter({
      store: {
        load: async () => {
          throw new Error("disk");
        },
        save: async () => {},
      },
    });
    await throwing.load();
    expect(throwing.snapshot().totals.all).toBe(0);

    let fail = true;
    const saves: unknown[] = [];
    const flaky = new NoiseMeter({
      store: {
        load: async () => null,
        save: async (data) => {
          if (fail) throw new Error("disk full");
          saves.push(data);
        },
      },
    });
    flaky.record({ channelId: "a", kind: "level" });
    await expect(flaky.flush()).rejects.toThrow("disk full");
    fail = false;
    expect(await flaky.flush()).toBe(true);
    expect(saves).toHaveLength(1);
  });

  test("restored counts older than the retention are dropped, junk counts are ignored", async () => {
    const time = clock();
    const start = Math.floor(time.now() / HOUR) * HOUR;
    const store = memoryStore({
      version: 1,
      bucketMs: HOUR,
      buckets: {
        [String(start)]: { "a|level": 4, "b|command": -2, "c|command": "x", "d|command": 0 },
        [String(start - 40 * 24 * HOUR)]: { "a|level": 9 },
        nope: { "a|level": 1 },
      },
    });
    const meter = new NoiseMeter({ now: time.now, store });
    await meter.load();
    expect(meter.snapshot().totals).toEqual({ all: 4, noise: 4, editorial: 0 });
  });

  test("the periodic flush runs on a timer and stops", async () => {
    const store = memoryStore();
    const meter = new NoiseMeter({ store });
    meter.record({ channelId: "a", kind: "level" });
    meter.startFlushing(10);
    meter.startFlushing(10); // idempotent
    await Bun.sleep(60);
    meter.stopFlushing();
    expect(store.saves).toBe(1);
    meter.record({ channelId: "a", kind: "level" });
    await Bun.sleep(40);
    expect(store.saves).toBe(1);
  });

  test("the JSON file store round-trips next to the database", async () => {
    const dir = mkdtempSync(join(tmpdir(), "noise-meter-"));
    try {
      const path = noiseStorePath(join(dir, "bot.db"));
      expect(path).toBe(join(dir, "noise-meter.json"));
      const store = jsonFileNoiseStore(path);
      expect(await store.load()).toBeNull();
      const meter = new NoiseMeter({ store });
      meter.record({ channelId: "a", kind: "welcome" });
      await meter.flush();
      const restored = new NoiseMeter({ store });
      await restored.load();
      expect(restored.snapshot().byKind.welcome?.count).toBe(1);
      await Bun.write(path, "{not json");
      const broken = new NoiseMeter({ store });
      await broken.load();
      expect(broken.snapshot().totals.all).toBe(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("classifyBotMessage()", () => {
  const kinds = new Map<string, NoiseKind>([
    ["lvl", "level"],
    ["ann", "news"],
  ]);
  const meter = new NoiseMeter();

  test("the response of a slash command is a command, game and giveaway commands are editorial", () => {
    const reply = (commandName: string) => ({
      channelId: "x",
      interaction: { commandName },
      interactionMetadata: {},
    });
    expect(classifyBotMessage(reply("profil"), kinds, meter)).toBe("command");
    expect(classifyBotMessage(reply("config list"), kinds, meter)).toBe("command");
    expect(classifyBotMessage(reply("pendu"), kinds, meter)).toBe("game");
    expect(classifyBotMessage(reply("Quiz"), kinds, meter)).toBe("game");
    expect(classifyBotMessage(reply("giveaway"), kinds, meter)).toBe("giveaway");
    expect(classifyBotMessage({ channelId: "x", interactionMetadata: {} }, kinds, meter)).toBe(
      "command",
    );
  });

  test("other messages take the kind of their configured channel, else other", () => {
    expect(classifyBotMessage({ channelId: "lvl" }, kinds, meter)).toBe("level");
    expect(classifyBotMessage({ channelId: "ann" }, kinds, meter)).toBe("news");
    expect(classifyBotMessage({ channelId: "unknown" }, kinds, meter)).toBe("other");
  });

  test("a hint from the sender wins once, then expires", () => {
    const time = clock();
    const hinted = new NoiseMeter({ now: time.now });
    hinted.hint("lvl", "share");
    expect(classifyBotMessage({ channelId: "lvl" }, kinds, hinted)).toBe("share");
    expect(classifyBotMessage({ channelId: "lvl" }, kinds, hinted)).toBe("level");
    hinted.hint("lvl", "news", 5_000);
    time.advance(6_000);
    expect(classifyBotMessage({ channelId: "lvl" }, kinds, hinted)).toBe("level");
  });
});

describe("the messageCreate listener", () => {
  const settings = {
    getSnowflake: mock(async (key: string) =>
      key === "channel.level" ? "100000000000000001" : undefined,
    ),
  };
  const BOT = "900000000000000001";
  const message = (extra: Record<string, unknown> = {}) => ({
    guildId: "800000000000000001",
    channelId: "100000000000000001",
    author: { id: BOT },
    client: { user: { id: BOT } },
    ...extra,
  });

  beforeEach(() => botNoiseMeter.clear());
  afterEach(() => botNoiseMeter.stopFlushing());

  test("counts the bot's own guild messages by channel kind, and nothing else", async () => {
    const { NoiseMeterEvent } = await import("../src/events/NoiseMeter");
    const listener = new NoiseMeterEvent(settings as never);

    await listener.onMessage([message()] as never);
    await listener.onMessage([message({ channelId: "100000000000000009" })] as never);
    await listener.onMessage([
      message({ interaction: { commandName: "profil" }, interactionMetadata: {} }),
    ] as never);
    // not counted: a member's message, a DM, a message of another bot
    await listener.onMessage([message({ author: { id: "700000000000000001" } })] as never);
    await listener.onMessage([message({ guildId: null })] as never);

    const snap = botNoiseMeter.snapshot();
    expect(snap.totals.all).toBe(3);
    expect(snap.byKind.level?.count).toBe(1);
    expect(snap.byKind.other?.count).toBe(1);
    expect(snap.byKind.command?.count).toBe(1);
  });

  test("a failing settings read never breaks the handler and the message is still counted", async () => {
    const { NoiseMeterEvent } = await import("../src/events/NoiseMeter");
    const broken = new NoiseMeterEvent({
      getSnowflake: async () => {
        throw new Error("db down");
      },
    } as never);
    await expect(broken.onMessage([message()] as never)).resolves.toBeUndefined();
    expect(botNoiseMeter.snapshot().byKind.other?.count).toBe(1);
  });
});
