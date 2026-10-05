#!/usr/bin/env bun
// SPDX-License-Identifier: Apache-2.0
/**
 * build-vfs.ts — builds the Shenron VFS database embedded in the Shenron binaries, and its
 * generated entry module.
 *
 *   bun --env-file=$HOME/.aphrody/private/shenron/ai-http.env scripts/data/build-vfs.ts \
 *     --profile public|complet [--out DIR] [--rag-limit N] [--vectors f32|i8|none]
 *     [--skip rag,wiki,home,data,assets,cdn,conversations] [--embed-assets] [--assets-dir DIR]...
 *     [--probe-cdn N]
 *
 * Profiles:
 *   public   schema + content already public on dragonballfr.com (visible site RAG rows,
 *            visible wiki rows, public data files, agent home template, asset index); int8 vectors.
 *   complet  + private corpus (every Aphrody RAG row), the live agent home (persona, memory)
 *            and opted-in conversations; f32 vectors (aphrody-rag readable). Delivered directly,
 *            NEVER attached to a public release nor committed (default out: ~/.aphrody/private).
 *
 * Sources (read only): the Aphrody RAG store (`SHENRON_RAG_PG_URL`, else `APHRODY_MCP_DATABASE_URL`),
 * the site database (`SHENRON_WIKI_PG_URL`, else `DATABASE_URL`, `default_transaction_read_only`),
 * the corpus embedder (`APHRODY_AI_EMBED_BASE_URL`) for agent-home chunks, the conversation store
 * (`SHENRON_CHAT_STORE`). Outputs: `shenron-vfs.<profile>.sqlite`, `vfs-entry.<profile>.ts`,
 * `vfs-manifest.<profile>.json`.
 */
import { Database } from "bun:sqlite";
import { existsSync, mkdirSync, rmSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { redactText } from "../../packages/db/src/conversations/redact";
import { SqliteConversationStore } from "../../packages/db/src/conversations/sqlite";
import {
  createRagWriter,
  exportRag,
  exportWikiFromPg,
  indexTree,
  readOnlySql,
  renderEntryModule,
  type VectorMode,
} from "../../packages/db/src/vfs/build";
import {
  applyVfsSchema,
  cdnOrigins,
  createE5Embedder,
  sha256Hex,
  ShenronVfs,
} from "../../packages/db/src/vfs/index";
import { shenronRagChunk } from "../../packages/native/src/engine";

const ROOT = resolve(import.meta.dir, "../..");
const { values } = parseArgs({
  options: {
    profile: { type: "string", default: "public" },
    out: { type: "string" },
    "rag-limit": { type: "string" },
    vectors: { type: "string" },
    skip: { type: "string", default: "" },
    "embed-assets": { type: "boolean", default: false },
    "assets-dir": { type: "string", multiple: true },
    "probe-cdn": { type: "string", default: "0" },
  },
});

const profile = values.profile === "complet" ? "complet" : "public";
if (values.profile !== profile)
  throw new Error(`--profile must be public or complet, got ${values.profile}`);
const vectors = (values.vectors ?? (profile === "complet" ? "f32" : "i8")) as VectorMode;
const skip = new Set(
  values.skip
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
);
const out = resolve(
  values.out ??
    (profile === "complet"
      ? join(homedir(), ".aphrody", "private", "shenron", "vfs")
      : join(ROOT, "dist", "vfs")),
);
mkdirSync(out, { recursive: true });
const finalPath = join(out, `shenron-vfs.${profile}.sqlite`);
const tempPath = `${finalPath}.${process.pid}.tmp`;
const started = performance.now();
const report: Record<string, unknown> = { profile, vectors, startedAt: new Date().toISOString() };
const log = (event: string, data: Record<string, unknown> = {}) =>
  console.error(JSON.stringify({ event, ms: Math.round(performance.now() - started), ...data }));

const db = new Database(tempPath, { create: true });
db.exec(
  "PRAGMA journal_mode = OFF; PRAGMA synchronous = OFF; PRAGMA temp_store = MEMORY; PRAGMA cache_size = -200000;",
);
applyVfsSchema(db);
const vfs = new ShenronVfs(db, { migrate: false });
vfs.setMeta("profile", profile);
for (const dir of ["/home", "/data", "/assets", "/public", "/db"]) vfs.mkdirAll(dir);

// ── RAG corpus ──────────────────────────────────────────────────────────────
const ragUrl = process.env.SHENRON_RAG_PG_URL ?? process.env.APHRODY_MCP_DATABASE_URL;
if (!skip.has("rag")) {
  if (!ragUrl)
    throw new Error("SHENRON_RAG_PG_URL or APHRODY_MCP_DATABASE_URL is required (or --skip rag)");
  const sql = readOnlySql(ragUrl);
  const rag = await exportRag(sql, db, {
    profile,
    vectors,
    ...(values["rag-limit"] ? { limit: Number(values["rag-limit"]) } : {}),
    onProgress: (n) => n % 20_000 === 0 && log("rag.progress", { scanned: n }),
  });
  await sql.close();
  report.rag = rag;
  log("rag.done", rag);
}

// ── Wiki ────────────────────────────────────────────────────────────────────
const wikiUrl = process.env.SHENRON_WIKI_PG_URL ?? process.env.DATABASE_URL;
if (!skip.has("wiki")) {
  if (!wikiUrl) throw new Error("SHENRON_WIKI_PG_URL or DATABASE_URL is required (or --skip wiki)");
  report.wiki = await exportWikiFromPg(wikiUrl, db);
  log("wiki.done", {
    rows: Object.values(report.wiki as Record<string, number>).reduce((a, b) => a + b, 0),
  });
}

// ── Agent home ──────────────────────────────────────────────────────────────
const HOME_FILES = [
  "AGENTS.md",
  "SOUL.md",
  "IDENTITY.md",
  "BOOT.md",
  "HEARTBEAT.md",
  "USER.md",
  "TOOLS.md",
  "MEMORY.md",
];
const homeDir =
  profile === "complet"
    ? (process.env.APHRODY_WORKSPACE ??
      join(process.env.APHRODY_HOME ?? join(homedir(), ".aphrody"), "workspaces", "dbfr"))
    : join(ROOT, "agent-home");
const embedBase = process.env.APHRODY_AI_EMBED_BASE_URL;
const embedder = embedBase ? createE5Embedder({ baseUrl: embedBase }) : null;
if (!skip.has("home")) {
  const visibility = profile === "complet" ? "private" : "public";
  const docs: { path: string; title: string; text: string }[] = [];
  for (const name of HOME_FILES) {
    const file = join(homeDir, name);
    if (!existsSync(file)) continue;
    const text = await Bun.file(file).text();
    vfs.write(`/home/${name}`, text, {
      visibility: name === "SOUL.md" || name === "IDENTITY.md" ? "public" : visibility,
      mime: "text/markdown",
    });
    docs.push({ path: `shenron:home:${name}`, title: name, text });
  }
  if (profile === "complet" && existsSync(join(homeDir, "memory"))) {
    vfs.mkdirAll("/home/memory");
    for (const file of new Bun.Glob("*.md").scanSync({ cwd: join(homeDir, "memory") })) {
      const text = await Bun.file(join(homeDir, "memory", file)).text();
      vfs.write(`/home/memory/${file}`, text, { visibility: "private", mime: "text/markdown" });
      docs.push({
        path: `shenron:home:memory/${file}`,
        title: `Mémoire — ${file.replace(/\.md$/, "")}`,
        text,
      });
    }
  }
  const plugins = join(homeDir, ".agents", "plugins.json");
  if (existsSync(plugins)) {
    vfs.mkdirAll("/home/.agents");
    vfs.write("/home/.agents/plugins.json", await Bun.file(plugins).bytes(), {
      visibility: "public",
    });
  }
  // Persona and memory feed retrieval (corpus `home`), never instructions.
  const writer = createRagWriter(db, vectors);
  const pending: { row: Parameters<typeof writer.add>[0] }[] = [];
  for (const doc of docs) {
    const chunks = shenronRagChunk(doc.text, 1400, 0.15);
    chunks.forEach((chunk, index) =>
      pending.push({
        row: {
          corpus: "home",
          entity_id: `${doc.path}:${index}`,
          title: doc.title,
          url: null,
          content: chunk.section
            ? `[${doc.title} > ${chunk.section}] ${chunk.content}`
            : chunk.content,
          metadata: { kind: "home", lang: "fr", originSourceId: "agent_home" },
          updated_at: new Date().toISOString(),
          embedding: null,
          model: null,
        },
      }),
    );
  }
  let embedded = 0;
  if (embedder && vectors !== "none") {
    for (let i = 0; i < pending.length; i += 16) {
      const batch = pending.slice(i, i + 16);
      try {
        const vectorsOut = await embedder.passages(batch.map((p) => p.row.content.slice(0, 2000)));
        batch.forEach((p, j) => {
          p.row.embedding = vectorsOut[j]!;
          p.row.model = "Xenova/multilingual-e5-small";
        });
        embedded += batch.length;
      } catch (error) {
        log("home.embed_failed", { error: String(error) });
        break;
      }
    }
  }
  for (const p of pending) writer.add(p.row, visibility === "private" ? "private" : "public");
  writer.finish();
  report.home = {
    dir: profile === "complet" ? "live agent home" : "agent-home/",
    files: docs.length,
    chunks: pending.length,
    embedded,
  };
  log("home.done", report.home as Record<string, unknown>);
}

// ── Data files (tracked, public) ────────────────────────────────────────────
if (!skip.has("data")) {
  const files = [
    "data/lexique-db-canonique.json",
    "data/doc-links.json",
    ...new Bun.Glob("data/ja-identities-*.json").scanSync({ cwd: ROOT }),
    ...new Bun.Glob("data/catalogues/*.json").scanSync({ cwd: ROOT }),
  ];
  let count = 0;
  for (const rel of files) {
    const abs = join(ROOT, rel);
    if (!existsSync(abs)) continue;
    const path = `/${rel}`;
    vfs.mkdirAll(path.slice(0, path.lastIndexOf("/")));
    vfs.write(path, await Bun.file(abs).bytes(), { visibility: "public" });
    count++;
  }
  report.data = { files: count };
}

// ── Assets ──────────────────────────────────────────────────────────────────
let embeddedMap: Record<string, string> = {};
if (!skip.has("assets")) {
  const storage = values["embed-assets"] ? "embedded" : "cdn";
  const trees = values["assets-dir"]?.length
    ? values["assets-dir"].map((dir) => ({ dir: resolve(dir), prefix: "/assets" }))
    : [
        { dir: join(ROOT, "apps/bot/assets"), prefix: "/assets" },
        { dir: join(ROOT, "apps/site/public"), prefix: "/public" },
      ];
  const assets: Record<string, unknown>[] = [];
  for (const tree of trees) {
    if (!existsSync(tree.dir)) continue;
    const result = await indexTree(vfs, tree.dir, {
      prefix: tree.prefix,
      storage,
      visibility: "public",
    });
    embeddedMap = { ...embeddedMap, ...result.embedded };
    assets.push({
      dir: tree.dir.replace(ROOT, "."),
      prefix: tree.prefix,
      files: result.files,
      bytes: result.bytes,
      storage,
    });
  }
  report.assets = assets;
  log("assets.done", { trees: assets.length, embedded: Object.keys(embeddedMap).length });
}

// ── CDN-only assets (index from the site database) ──────────────────────────
if (!skip.has("cdn") && wikiUrl) {
  const sql = readOnlySql(wikiUrl);
  const dbAssets =
    (await sql`SELECT path, sha256, mime_type, bytes FROM bot.db_assets ORDER BY id`) as {
      path: string;
      sha256: string | null;
      mime_type: string | null;
      bytes: string | number | null;
    }[];
  let indexed = 0;
  let bytes = 0;
  for (const asset of dbAssets) {
    const rel = asset.path.replace(/^\.?\/*/, "");
    if (!rel || rel.includes("..")) continue;
    const path = `/db/${rel}`;
    if (vfs.exists(path)) continue;
    vfs.index(path, {
      storage: "cdn",
      size: Number(asset.bytes ?? 0),
      sha256: asset.sha256,
      mime: asset.mime_type,
      visibility: "public",
    });
    indexed++;
    bytes += Number(asset.bytes ?? 0);
  }
  const pages = (await sql`SELECT uri, sha256 FROM bot.media_page_assets ORDER BY id`) as {
    uri: string;
    sha256: string | null;
  }[];
  await sql.close();
  // Sizes of the manga pages come from the CDN (HEAD, bounded concurrency) when asked.
  const probe = Math.max(0, Number(values["probe-cdn"]) || 0);
  const origin = cdnOrigins(process.env)[0]!;
  const sizes = new Map<string, number>();
  const toProbe = pages.slice(0, probe);
  let probed = 0;
  let missing = 0;
  for (let i = 0; i < toProbe.length; i += 16) {
    await Promise.all(
      toProbe.slice(i, i + 16).map(async (page) => {
        const rel = page.uri.replace(/^\.?\/*/, "");
        try {
          const response = await fetch(
            `${origin}/${rel.split("/").map(encodeURIComponent).join("/")}`,
            { method: "HEAD", signal: AbortSignal.timeout(15_000) },
          );
          if (response.ok) sizes.set(rel, Number(response.headers.get("content-length") ?? 0));
          else missing++;
          probed++;
        } catch {
          missing++;
        }
      }),
    );
  }
  let pageCount = 0;
  for (const page of pages) {
    const rel = page.uri.replace(/^\.?\/*/, "");
    if (!rel.startsWith("assets/") || rel.includes("..")) continue;
    const path = `/${rel}`;
    if (vfs.exists(path)) continue;
    // media_page_assets.sha256 hashes the source scan, not always the served file: keep it as metadata only.
    vfs.index(path, {
      storage: "cdn",
      size: sizes.get(rel) ?? 0,
      sha256: null,
      visibility: "public",
    });
    pageCount++;
  }
  report.cdn = {
    dbAssets: indexed,
    dbAssetBytes: bytes,
    mangaPages: pageCount,
    probed,
    probedMissing: missing,
    origin,
  };
  log("cdn.done", report.cdn as Record<string, unknown>);
}

// ── Opted-in conversations (complet only) ───────────────────────────────────
if (!skip.has("conversations") && profile === "complet") {
  const storePath =
    process.env.SHENRON_CHAT_STORE ??
    join(
      process.env.XDG_DATA_HOME ?? join(homedir(), ".local", "share"),
      "shenron",
      "conversations.sqlite",
    );
  let turns = 0;
  if (existsSync(storePath)) {
    const store = new SqliteConversationStore(storePath);
    const writer = createRagWriter(db, "none");
    let cursor: string | null = null;
    while (true) {
      const page = await store.optedIn("rag", cursor, 200);
      if (page.items.length === 0) break;
      for (const { conversation, messages } of page.items) {
        const pairs: string[] = [];
        for (let i = 0; i + 1 < messages.length; i++) {
          if (messages[i]!.role === "user" && messages[i + 1]!.role === "assistant")
            pairs.push(
              `Q : ${redactText(messages[i]!.content)}\nR : ${redactText(messages[i + 1]!.content)}`,
            );
        }
        pairs.forEach((text, index) => {
          writer.add(
            {
              corpus: "conversations",
              entity_id: `shenron:conversation:${sha256Hex(conversation.id).slice(0, 24)}:${index}`,
              title: conversation.title ? redactText(conversation.title) : "Conversation",
              url: null,
              content: text,
              metadata: { kind: "conversation", lang: "fr", originSourceId: "conversations" },
              updated_at: conversation.updatedAt,
              embedding: null,
              model: null,
            },
            "private",
          );
          turns++;
        });
      }
      cursor = page.cursor;
    }
    writer.finish();
    store.db.close();
  }
  report.conversations = { turns, store: existsSync(storePath) };
}

// ── Finish: metadata, compaction, entry module, manifest ────────────────────
vfs.setMeta("generated_at", new Date().toISOString());
vfs.setMeta("sources", JSON.stringify(report));
db.exec("ANALYZE;");
db.close();
rmSync(finalPath, { force: true });
const compact = new Database(tempPath);
compact.exec(`VACUUM INTO '${finalPath.replaceAll("'", "''")}'`);
compact.close();
rmSync(tempPath, { force: true });

const entryPath = join(out, `vfs-entry.${profile}.ts`);
await Bun.write(
  entryPath,
  renderEntryModule({
    database: finalPath,
    embedded: embeddedMap,
    vfsModule: join(ROOT, "packages/db/src/vfs/index.ts"),
  }),
);
const bytes = statSync(finalPath).size;
const manifest = {
  profile,
  database: finalPath,
  entry: entryPath,
  bytes,
  sha256: sha256Hex(await Bun.file(finalPath).bytes()),
  embeddedFiles: Object.keys(embeddedMap).length,
  embeddedBytes: Object.values(embeddedMap).reduce((sum, file) => sum + statSync(file).size, 0),
  ms: Math.round(performance.now() - started),
  report,
};
await Bun.write(
  join(out, `vfs-manifest.${profile}.json`),
  `${JSON.stringify(manifest, null, 2)}\n`,
);
console.log(JSON.stringify({ ...manifest, report: undefined }, null, 2));
