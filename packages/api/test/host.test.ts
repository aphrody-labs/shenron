// SPDX-License-Identifier: Apache-2.0
/**
 * `@aphrody/shenron-api/host`: group availability (`groups`, `handles`) of the composed API, each
 * missing capability reported without throwing, and the chat backends a host can call.
 */
import { Database } from "bun:sqlite";
import { afterAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ShenronVfs, writeWikiRows } from "@aphrody/shenron-db/vfs";
import { LocalApiGroups } from "../src/contract/local";
import { createLocalApi, type LocalApi, usableChatBackends } from "../src/host";

const root = mkdtempSync(join(tmpdir(), "shenron-host-"));
const hosts: LocalApi[] = [];
afterAll(async () => {
  await Promise.all(hosts.map((created) => created.close()));
  rmSync(root, { recursive: true, force: true });
});

let counter = 0;
/** Isolated environment: private data dir, no aphrody, no chat backend, no MCP tools. */
function baseEnv(over: Record<string, string | undefined> = {}) {
  const dir = join(root, `env-${++counter}`);
  mkdirSync(dir, { recursive: true });
  return {
    HOME: dir,
    SHENRON_DATA_DIR: dir,
    APHRODY_BIN: join(dir, "absent", "aphrody"),
    SHENRON_CHAT_BACKENDS: "local",
    SHENRON_CHAT_TOOLS: "0",
    ...over,
  };
}

function host(env: Record<string, string | undefined>, options = {}) {
  const created = createLocalApi(env, options);
  hosts.push(created);
  return created;
}

/** In-memory VFS with one wiki entity, one inline asset and one CDN asset. */
function memoryVfs(): Database {
  const db = new Database(":memory:");
  const vfs = new ShenronVfs(db);
  vfs.setMeta("profile", "public");
  vfs.mkdirAll("/assets");
  vfs.write("/assets/logo.txt", "logo", { visibility: "public" });
  vfs.index("/assets/planche.webp", { storage: "cdn", size: 4, sha256: "0".repeat(64) });
  writeWikiRows(db, [
    { category: "characters", id: 1, slug: "son-goku", search: "son goku", data: { id: 1 } },
  ]);
  return db;
}

describe("groups", () => {
  test("nothing installed: every group disabled with its reason, no route claimed", () => {
    const api = host(baseEnv({ SHENRON_CHAT_STORE: "off" }));
    expect(LocalApiGroups.parse(api.groups)).toEqual(api.groups);
    expect(Object.values(api.groups).every((group) => !group.available)).toBe(true);
    expect(api.groups.vfs.reason).toBe("aucun VFS Shenron installé");
    expect(api.groups.ocr.reason).toBe("aphrody introuvable : OCR indisponible");
    for (const path of ["/api/v1/vfs", "/api/v1/chat", "/api/public/openapi.json", "/assets/x"])
      expect(api.handles(path)).toBe(false);
  });

  test("a local store alone enables conversations, sync and the meta routes", () => {
    const api = host(baseEnv());
    expect(api.groups.conversations).toEqual({ available: true });
    expect(api.groups.sync).toEqual({ available: true });
    expect(api.handles("/api/v1/conversations")).toBe(true);
    expect(api.handles("/api/public/openapi.json")).toBe(true);
    expect(api.handles("/api/v1/chat")).toBe(false);
  });

  test("a declared local model enables chat and models", () => {
    const api = host(baseEnv({ APHRODY_LOCAL_MODEL_URL: "http://127.0.0.1:9" }));
    expect(api.groups.chat).toEqual({ available: true });
    expect(api.groups.models).toEqual({ available: true });
    expect(api.handles("/api/v1/chat/ws")).toBe(true);
  });

  test("wiki: false leaves the wiki routes to another host, the VFS still serves the rest", () => {
    const api = host(baseEnv(), { vfsDatabase: memoryVfs(), wiki: false });
    expect(api.groups.wiki).toEqual({ available: false, reason: "wiki servi par le site" });
    expect(api.groups.rag).toEqual({ available: true });
    expect(api.handles("/api/public/wiki/categories")).toBe(false);
    expect(api.handles("/api/public/rag/search")).toBe(true);
    expect(api.handles("/assets/logo.txt")).toBe(true);
  });

  test("an unreadable VFS file and an unwritable store disable their groups without throwing", () => {
    const env = baseEnv();
    const bogus = join(env.SHENRON_DATA_DIR, "bogus.sqlite");
    writeFileSync(bogus, "not a database");
    const api = host({
      ...env,
      SHENRON_VFS_DB: bogus,
      SHENRON_CHAT_STORE: join(env.SHENRON_DATA_DIR, "missing", "dir", "c.sqlite"),
    });
    expect(api.groups.vfs.available).toBe(false);
    expect(api.groups.conversations).toEqual({
      available: false,
      reason: "base des conversations inaccessible",
    });
    expect(JSON.stringify(api.groups)).not.toContain(root);
  });
});

describe("assets", () => {
  test("/assets/* from the VFS; an unreachable CDN asset is a 502 without its cause", async () => {
    const api = host(baseEnv({ SHENRON_VFS_OFFLINE: "1" }), { vfsDatabase: memoryVfs() });
    const server = Bun.serve({ port: 0, hostname: "127.0.0.1", fetch: api.fetch });
    try {
      const base = `http://127.0.0.1:${server.port}`;
      expect(await (await fetch(`${base}/assets/logo.txt`)).text()).toBe("logo");
      const cdn = await fetch(`${base}/assets/planche.webp`);
      expect(cdn.status).toBe(502);
      expect(await cdn.json()).toEqual({
        error: "asset unavailable",
        code: "upstream_unavailable",
      });
      expect((await fetch(`${base}/assets/none.txt`)).status).toBe(404);
    } finally {
      void server.stop(true);
    }
  });
});

describe("usableChatBackends", () => {
  test("local only when its URL is declared; extractive when listed", () => {
    expect(usableChatBackends({ SHENRON_CHAT_BACKENDS: "local" }).map((b) => b.id)).toEqual([]);
    expect(
      usableChatBackends({
        SHENRON_CHAT_BACKENDS: "local,extractive",
        APHRODY_AI_CHAT_BASE_URL: "http://127.0.0.1:9/v1",
      }).map((b) => b.id),
    ).toEqual(["local", "extractive"]);
  });

  test("gemini-web needs its client and a cookie store", () => {
    const dir = join(root, "gemini");
    mkdirSync(join(dir, "cookies"), { recursive: true });
    const binary = join(dir, "aphrody-gemini-web");
    const env = {
      SHENRON_CHAT_BACKENDS: "gemini-web",
      APHRODY_HOME: dir,
      APHRODY_GEMINI_WEB_BIN: binary,
    };
    expect(usableChatBackends(env, dir)).toEqual([]);
    writeFileSync(binary, "");
    expect(usableChatBackends(env, dir)).toEqual([]);
    writeFileSync(join(dir, "cookies", "gemini-web.json"), "[]");
    expect(usableChatBackends(env, dir).map((b) => b.id)).toEqual(["gemini-web"]);
  });
});
