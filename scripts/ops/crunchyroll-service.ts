#!/usr/bin/env bun
// SPDX-License-Identifier: Apache-2.0
/**
 * crunchyroll-service: the always-on Crunchyroll layer of Shenron (crawler, indexer, API, resolver).
 *
 *   bun scripts/ops/crunchyroll-service.ts [--port 9120] [--home ~/apps/shenron-crunchyroll] [--interval 900]
 *
 * - Crawler: every --interval seconds it reads the Crunchyroll offers Shenron stores on its episodes (the public
 *   /api/crunchyroll layer of the site) and, when Crunchyroll credentials are configured, runs crunchyroll-sync.ts
 *   to refresh them from the provider first. A failed pass is logged and retried at the next tick.
 * - Indexer: offers go into a SQLite index (WAL) with a full-text table over series, number and title.
 * - API (127.0.0.1): GET /health, /v1/series, /v1/series/<SERIES>, /v1/search?q=, /v1/resolve?episode=|series=&number=|crunchyroll=
 *   and POST /v1/sync (Bearer SHENRON_ADMIN_TOKEN) to force a pass.
 * - Resolver: /v1/resolve answers from the index, so it keeps working while the site or the provider is down.
 */
import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { CRUNCHYROLL_SERIES_BY_SHENRON } from "../../packages/media/src/crunchyroll-mapping";

const arg = (name: string, fallback: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1]! : fallback;
};
const port = Number(arg("port", "9120"));
const home = resolve(arg("home", join(homedir(), "apps", "shenron-crunchyroll")));
const interval = Number(arg("interval", "900")) * 1000;
const SITE = process.env.SHENRON_SITE_URL ?? "https://dragonballfr.com";
mkdirSync(home, { recursive: true });

export function openIndex(path: string): Database {
  const db = new Database(path);
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=15000;
    CREATE TABLE IF NOT EXISTS offers(episode_id INTEGER PRIMARY KEY, series TEXT NOT NULL, number INTEGER, title TEXT NOT NULL,
      crunchyroll_id TEXT NOT NULL, url TEXT NOT NULL, langs TEXT NOT NULL, checked_at INTEGER, seen_at INTEGER NOT NULL);
    CREATE UNIQUE INDEX IF NOT EXISTS offers_cr ON offers(crunchyroll_id);
    CREATE VIRTUAL TABLE IF NOT EXISTS offers_fts USING fts5(series, number, title, tokenize='unicode61 remove_diacritics 2');
    CREATE TABLE IF NOT EXISTS passes(at INTEGER, ok INTEGER, detail TEXT);`);
  return db;
}

interface Offer {
  episodeId: number;
  series: string;
  number: number | null;
  title: string;
  crunchyrollId: string;
  url: string;
  langs: string[];
  checkedAt: number | null;
}

export function indexOffers(db: Database, offers: Offer[], now = Math.floor(Date.now() / 1000)) {
  const upsert =
    db.prepare(`INSERT INTO offers(episode_id, series, number, title, crunchyroll_id, url, langs, checked_at, seen_at)
    VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9) ON CONFLICT(episode_id) DO UPDATE SET series=?2, number=?3, title=?4, crunchyroll_id=?5, url=?6, langs=?7, checked_at=?8, seen_at=?9`);
  db.transaction(() => {
    for (const o of offers)
      upsert.run(
        o.episodeId,
        o.series,
        o.number,
        o.title,
        o.crunchyrollId,
        o.url,
        JSON.stringify(o.langs),
        o.checkedAt,
        now,
      );
    db.exec("DELETE FROM offers_fts");
    db.exec(
      "INSERT INTO offers_fts(rowid, series, number, title) SELECT episode_id, series, coalesce(number,''), title FROM offers",
    );
  })();
  return offers.length;
}

const rowOut = (r: any) => ({
  episodeId: r.episode_id,
  series: r.series,
  number: r.number,
  title: r.title,
  crunchyrollId: r.crunchyroll_id,
  url: r.url,
  langs: JSON.parse(r.langs),
  checkedAt: r.checked_at,
});

let running: Promise<{ ok: boolean; detail: string }> | undefined;
async function pass(db: Database) {
  return (running ??= (async () => {
    try {
      // With provider credentials, refresh the stored offers from Crunchyroll first (a no-op otherwise).
      const sync = Bun.spawn(
        [process.execPath, join(import.meta.dir, "crunchyroll-sync.ts"), "--apply"],
        { stdout: "pipe", stderr: "pipe" },
      );
      const syncOut = (await new Response(sync.stdout).text()).trim().split("\n").at(-1) ?? "";
      await sync.exited;
      let total = 0;
      for (const series of Object.keys(CRUNCHYROLL_SERIES_BY_SHENRON)) {
        const response = await fetch(`${SITE}/api/crunchyroll/series/${series}`, {
          signal: AbortSignal.timeout(30_000),
        });
        if (!response.ok) throw new Error(`${series}: HTTP ${response.status}`);
        total += indexOffers(db, ((await response.json()) as { offers: Offer[] }).offers);
      }
      const detail = `indexed ${total} offers; sync: ${syncOut.slice(0, 160)}`;
      db.prepare("INSERT INTO passes VALUES (?1, 1, ?2)").run(Date.now(), detail);
      return { ok: true, detail };
    } catch (error) {
      const detail = String((error as Error).message).slice(0, 200);
      db.prepare("INSERT INTO passes VALUES (?1, 0, ?2)").run(Date.now(), detail);
      console.error(JSON.stringify({ pass: "failed", detail }));
      return { ok: false, detail };
    } finally {
      running = undefined;
    }
  })());
}

export function createApi(
  db: Database,
  options: { adminToken?: string; sync?: () => Promise<{ ok: boolean; detail: string }> } = {},
) {
  const json = (body: unknown, status = 200) =>
    Response.json(body, {
      status,
      headers: {
        "access-control-allow-origin": "*",
        "cache-control": status === 200 ? "public, max-age=60" : "no-store",
      },
    });
  return async (request: Request): Promise<Response> => {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, "") || "/";
    if (request.method === "POST" && path === "/v1/sync") {
      const given = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
      if (!options.adminToken || given !== options.adminToken)
        return json({ error: "unauthorized" }, 401);
      return json(await (options.sync?.() ?? { ok: false, detail: "sync unavailable" }));
    }
    if (request.method !== "GET") return json({ error: "method_not_allowed" }, 405);
    if (path === "/health") {
      const last = db
        .query("SELECT at, ok, detail FROM passes ORDER BY at DESC LIMIT 1")
        .get() as any;
      const count = (db.query("SELECT count(*) n FROM offers").get() as { n: number }).n;
      return json(
        { status: last?.ok === 0 ? "degraded" : "ok", offers: count, lastPass: last ?? null },
        200,
      );
    }
    if (path === "/v1/series")
      return json({
        series: Object.entries(CRUNCHYROLL_SERIES_BY_SHENRON).map(([series, crunchyroll]) => ({
          series,
          crunchyroll,
          offers: (
            db.query("SELECT count(*) n FROM offers WHERE series=?1").get(series) as { n: number }
          ).n,
        })),
      });
    const series = /^\/v1\/series\/([A-Z0-9_]+)$/.exec(path)?.[1];
    if (series)
      return json({
        series,
        crunchyroll: CRUNCHYROLL_SERIES_BY_SHENRON[series] ?? null,
        offers: db
          .query("SELECT * FROM offers WHERE series=?1 ORDER BY number")
          .all(series)
          .map(rowOut),
      });
    if (path === "/v1/search") {
      const q = (url.searchParams.get("q") ?? "").replace(/[^\p{L}\p{N} _-]/gu, " ").trim();
      if (!q) return json({ error: "q is required" }, 400);
      const match = q
        .split(/\s+/)
        .map((word) => `"${word}"*`)
        .join(" ");
      return json({
        q,
        results: db
          .query(
            "SELECT o.* FROM offers_fts f JOIN offers o ON o.episode_id=f.rowid WHERE offers_fts MATCH ?1 ORDER BY rank LIMIT 50",
          )
          .all(match)
          .map(rowOut),
      });
    }
    if (path === "/v1/resolve") {
      const p = url.searchParams;
      const row = p.get("episode")
        ? db.query("SELECT * FROM offers WHERE episode_id=?1").get(Number(p.get("episode")))
        : p.get("series") && p.get("number")
          ? db
              .query("SELECT * FROM offers WHERE series=?1 AND number=?2")
              .get(p.get("series")!.toUpperCase(), Number(p.get("number")))
          : p.get("crunchyroll")
            ? db.query("SELECT * FROM offers WHERE crunchyroll_id=?1").get(p.get("crunchyroll")!)
            : undefined;
      return row ? json(rowOut(row)) : json({ error: "no_crunchyroll_offer" }, 404);
    }
    return json({ error: "not_found" }, 404);
  };
}

if (import.meta.main) {
  const db = openIndex(join(home, "index.sqlite"));
  const handler = createApi(db, {
    adminToken: process.env.SHENRON_ADMIN_TOKEN,
    sync: () => pass(db),
  });
  const server = Bun.serve({ hostname: "127.0.0.1", port, fetch: handler });
  console.log(JSON.stringify({ listening: server.url.href, home, interval: interval / 1000 }));
  await pass(db);
  setInterval(() => void pass(db), interval);
}
