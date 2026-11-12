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
import { createRagWriter } from "@aphrody/shenron-db/vfs/build";
import type { RagSearchQuery } from "../src/contract/schemas";
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

describe("public RAG boundary", () => {
  test("search and context exclude private rows and agent-home templates on a full-profile host", async () => {
    const db = memoryVfs();
    const writer = createRagWriter(db, "none");
    for (const row of [
      { id: "home", source: "agent_home", kind: "home", visibility: "public", url: null },
      {
        id: "private",
        source: "db_characters",
        kind: "wiki",
        visibility: "private",
        url: "https://dragonballfr.com/wiki/characters/private",
      },
      {
        id: "external",
        source: "db_characters",
        kind: "wiki",
        visibility: "public",
        url: "https://gemini.google.com/wiki/characters/goku",
      },
      {
        id: "conversation",
        source: "conversations",
        kind: "conversation",
        visibility: "public",
        url: "https://dragonballfr.com/conversations/1",
      },
      {
        id: "public",
        source: "db_characters",
        kind: "wiki",
        visibility: "public",
        url: "https://dragonballfr.com/wiki/characters/goku",
      },
      {
        id: "manga",
        source: "manga",
        kind: "manga",
        visibility: "public",
        url: "https://dragonballfr.com/wiki/manga/1",
      },
      {
        id: "databook",
        source: "databooks",
        kind: "databook",
        visibility: "public",
        url: "https://dragonballfr.com/wiki/databooks/1",
      },
      {
        id: "wiki",
        source: "wiki_pages",
        kind: "wiki",
        visibility: "public",
        url: "https://dragonballfr.com/wiki/goku",
      },
    ] as const) {
      writer.add(
        {
          corpus: row.kind === "home" ? "home" : "shenron",
          entity_id: row.id + ":0",
          title: row.id,
          url: row.url,
          content: "Goku Saiyan " + row.id,
          metadata: { kind: row.kind, originSourceId: row.source, lang: "fr" },
          updated_at: null,
          embedding: null,
          model: null,
        },
        row.visibility,
      );
    }
    writer.finish();
    const api = host(baseEnv({ SHENRON_PROFILE: "complet" }), { vfsDatabase: db });
    const server = Bun.serve({ port: 0, hostname: "127.0.0.1", fetch: api.fetch });
    try {
      const search = await (
        await fetch(new URL("/api/public/rag/search?q=Goku&limit=1", server.url))
      ).json();
      expect(search.results.map((hit: { title: string }) => hit.title)).toEqual(["public"]);
      const context = await (
        await fetch(new URL("/api/public/rag/context?q=Goku", server.url))
      ).json();
      expect(new Set(context.sources.map((hit: { title: string }) => hit.title))).toEqual(
        new Set(["public", "manga", "databook", "wiki"]),
      );
      expect(context.context).not.toContain("private");
      const homes = await (
        await fetch(new URL("/api/public/rag/search?q=Goku&kind=home", server.url))
      ).json();
      expect(homes.results).toEqual([]);
      for (const [sourceId, title] of [
        ["manga", "manga"],
        ["databooks", "databook"],
        ["wiki_pages", "wiki"],
      ]) {
        const url = new URL("/api/public/rag/search?q=Goku&limit=1", server.url);
        url.searchParams.set("sourceId", sourceId!);
        const body = await (await fetch(url)).json();
        expect(body.results.map((hit: { title: string }) => hit.title)).toEqual([title]);
      }
      for (const filter of [
        "sourceId=agent_home",
        "sourceId=conversations",
        "kind=home&visibility=private",
      ]) {
        const body = await (
          await fetch(new URL("/api/public/rag/search?q=Goku&" + filter, server.url))
        ).json();
        expect(body.results ?? []).toEqual([]);
        expect(JSON.stringify(body)).not.toContain("Goku Saiyan private");
      }
    } finally {
      await server.stop(true);
    }
  });
});

describe("live editorial RAG routing", () => {
  test("search, context and chat use the injected current index without a VFS", async () => {
    const calls: { sourceId?: string; lang?: string }[] = [];
    const api = host(baseEnv({ RAG_BACKEND: "aphrody", SHENRON_CHAT_BACKENDS: "extractive" }), {
      rag: {
        async search(query: RagSearchQuery) {
          calls.push(query);
          return {
            mode: "hybrid",
            hits: [
              {
                rowid: 1,
                title: "Home",
                url: "",
                kind: "home",
                sourceId: "agent_home",
                snippet: "private instructions",
                score: 1,
              },
              {
                rowid: 2,
                title: "Manga current",
                url: "https://dragonballfr.com/wiki/manga/1",
                kind: "manga",
                sourceId: "manga",
                snippet: "Current manga",
                content: "Current manga full passage",
                lang: "fr",
                score: 0.9,
              },
              {
                rowid: 3,
                title: "Databook current",
                url: "https://dragonballfr.com/wiki/databooks/1",
                kind: "databook",
                sourceId: "databooks",
                snippet: "Current databook",
                content: "Current databook full passage",
                lang: "fr",
                score: 0.8,
              },
            ].filter((hit) => !query.sourceId || hit.sourceId === query.sourceId),
          };
        },
      },
    });
    expect(api.groups.rag.available).toBe(true);
    expect(api.groups.vfs.available).toBe(false);
    const server = Bun.serve({ port: 0, hostname: "127.0.0.1", fetch: api.fetch });
    try {
      const search = await (
        await fetch(new URL("/api/public/rag/search?q=Goku&lang=fr&sourceId=manga", server.url))
      ).json();
      expect(search.mode).toBe("hybrid");
      expect(search.results.map((item: { title: string }) => item.title)).toEqual([
        "Manga current",
      ]);
      expect(calls[0]!.sourceId).toBe("manga");
      expect(calls[0]!.lang).toBe("fr");
      const context = await (
        await fetch(new URL("/api/public/rag/context?q=Goku", server.url))
      ).json();
      expect(context.context).toContain("Current manga full passage");
      expect(context.context).toContain("Current databook full passage");
      expect(context.context).not.toContain("private instructions");
      const chat = await fetch(new URL("/api/v1/chat", server.url), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message: "Qui est Goku ?", stream: false, tools: false }),
      });
      expect(chat.status).toBe(200);
      const answer = await chat.json();
      expect(answer.done.citations.map((citation: { title: string }) => citation.title)).toEqual([
        "Manga current",
        "Databook current",
      ]);
      expect(JSON.stringify(answer)).not.toContain("private instructions");
    } finally {
      await server.stop(true);
    }
  });

  test("an unavailable explicit live index never falls back to a stale VFS", async () => {
    const api = host(baseEnv({ RAG_BACKEND: "aphrody" }), {
      rag: {
        search: async () => {
          throw new Error("unavailable");
        },
      },
      vfsDatabase: memoryVfs(),
    });
    const server = Bun.serve({ port: 0, hostname: "127.0.0.1", fetch: api.fetch });
    try {
      expect((await fetch(new URL("/api/public/rag/search?q=Goku", server.url))).status).toBe(503);
    } finally {
      await server.stop(true);
    }
    const invalid = host(baseEnv({ RAG_BACKEND: "aphrody" }), { vfsDatabase: memoryVfs() });
    expect(invalid.groups.rag.available).toBe(false);
    expect(invalid.handles("/api/public/rag/search")).toBe(false);
  });
});
