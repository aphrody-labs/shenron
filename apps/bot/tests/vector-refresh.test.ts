import { test, expect } from "bun:test";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ReaderLeases, createVectorRefresh } from "../src/lib/vector-refresh";
const epoch = "723df323-96c2-40f3-a42a-bd6081ad6b42";
const digest = (value: string) => new Bun.CryptoHasher("sha256").update(value).digest("hex");
test("index retirement waits for query leases while new queries use replacement", async () => {
  const leases = new ReaderLeases<{ id: number; close(): void }>();
  const closed: number[] = [];
  await leases.swap({
    id: 1,
    close() {
      closed.push(1);
    },
  });
  let release!: () => void;
  const held = leases.use(async (r) => {
    await new Promise<void>((resolve) => (release = resolve));
    return r.id;
  });
  const swapping = leases.swap({
    id: 2,
    close() {
      closed.push(2);
    },
  });
  expect(closed).toEqual([]);
  expect(await leases.use(async (r) => r.id)).toBe(2);
  release();
  expect(await held).toBe(1);
  await swapping;
  expect(closed).toEqual([1]);
  await leases.close();
  expect(closed).toEqual([1, 2]);
  await expect(leases.use(async (r) => r.id)).rejects.toThrow("temporarily unavailable");
});
test("quiet generations build once, pin pointer, retain previous, and reject drift", async () => {
  const base = await mkdtemp(join(tmpdir(), "shenron-refresh-"));
  try {
    const root = join(base, "generations");
    await mkdir(root, { mode: 0o700 });
    let revision = 1,
      builds = 0,
      drift = false;
    const closed: number[] = [];
    const generation = () => ({ epoch, revision: String(revision) });
    async function artifact(directory: string, rev = revision) {
      await mkdir(directory, { mode: 0o700 });
      const manifest = JSON.stringify({ generation: { epoch, revision: String(rev) } }),
        index = "native-fixture";
      const receipt = JSON.stringify({
        schema: "shenron-vector-sidecar-build/v1",
        fullReadbackVerified: true,
        manifestSha256: digest(manifest),
        indexSha256: digest(index),
      });
      await Bun.write(join(directory, "manifest.json"), manifest);
      await Bun.write(join(directory, "index.bin"), index);
      await Bun.write(join(directory, "build-receipt.json"), receipt);
      return {
        directory,
        manifestSha256: digest(manifest),
        receiptSha256: digest(receipt),
        generation: { epoch, revision: String(rev) },
      };
    }
    const anchor = await artifact(join(base, "bootstrap"));
    const manager = await createVectorRefresh(
      { root, intervalMs: 30000, minFreeBytes: 2 * 1024 ** 3, maxIndexBytes: 1024 },
      anchor,
      {
        generation: async () => generation(),
        freeBytes: async () => 4 * 1024 ** 3,
        lock: async (run) => run(),
        open: async (config) => {
          const m = await Bun.file(join(config.directory, "manifest.json")).json();
          if (m.generation.revision !== String(revision)) throw Error("RAG generation differs");
          return {
            close() {
              closed.push(Number(m.generation.revision));
            },
          };
        },
        build: async (directory) => {
          builds++;
          const result = await artifact(directory);
          if (drift) revision++;
          return result;
        },
      },
    );
    revision = 2;
    expect(await manager.tick()).toMatchObject({ quietWindow: true });
    expect(builds).toBe(0);
    expect(await manager.tick()).toMatchObject({ refreshed: true });
    expect(builds).toBe(1);
    const first = manager.pointer.current.directory;
    expect(manager.pointer.previous?.directory).toBe(anchor.directory);
    expect((await Bun.file(join(root, "active.json")).json()).current.manifestSha256).toBe(
      manager.pointer.current.manifestSha256,
    );
    revision = 3;
    await manager.tick();
    await manager.tick();
    expect(manager.pointer.previous?.directory).toBe(first);
    revision = 4;
    await manager.tick();
    await manager.tick();
    expect(await Bun.file(join(first, "manifest.json")).exists()).toBe(false);
    const pinned = manager.pointer.current.directory;
    revision = 5;
    drift = true;
    await manager.tick();
    await expect(manager.tick()).rejects.toThrow("generation changed");
    expect(manager.pointer.current.directory).toBe(pinned);
    await manager.stop();
    expect(closed).toEqual([1, 2, 3, 4]);
  } finally {
    await rm(base, { recursive: true, force: true });
  }
});
test("refresh job belongs to existing registry and stop drains its owner", async () => {
  const { registerVectorRefreshJob, VECTOR_REFRESH_JOB } =
    await import("../src/api/vector-refresh-job");
  let registered: any,
    runs = 0,
    stops = 0;
  const registry = {
    run: async () => {},
    register(value: unknown) {
      registered = value;
    },
  };
  const job = await registerVectorRefreshJob(registry, true, 30000, {
    run: async () => {
      runs++;
    },
    stop: async () => {
      stops++;
    },
  });
  expect(registered.name).toBe(VECTOR_REFRESH_JOB);
  expect(registered.owner).toBe("rag");
  expect(registered.duplicateBehavior).toBe("skip");
  await registered.fn();
  await job.stop();
  expect(runs).toBe(1);
  expect(stops).toBe(1);
});
test("worker reports invalid build without leaving shutdown pending", async () => {
  const { buildWithVectorWorker } = await import("../src/lib/vector-build-worker");
  await expect(
    buildWithVectorWorker(
      "/tmp/does-not-exist-shenron-vector-test",
      "bad",
      async () => ({ epoch, revision: "1" }),
      AbortSignal.timeout(3000),
    ),
  ).rejects.toThrow("not qualified");
});
test("overlapping ticks are skipped and shutdown joins the cancelled build", async () => {
  const base = await mkdtemp(join(tmpdir(), "shenron-refresh-stop-"));
  try {
    const directory = join(base, "bootstrap");
    await mkdir(directory, { mode: 0o700 });
    const manifest = JSON.stringify({ generation: { epoch, revision: "1" } }),
      receipt = "fixture";
    await Bun.write(join(directory, "manifest.json"), manifest);
    await Bun.write(join(directory, "build-receipt.json"), receipt);
    let revision = "1",
      builds = 0,
      cancelled = false,
      closed = 0,
      entered!: () => void;
    const started = new Promise<void>((resolve) => (entered = resolve));
    const manager = await createVectorRefresh(
      {
        root: join(base, "generations"),
        intervalMs: 30000,
        minFreeBytes: 2 * 1024 ** 3,
        maxIndexBytes: 1024,
      },
      { directory, manifestSha256: digest(manifest), receiptSha256: digest(receipt) },
      {
        generation: async () => ({ epoch, revision }),
        open: async () => ({
          close() {
            closed++;
          },
        }),
        lock: async (run) => run(),
        freeBytes: async () => 4 * 1024 ** 3,
        build: async (_directory, signal) => {
          builds++;
          entered();
          return new Promise((_, reject) =>
            signal.addEventListener(
              "abort",
              () => {
                cancelled = true;
                reject(Error("cancelled"));
              },
              { once: true },
            ),
          );
        },
      },
    );
    revision = "2";
    await manager.tick();
    const active = manager.tick();
    const rejected = active.catch((error) => error);
    await started;
    expect(await manager.tick()).toBeUndefined();
    expect(builds).toBe(1);
    await manager.stop();
    expect((await rejected).message).toBe("cancelled");
    expect(cancelled).toBe(true);
    expect(closed).toBe(1);
    expect(manager.pointer.current.directory).toBe(directory);
  } finally {
    await rm(base, { recursive: true, force: true });
  }
});
