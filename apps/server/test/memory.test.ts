// SPDX-License-Identifier: Apache-2.0
/**
 * The persistent chat memory of `shenron-server` (./memory.ts): the native port over a fake of
 * `@aphrody/shenron-native`, then (SHENRON_FFI_DEV=1 after `cargo build -p shenron-ffi`) the real
 * Aphrody provider through the host, from `<SHENRON_HOME>/data/memory.sqlite` to the routes.
 */
import { afterAll, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MemoryListResponse } from "@aphrody/shenron-api/contract";
import { createLocalApi } from "@aphrody/shenron-api/host";
import type { ChatSocketData } from "@aphrody/shenron-api/server";
import {
  SHENRON_FFI_FILE,
  shenronMemoryAdd,
  shenronMemorySearch,
} from "@aphrody/shenron-native/shenron";

import { nativeMemory, type NativeMemory } from "../src/memory";
import { testPaths } from "./support";

const root = mkdtempSync(join(tmpdir(), "shenron-server-memory-"));
afterAll(() => rmSync(root, { recursive: true, force: true }));

/** In-memory fake of the native calls: rows per database file, newest first. */
function fakeNative() {
  const calls: string[] = [];
  const rows: { db: string; id: string; agentId: string; content: string; tags: string[] }[] = [];
  let n = 0;
  const memoryOf = (row: (typeof rows)[number]) => ({
    id: row.id,
    agentId: row.agentId,
    content: row.content,
    tags: row.tags,
    metadata: {},
    createdAtMs: 0,
  });
  const native: NativeMemory = {
    load: (path) => calls.push(`load ${path}`),
    add: (db, request) => {
      calls.push(`add ${db} ${request.agentId}`);
      const row = {
        db,
        id: `m${++n}`,
        agentId: request.agentId,
        content: request.content,
        tags: request.tags ?? [],
      };
      rows.push(row);
      return memoryOf(row);
    },
    search: (db, request) => {
      calls.push(`search ${db} ${request.agentId}`);
      return rows
        .filter((row) => row.db === db && row.agentId === request.agentId)
        .toReversed()
        .slice(0, request.limit ?? 100)
        .map(memoryOf);
    },
    delete: (db, agentId, id) => {
      calls.push(`delete ${db} ${agentId}`);
      const i = rows.findIndex((row) => row.db === db && row.agentId === agentId && row.id === id);
      if (i >= 0) rows.splice(i, 1);
      return i >= 0;
    },
    clear: (db, agentId) => {
      calls.push(`clear ${db} ${agentId}`);
      const before = rows.length;
      for (let i = rows.length - 1; i >= 0; i--)
        if (rows[i]!.db === db && rows[i]!.agentId === agentId) rows.splice(i, 1);
      return before - rows.length;
    },
  };
  return { native, calls, rows };
}

/** The settings the host gives: agent home ids, one file per home, the former default file. */
const settings = {
  agentId: (owner: string) => owner,
  dbPath: (agentId: string) => `/homes/${agentId}/memory.sqlite`,
  aliases: (agentId: string) => (agentId === "discord:42" ? ["local"] : []),
  legacy: { dbPath: "/data/memory.sqlite", agentId: (owner: string) => `shenron/${owner}` },
};

describe("native memory port", () => {
  test("without the native library the group reports why", () => {
    const paths = testPaths(join(root, "absent"));
    expect(nativeMemory(paths, {}, fakeNative().native)(settings)).toEqual({
      reason: "bibliothèque native absente : mémoire indisponible",
    });
  });

  test("each owner's memory lives in its agent home, former records moved there once", async () => {
    const paths = testPaths(join(root, "fake"));
    writeFileSync(join(paths.exeDir, SHENRON_FFI_FILE), "");
    const { native, calls, rows } = fakeNative();
    // Two records of 7440e01 for `local`, oldest first.
    native.add("/data/memory.sqlite", { agentId: "shenron/local", content: "ancien 1" });
    native.add("/data/memory.sqlite", { agentId: "shenron/local", content: "ancien 2" });
    calls.length = 0;
    const opened = nativeMemory(paths, {}, native)(settings);
    if (!("port" in opened)) throw new Error(opened.reason);
    const port = opened.port;

    const local = await port.list("local", { limit: 10 });
    expect(local.map((m) => m.content)).toEqual(["ancien 2", "ancien 1"]);
    expect(rows.every((row) => row.agentId === "local")).toBe(true);
    await port.list("local", { limit: 10 });

    const fact = await port.remember("discord:42", { content: "x", tags: ["fact"], metadata: {} });
    expect(fact).toEqual({
      id: fact.id,
      content: "x",
      tags: ["fact"],
      createdAt: "1970-01-01T00:00:00.000Z",
      metadata: {},
    });
    expect(await port.forget("discord:42", fact.id)).toBe(true);
    expect(await port.clear("local")).toBe(2);
    expect(calls).toEqual([
      `load ${join(paths.exeDir, SHENRON_FFI_FILE)}`,
      "search /homes/local/memory.sqlite local",
      "search /data/memory.sqlite shenron/local",
      "add /homes/local/memory.sqlite local",
      "add /homes/local/memory.sqlite local",
      "clear /data/memory.sqlite shenron/local",
      "search /homes/local/memory.sqlite local",
      // The second list does not migrate again.
      "search /homes/local/memory.sqlite local",
      "search /data/memory.sqlite shenron/discord:42",
      // Signed in: the home's `local` records (none here) move to `discord:42`.
      "search /homes/discord:42/memory.sqlite local",
      "add /homes/discord:42/memory.sqlite discord:42",
      "delete /homes/discord:42/memory.sqlite discord:42",
      "clear /homes/local/memory.sqlite local",
    ]);
  });
});

describe("agent home sign-in", () => {
  test("a home's `local` records follow it to `discord:<id>` in the same file", async () => {
    const paths = testPaths(join(root, "alias"));
    writeFileSync(join(paths.exeDir, SHENRON_FFI_FILE), "");
    const { native } = fakeNative();
    const db = "/homes/one/memory.sqlite";
    native.add(db, { agentId: "local", content: "Je m'appelle Yohan" });
    const opened = nativeMemory(
      paths,
      {},
      native,
    )({
      ...settings,
      dbPath: () => db,
      aliases: (agentId) => (agentId.startsWith("discord:") ? ["local"] : []),
    });
    if (!("port" in opened)) throw new Error(opened.reason);
    const mine = await opened.port.list("discord:7", { limit: 10 });
    expect(mine.map((m) => m.content)).toEqual(["Je m'appelle Yohan"]);
    expect(native.search(db, { agentId: "local" })).toEqual([]);
  });
});

/** The library built by `cargo build -p shenron-ffi`, opt-in like the @aphrody/shenron-native suite. */
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
  test("each agent home keeps its memory across restarts, former records moved in", async () => {
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
      const host = createLocalApi(env, {
        memory: nativeMemory(paths, env),
        memoryLocation: homeDb,
      });
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
    // A record of 7440e01 in the default file, then the agent homes of this server.
    const defaultDb = join(paths.data, "memory.sqlite");
    const legacy = shenronMemoryAdd(defaultDb, {
      agentId: "shenron/local",
      content: "Je m'appelle Yohan",
    });
    const homeDb = (agentId: string) => join(paths.home, "homes", agentId, "memory.sqlite");
    const opened = nativeMemory(
      paths,
      env,
    )({
      agentId: (owner) => owner,
      dbPath: homeDb,
      aliases: () => [],
      legacy: { dbPath: defaultDb, agentId: (owner) => `shenron/${owner}` },
    });
    if (!("port" in opened)) throw new Error(opened.reason);
    const stored = await opened.port.remember("local", {
      content: "Mon personnage préféré est Piccolo",
      tags: ["preference"],
      metadata: { source: "chat" },
    });
    await opened.port.remember("someone-else", { content: "Vegeta", tags: [], metadata: {} });
    expect(statSync(homeDb("local")).mode & 0o777).toBe(0o600);
    expect(shenronMemorySearch(homeDb("someone-else"), { agentId: "someone-else" })).toHaveLength(
      1,
    );
    expect(shenronMemorySearch(defaultDb, { agentId: "shenron/local" })).toEqual([]);

    await serve(async (base) => {
      const body = MemoryListResponse.parse(await (await fetch(`${base}/api/v1/memory`)).json());
      expect(body.total).toBe(2);
      // Moved, not copied: a new id in the home (same-millisecond records keep no order).
      const moved = body.memories.find((m) => m.content === legacy.content);
      expect(moved?.id).not.toBe(legacy.id);
      expect(body.memories.find((m) => m.id === stored.id)).toMatchObject({
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
      expect(await clear.json()).toEqual({ deleted: 1 });
    });
    expect(await opened.port.clear("someone-else")).toBe(1);
  });
});
