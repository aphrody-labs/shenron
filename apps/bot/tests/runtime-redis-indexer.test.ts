import "./setup";
import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import { Collection } from "discord.js";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

import {
  bundledWorkerSpecifier,
  startBundledWorker,
  whenWorkerReady,
} from "../src/lib/bundled-worker";
import { RedisIndexerService } from "../src/lib/redis-indexer";

describe("bundled worker path", () => {
  test("a compiled binary finds its workers under src/workers of the embedded root", () => {
    expect(
      bundledWorkerSpecifier("indexer.ts", { compiled: true, main: "/$bunfs/root/shenron-bot" }),
    ).toBe("/$bunfs/root/src/workers/indexer.ts");
    expect(
      bundledWorkerSpecifier("indexer.ts", {
        compiled: true,
        main: "B:\\~BUN\\root\\shenron-bot.exe",
      }),
    ).toBe("B:/~BUN/root/src/workers/indexer.ts");
  });

  test("an --aot binary reports its entry module as main: the root is still the embedded root", () => {
    expect(
      bundledWorkerSpecifier("indexer.ts", {
        compiled: true,
        main: "B:\\~BUN\\root\\src\\entry-standalone.ts",
      }),
    ).toBe("B:/~BUN/root/src/workers/indexer.ts");
    expect(
      bundledWorkerSpecifier("indexer.ts", {
        compiled: true,
        main: "/$bunfs/root/src/entry-standalone.ts",
      }),
    ).toBe("/$bunfs/root/src/workers/indexer.ts");
  });

  test("from source the worker is the real file next to the library", () => {
    const specifier = bundledWorkerSpecifier("indexer.ts", { compiled: false });
    expect(specifier.startsWith("file:")).toBe(true);
    expect(existsSync(fileURLToPath(specifier))).toBe(true);
  });

  test("the build pins the embedded root to apps/bot so that layout holds", async () => {
    const build = await Bun.file(new URL("../../../scripts/build/bot.ts", import.meta.url)).text();
    expect(build).toMatch(/"--root",\s*"\.",\s*"src\/workers\/indexer\.ts"/);
    expect(build).toContain('"src/workers/indexer.ts"');
    expect(build).toContain('"src/workers/vector-builder.ts"');
  });

  test("the indexer worker boots and answers its handshake", async () => {
    const worker = startBundledWorker("indexer.ts", { compiled: false });
    try {
      await whenWorkerReady(worker, 15_000);
    } finally {
      worker.terminate();
    }
  });

  test("a worker that cannot be loaded rejects the handshake instead of staying silent", async () => {
    const worker = startBundledWorker("does-not-exist.ts", { compiled: false });
    try {
      await expect(whenWorkerReady(worker, 5_000)).rejects.toThrow();
    } finally {
      worker.terminate();
    }
  });
});

/* ── RedisIndexerService with a scripted worker ───────────────────────────── */

class FakeWorker extends EventTarget {
  posted: unknown[] = [];
  terminated = false;
  postMessage(message: unknown) {
    this.posted.push(message);
  }
  terminate() {
    this.terminated = true;
  }
  say(data: unknown) {
    this.dispatchEvent(new MessageEvent("message", { data }));
  }
  fail(message: string) {
    this.dispatchEvent(new ErrorEvent("error", { message }));
  }
}

let current: FakeWorker;
class ScriptedIndexer extends RedisIndexerService {
  protected override createWorker(): Worker {
    return current as unknown as Worker;
  }
}

const emptyClient = { guilds: { cache: new Map() } } as never;

let log: ReturnType<typeof spyOn>;
let error: ReturnType<typeof spyOn>;
beforeEach(() => {
  current = new FakeWorker();
  log = spyOn(console, "log").mockImplementation(() => {});
  error = spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  log.mockRestore();
  error.mockRestore();
});

const logged = (spy: { mock: { calls: unknown[][] } }): string[] =>
  spy.mock.calls.map((call) => String(call[0]));

describe("redis indexer worker failures are loud", () => {
  test("the production failure: a worker module that does not resolve fails every indexation", async () => {
    const indexer = new ScriptedIndexer();
    current.fail('BuildMessage: ModuleNotFound resolving "./workers/indexer.ts" (entry point)');
    expect(current.terminated).toBe(true);
    await expect(indexer.indexAll(emptyClient)).rejects.toThrow(
      /worker unavailable: .*ModuleNotFound/,
    );
    expect(logged(log).some((line) => line.includes("Indexation complète achevée"))).toBe(false);
    expect(logged(error).some((line) => line.includes("Worker indisponible"))).toBe(true);
  });

  test("a healthy worker completes and says so", async () => {
    const indexer = new ScriptedIndexer();
    current.say({ status: "ready", type: "READY", count: 0 });
    await indexer.indexAll(emptyClient);
    expect(logged(log).some((line) => line.includes("Indexation complète achevée"))).toBe(true);
  });

  test("a worker lost during the run fails the run instead of reporting success", async () => {
    const indexer = new ScriptedIndexer();
    const guild = {
      channels: { cache: new Collection() },
      members: {
        // Discord answers, then the worker dies before the next batch.
        fetch: async () => {
          current.fail("worker crashed while loading");
          return new Map();
        },
      },
    };
    const client = { guilds: { cache: new Map([["1", guild]]) } } as never;
    await expect(indexer.indexAll(client)).rejects.toThrow(/worker lost during indexation/);
    expect(logged(log).some((line) => line.includes("Indexation complète achevée"))).toBe(false);
  });

  test("an error after the handshake is logged but does not disable the worker", async () => {
    const indexer = new ScriptedIndexer();
    current.say({ status: "ready", type: "READY", count: 0 });
    current.fail("transient failure");
    await indexer.indexAll(emptyClient);
    expect(current.terminated).toBe(false);
  });
});
