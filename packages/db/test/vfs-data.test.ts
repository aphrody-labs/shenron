/* oxlint-disable eslint/no-shadow -- behavior-preserving legacy pattern, reviewed */
// SPDX-License-Identifier: Apache-2.0
import { Database } from "bun:sqlite";
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  assembleContext,
  CdnFetcher,
  createE5Embedder,
  encodeF32,
  ftsQuery,
  normalizeVector,
  openShenronVfs,
  quantizeI8,
  sha256Hex,
  ShenronVfs,
  VfsError,
  VfsRag,
  writeWikiRows,
} from "../src/vfs";

const dir = mkdtempSync(join(tmpdir(), "shenron-vfs-"));
let origin: ReturnType<typeof Bun.serve>;
let mirror: ReturnType<typeof Bun.serve>;
const hits: string[] = [];
const asset = new TextEncoder().encode("planche 003");

beforeAll(() => {
  origin = Bun.serve({
    port: 0,
    fetch(request) {
      hits.push(`origin ${new URL(request.url).pathname}`);
      return new Response("down", { status: 503 });
    },
  });
  mirror = Bun.serve({
    port: 0,
    fetch(request) {
      const path = decodeURIComponent(new URL(request.url).pathname);
      hits.push(`mirror ${path}`);
      if (path === "/assets/manga/DB/vol1/003.webp") return new Response(asset);
      if (path === "/assets/tampered.webp") return new Response("tampered");
      return new Response("missing", { status: 404 });
    },
  });
});

afterAll(() => {
  origin.stop(true);
  mirror.stop(true);
  rmSync(dir, { recursive: true, force: true });
});

describe("storage kinds", () => {
  test("CDN nodes are fetched lazily from the first healthy mirror and cached by sha256", async () => {
    const cacheDir = join(dir, "cache");
    const vfs = new ShenronVfs(new Database(":memory:"), {
      cdn: {
        origins: [`http://127.0.0.1:${origin.port}`, `http://127.0.0.1:${mirror.port}`],
        cacheDir,
      },
    });
    vfs.index("/assets/manga/DB/vol1/003.webp", {
      storage: "cdn",
      size: asset.byteLength,
      sha256: sha256Hex(asset),
    });
    expect(vfs.stat("/assets/manga/DB/vol1/003.webp").storage).toBe("cdn");
    expect(vfs.readDir("/assets/manga/DB").map((e) => e.name)).toEqual(["vol1"]);
    expect(new TextDecoder().decode(await vfs.read("/assets/manga/DB/vol1/003.webp"))).toBe(
      "planche 003",
    );
    expect(hits).toEqual([
      "origin /assets/manga/DB/vol1/003.webp",
      "mirror /assets/manga/DB/vol1/003.webp",
    ]);
    // Second read: content-addressed cache, no network.
    hits.length = 0;
    const offline = new ShenronVfs(vfs.db, {
      readOnly: true,
      cdn: { origins: [], cacheDir, offline: true },
    });
    expect(new TextDecoder().decode(await offline.read("/assets/manga/DB/vol1/003.webp"))).toBe(
      "planche 003",
    );
    expect(hits).toEqual([]);
    expect(offline.cdn?.counters.cacheHits).toBe(1);
  });

  test("an integrity mismatch is rejected and reported", async () => {
    const vfs = new ShenronVfs(new Database(":memory:"), {
      cdn: { origins: [`http://127.0.0.1:${mirror.port}`] },
    });
    vfs.index("/assets/tampered.webp", { storage: "cdn", size: 8, sha256: sha256Hex("genuine") });
    await expect(vfs.read("/assets/tampered.webp")).rejects.toThrow("sha256 mismatch");
    vfs.index("/assets/none.webp", { storage: "cdn", size: 1 });
    await expect(vfs.read("/assets/none.webp")).rejects.toThrow("404");
    expect(() => vfs.readSync("/assets/none.webp")).toThrow(VfsError);
  });

  test("embedded nodes read through the build's embedded file map", async () => {
    const file = join(dir, "logo.png");
    writeFileSync(file, "PNG");
    const db = new Database(":memory:");
    new ShenronVfs(db).index("/assets/logo.png", {
      storage: "embedded",
      size: 3,
      sha256: sha256Hex("PNG"),
    });
    const vfs = new ShenronVfs(db, { readOnly: true, embedded: { "/assets/logo.png": file } });
    expect(new TextDecoder().decode(await vfs.read("/assets/logo.png"))).toBe("PNG");
    expect(new TextDecoder().decode(vfs.readSync("/assets/logo.png"))).toBe("PNG");
    expect(() => new ShenronVfs(db, { readOnly: true }).readSync("/assets/logo.png")).toThrow(
      "not embedded",
    );
  });

  test("query() is read-only and single-statement", () => {
    const vfs = new ShenronVfs(new Database(":memory:"));
    vfs.mkdirAll("/home");
    vfs.write("/home/SOUL.md", "---\ntone: solennel\n---\n");
    expect(
      vfs.query<{ n: number }>("SELECT COUNT(*) AS n FROM vfs_nodes WHERE kind = 'file'")[0]?.n,
    ).toBe(1);
    expect(() => vfs.query("DELETE FROM vfs_nodes")).toThrow();
    expect(() => vfs.query("SELECT 1; DELETE FROM vfs_nodes")).toThrow("one statement");
    expect(vfs.exists("/home/SOUL.md")).toBe(true);
    // The connection is writable again after a rejected query.
    vfs.write("/home/IDENTITY.md", "x");
    expect(vfs.stats().files).toBe(2);
  });
});

function seedRag(db: Database): void {
  const docs = [
    [
      "shenron:pg:db_characters:goku",
      "Son Goku",
      "character",
      "https://dragonballfr.com/wiki/personnages/1",
      "Son Goku est un Saiyan élevé sur Terre par Son Gohan. Il maîtrise le Kamehameha.",
    ],
    [
      "shenron:pg:db_characters:vegeta",
      "Vegeta",
      "character",
      "https://dragonballfr.com/wiki/personnages/2",
      "Vegeta est le prince des Saiyans, rival de Goku.",
    ],
    [
      "shenron:pg:db_techniques:kamehameha",
      "Kamehameha",
      "technique",
      "https://dragonballfr.com/wiki/techniques/kamehameha",
      "Le Kamehameha est la technique de Kame Sennin, apprise par Goku.",
    ],
    [
      "shenron:home:SOUL.md",
      "SOUL.md",
      "home",
      null,
      "Shenron répond avec solennité et cite le canon.",
    ],
  ] as const;
  const insertDoc = db.query(
    "INSERT INTO docs (path, hash, title, language, mtime_ms, size_bytes) VALUES (?, ?, ?, 'fr', 0, ?) RETURNING id",
  );
  const insertChunk = db.query(
    "INSERT INTO chunks (doc_id, chunk_index, heading, content, start_line, end_line, token_count) VALUES (?, 0, ?, ?, 1, 1, 10) RETURNING id",
  );
  const insertAttr = db.query(
    "INSERT INTO rag_doc_attrs (doc_id, corpus, kind, url, entity_id, visibility) VALUES (?, ?, ?, ?, ?, ?)",
  );
  const insertVec = db.query(
    "INSERT INTO vectors (chunk_id, model_id, dim, quant, embedding) VALUES (?, ?, 384, 'f32', ?)",
  );
  docs.forEach(([path, title, kind, url, content], i) => {
    const doc = insertDoc.get(path, sha256Hex(content), title, content.length) as { id: number };
    const chunk = insertChunk.get(doc.id, title, content) as { id: number };
    insertAttr.run(
      doc.id,
      kind === "home" ? "home" : "shenron",
      kind,
      url,
      path,
      kind === "home" ? "private" : "public",
    );
    const v = new Float32Array(384);
    v[i] = 1;
    v[383] = 0.1;
    insertVec.run(chunk.id, "Xenova/multilingual-e5-small", encodeF32(normalizeVector(v)));
  });
}

describe("RAG over the aphrody-rag store", () => {
  test("FTS query drops stopwords and quotes terms", () => {
    expect(ftsQuery("Qui est le père de Son Gohan ?")).toBe('"père" OR "son" OR "gohan"');
    expect(ftsQuery("le la les")).toBeNull();
  });

  test("int8 quantisation matches aphrody-rag-core (scale = max|v| / 127)", () => {
    const { codes, scale } = quantizeI8(Float32Array.from([0.5, -1, 0.25]));
    expect(scale).toBeCloseTo(1 / 127, 8);
    expect([...codes]).toEqual([64, -127, 32]);
  });

  test("lexical, vector and hybrid ranking with filters", () => {
    const { vfs, rag } = openShenronVfs(new Database(":memory:"), {});
    seedRag(vfs.db);
    const lexical = rag.search("Kamehameha de Goku", { limit: 3 });
    expect(lexical.map((h) => h.title)).toContain("Kamehameha");
    expect(lexical.every((h) => h.vectorRank === null)).toBe(true);

    const query = new Float32Array(384);
    query[1] = 1; // Vegeta's direction
    const hybrid = rag.search("prince des Saiyans", { limit: 2, embedding: query });
    expect(hybrid[0]?.title).toBe("Vegeta");
    expect(hybrid[0]?.vectorRank).toBe(1);
    expect(hybrid[0]?.similarity).toBeGreaterThan(0.9);

    const home = new Float32Array(384);
    home[3] = 1;
    expect(
      rag
        .search("Shenron canon", { embedding: home, publicOnly: true })
        .some((h) => h.kind === "home"),
    ).toBe(false);
    expect(rag.search("Shenron canon", { embedding: home })[0]?.kind).toBe("home");
    expect(rag.search("Goku", { kinds: ["technique"] }).map((h) => h.kind)).toEqual(["technique"]);
    const stats = rag.stats();
    expect(stats).toMatchObject({ docs: 4, chunks: 4, vectorsF32: 4, vectorsI8: 0 });
    expect(stats.kinds.character).toBe(2);
  });

  test("int8 table is preferred when present", () => {
    const db = new Database(":memory:");
    const { vfs } = openShenronVfs(db, {});
    seedRag(vfs.db);
    for (const row of db.query("SELECT chunk_id, embedding FROM vectors").all() as {
      chunk_id: number;
      embedding: Uint8Array;
    }[]) {
      const v = new Float32Array(row.embedding.slice().buffer);
      const q = quantizeI8(v);
      db.query(
        "INSERT INTO vectors_i8 (chunk_id, model_id, dim, scale, codes) VALUES (?, ?, 384, ?, ?)",
      ).run(row.chunk_id, "Xenova/multilingual-e5-small", q.scale, new Uint8Array(q.codes.buffer));
    }
    db.exec("DELETE FROM vectors");
    const query = new Float32Array(384);
    query[0] = 1;
    const hit = new VfsRag(db).search("Saiyan", { embedding: query })[0];
    expect(hit?.title).toBe("Son Goku");
  });

  test("context assembly numbers citations within the budget", () => {
    const { vfs, rag } = openShenronVfs(new Database(":memory:"), {});
    seedRag(vfs.db);
    const hits = rag.search("Goku Saiyan Kamehameha", { limit: 3 });
    const { context, cited } = assembleContext(hits, 400);
    expect(context.startsWith("[1] ")).toBe(true);
    expect(cited.length).toBeGreaterThan(0);
    expect(context).toContain(cited[0]!.title);
  });

  test("E5 embedder applies the space prefixes and normalises", async () => {
    const seen: unknown[] = [];
    const server = Bun.serve({
      port: 0,
      async fetch(request) {
        const body = (await request.json()) as { model: string; input: string[] };
        seen.push(body);
        return Response.json({
          data: body.input.map((_, index) => ({
            index,
            embedding: Array.from({ length: 384 }, (_, i) => (i === 0 ? 3 : 0)),
          })),
        });
      },
    });
    try {
      const embedder = createE5Embedder({ baseUrl: `http://127.0.0.1:${server.port}/v1` });
      const q = await embedder.query("Goku");
      expect(q[0]).toBeCloseTo(1, 6);
      await embedder.passages(["a", "b"]);
      expect(seen).toEqual([
        { model: "Xenova/multilingual-e5-small", input: ["query: Goku"] },
        { model: "Xenova/multilingual-e5-small", input: ["passage: a", "passage: b"] },
      ]);
    } finally {
      server.stop(true);
    }
  });
});

describe("wiki read port", () => {
  test("list, search and get by id or slug, totals per category", async () => {
    const { vfs, wiki } = openShenronVfs(new Database(":memory:"), {});
    writeWikiRows(vfs.db, [
      {
        category: "characters",
        id: 1,
        slug: null,
        search: "son goku 孫悟空",
        data: { id: 1, name: "Son Goku" },
      },
      {
        category: "characters",
        id: 2,
        slug: null,
        search: "vegeta",
        data: { id: 2, name: "Vegeta" },
      },
      {
        category: "techniques",
        id: 7,
        slug: "kamehameha",
        search: "kamehameha",
        data: { id: 7, name: "Kamehameha" },
      },
    ]);
    const categories = await wiki.categories();
    expect(categories.find((c) => c.name === "characters")?.total).toBe(2);
    expect(categories.find((c) => c.name === "planets")?.total).toBe(0);
    expect(await wiki.list({ category: "characters", limit: 10, offset: 0, q: "GOKU" })).toEqual({
      items: [{ id: 1, name: "Son Goku" }],
      total: 1,
    });
    expect(await wiki.get({ category: "techniques", idOrSlug: "kamehameha" })).toEqual({
      id: 7,
      name: "Kamehameha",
    });
    expect(await wiki.get({ category: "characters", idOrSlug: "2" })).toEqual({
      id: 2,
      name: "Vegeta",
    });
    expect(await wiki.get({ category: "characters", idOrSlug: "nope" })).toBeNull();
  });
});

describe("CdnFetcher", () => {
  test("offline without cache fails with a clear error", async () => {
    const fetcher = new CdnFetcher({ origins: ["http://127.0.0.1:9"], offline: true });
    await expect(
      fetcher.get({ path: "/x", sha256: null, size: 1, sourceUrl: null }),
    ).rejects.toThrow("offline and not cached");
  });
});
