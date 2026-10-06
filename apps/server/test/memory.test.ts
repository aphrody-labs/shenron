// SPDX-License-Identifier: Apache-2.0
/**
 * The persistent chat memory of `shenron-server` (./memory.ts): the native port over a fake of
 * `@shenron/native`, then (SHENRON_FFI_DEV=1 after `cargo build -p shenron-ffi`) the real
 * Aphrody provider through the host, from `<SHENRON_HOME>/data/memory.sqlite` to the routes.
 */
import { afterAll, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MemoryListResponse } from "@shenron/api/contract";
import { createLocalApi } from "@shenron/api/host";
import type { ChatSocketData } from "@shenron/api/server";
import { SHENRON_FFI_FILE } from "@shenron/native/shenron";

import { nativeMemory, type NativeMemory } from "../src/memory";
import { testPaths } from "./support";

const root = mkdtempSync(join(tmpdir(), "shenron-server-memory-"));
afterAll(() => rmSync(root, { recursive: true, force: true }));

function fakeNative() {
  const calls: unknown[][] = [];
  const native: NativeMemory = {
    load: (path) => calls.push(["load", path]),
    add: (db, request) => {
      calls.push(["add", db, request]);
      return {
        id: "m1",
        ...request,
        tags: request.tags ?? [],
        metadata: request.metadata ?? {},
        createdAtMs: 0,
      };
    },
    search: (db, request) => {
      calls.push(["search", db, request]);
      return [];
    },
    delete: (db, agentId, id) => {
      calls.push(["delete", db, agentId, id]);
      return true;
    },
    clear: (db, agentId) => {
      calls.push(["clear", db, agentId]);
      return 2;
    },
  };
  return { native, calls };
}

describe("native memory port", () => {
  test("without the native library the group reports why", () => {
    const paths = testPaths(join(root, "absent"));
    const open = nativeMemory(paths, {}, fakeNative().native);
    expect(open({ dbPath: "/x/memory.sqlite", agentId: (o) => `shenron/${o}` })).toEqual({
      reason: "bibliothèque native absente : mémoire indisponible",
    });
  });

  test("every call goes to the owner's agent id in the configured file", async () => {
    const paths = testPaths(join(root, "fake"));
    writeFileSync(join(paths.exeDir, SHENRON_FFI_FILE), "");
    const { native, calls } = fakeNative();
    const opened = nativeMemory(
      paths,
      {},
      native,
    )({
      dbPath: "/m.sqlite",
      agentId: (owner) => `shenron/${owner}`,
    });
    if (!("port" in opened)) throw new Error(opened.reason);
    const port = opened.port;
    expect(await port.remember("alice", { content: "x", tags: ["fact"], metadata: {} })).toEqual({
      id: "m1",
      content: "x",
      tags: ["fact"],
      createdAt: "1970-01-01T00:00:00.000Z",
      metadata: {},
    });
    await port.list("alice", { limit: 3, q: "x" });
    expect(await port.forget("alice", "m1")).toBe(true);
    expect(await port.clear("alice")).toBe(2);
    expect(calls).toEqual([
      ["load", join(paths.exeDir, SHENRON_FFI_FILE)],
      ["search", "/m.sqlite", { agentId: "shenron/local", limit: 1 }],
      [
        "add",
        "/m.sqlite",
        { agentId: "shenron/alice", content: "x", tags: ["fact"], metadata: {} },
      ],
      ["search", "/m.sqlite", { agentId: "shenron/alice", limit: 3, q: "x" }],
      ["delete", "/m.sqlite", "shenron/alice", "m1"],
      ["clear", "/m.sqlite", "shenron/alice"],
    ]);
  });
});

/** The library built by `cargo build -p shenron-ffi`, opt-in like the @shenron/native suite. */
function builtLibrary(): string | undefined {
  if (process.env.SHENRON_FFI_LIB) return process.env.SHENRON_FFI_LIB;
  if (process.env.SHENRON_FFI_DEV !== "1") return undefined;
  const target = process.env.CARGO_TARGET_DIR ?? join(import.meta.dir, "..", "..", "..", "target");
  return ["release", "debug"]
    .map((profile) => join(target, profile, SHENRON_FFI_FILE))
    .filter((path) => existsSync(path))
    .toSorted((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)[0];
}
const library = builtLibrary();

describe.if(library !== undefined)("with the built shenron-ffi library", () => {
  test("the host remembers across restarts in <home>/data/memory.sqlite", async () => {
    const paths = testPaths(join(root, "live"));
    const env = {
      HOME: paths.home,
      SHENRON_DATA_DIR: paths.data,
      SHENRON_FFI_LIB: library!,
      SHENRON_CHAT_STORE: "off",
      SHENRON_CHAT_TOOLS: "0",
      APHRODY_BIN: join(root, "absent"),
    };
    /** One served host on the memory file; the direct loopback owner is `local`. */
    const serve = async <T>(run: (base: string) => Promise<T>) => {
      const host = createLocalApi(env, { memory: nativeMemory(paths, env) });
      expect(host.groups.memory).toEqual({ available: true });
      const server = Bun.serve({
        port: 0,
        hostname: "127.0.0.1",
        ...host.serveOptions(),
      } as Bun.Serve.Options<ChatSocketData>);
      try {
        return await run(`http://127.0.0.1:${server.port}`);
      } finally {
        void server.stop(true);
        await host.close();
      }
    };
    const opened = nativeMemory(
      paths,
      env,
    )({
      dbPath: join(paths.data, "memory.sqlite"),
      agentId: (owner) => `shenron/${owner}`,
    });
    if (!("port" in opened)) throw new Error(opened.reason);
    const stored = await opened.port.remember("local", {
      content: "Mon personnage préféré est Piccolo",
      tags: ["preference"],
      metadata: { source: "chat" },
    });
    await opened.port.remember("someone-else", { content: "Vegeta", tags: [], metadata: {} });
    expect(statSync(join(paths.data, "memory.sqlite")).mode & 0o777).toBe(0o600);

    await serve(async (base) => {
      const body = MemoryListResponse.parse(await (await fetch(`${base}/api/v1/memory`)).json());
      expect(body.total).toBe(1);
      expect(body.memories[0]).toMatchObject({
        id: stored.id,
        content: "Mon personnage préféré est Piccolo",
        tags: ["preference"],
        metadata: { source: "chat" },
      });
    });
    // A second server on the same file: the memory survived, deletion and clearing work.
    await serve(async (base) => {
      const del = await fetch(`${base}/api/v1/memory/${stored.id}/delete`, { method: "POST" });
      expect(await del.json()).toEqual({ ok: true });
      const again = await fetch(`${base}/api/v1/memory/${stored.id}/delete`, { method: "POST" });
      expect(again.status).toBe(404);
      const clear = await fetch(`${base}/api/v1/memory/clear`, { method: "POST" });
      expect(await clear.json()).toEqual({ deleted: 0 });
    });
    expect(await opened.port.clear("someone-else")).toBe(1);
  });
});
