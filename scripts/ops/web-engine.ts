#!/usr/bin/env bun
// SPDX-License-Identifier: Apache-2.0
/**
 * web-engine: one concurrent crawler, indexer and publisher for Shenron and the Dragon Ball sources.
 *
 *   bun scripts/ops/web-engine.ts run --seed https://dragonballfr.com --seed <url> [--home DIR]
 *       [--workers 24] [--per-host 4] [--delay 100] [--max-pages 0] [--max-depth 8]
 *       [--tiers fetch,lightpanda,obscura,webview] [--allow-host h1,h2] [--publish] [--sitemap]
 *   bun scripts/ops/web-engine.ts publish [--home DIR] [--limit 0]
 *   bun scripts/ops/web-engine.ts stats [--home DIR]
 *
 * robots.txt is never read. Every URL runs through a tier ladder: plain fetch first, then Lightpanda, Obscura
 * and Bun.WebView (Chrome). A tier is skipped for the URL when it errors, times out or returns a challenge page;
 * a URL that fails every tier is recorded as `skipped` and the run goes on. Challenge pages are not solved or
 * spoofed: the ladder only renders pages with real browsers.
 *
 * State lives in `<home>/engine.sqlite` (WAL): `frontier`, `pages`, `chunks_fts`, `assets`. Workers claim rows
 * atomically, so several processes may share one home. `publish` uploads each new image asset once, additively,
 * to the Shenron CDN (R2 + manifest, see web-engine-cdn.ts) under /assets/crawl/<host>/, and records the CDN path.
 */
import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

const TIER_NAMES = ["fetch", "lightpanda", "obscura", "webview"] as const;
type Tier = (typeof TIER_NAMES)[number];
const UA =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Shenron/1.0 (+https://dragonballfr.com)";

export function parseArgs(argv: string[]) {
  const flags = new Map<string, string[]>();
  const bare = new Set<string>();
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (!arg.startsWith("--")) continue;
    const next = argv[i + 1];
    if (next === undefined || next.startsWith("--")) bare.add(arg.slice(2));
    else {
      flags.set(arg.slice(2), [...(flags.get(arg.slice(2)) ?? []), next]);
      i++;
    }
  }
  const one = (name: string, fallback: string) => flags.get(name)?.at(-1) ?? fallback;
  return {
    flags,
    bare,
    one,
    num: (name: string, fallback: number) => Number(one(name, String(fallback))),
  };
}

export function openDb(home: string): Database {
  mkdirSync(home, { recursive: true });
  const db = new Database(join(home, "engine.sqlite"));
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=30000; PRAGMA synchronous=NORMAL;
    CREATE TABLE IF NOT EXISTS frontier(url TEXT PRIMARY KEY, host TEXT NOT NULL, depth INTEGER NOT NULL,
      state TEXT NOT NULL DEFAULT 'pending', attempts INTEGER NOT NULL DEFAULT 0, tier TEXT, status INTEGER, note TEXT,
      claimed_at INTEGER);
    CREATE INDEX IF NOT EXISTS frontier_state ON frontier(state, host);
    CREATE TABLE IF NOT EXISTS pages(url TEXT PRIMARY KEY, host TEXT, title TEXT, tier TEXT, status INTEGER,
      bytes INTEGER, text TEXT, fetched_at INTEGER);
    CREATE VIRTUAL TABLE IF NOT EXISTS chunks_fts USING fts5(url UNINDEXED, title, body, tokenize='unicode61 remove_diacritics 2');
    CREATE TABLE IF NOT EXISTS assets(url TEXT PRIMARY KEY, page TEXT, kind TEXT, state TEXT NOT NULL DEFAULT 'new',
      sha256 TEXT, bytes INTEGER, cdn_path TEXT, note TEXT);`);
  return db;
}

export function enqueue(db: Database, urls: Iterable<string>, depth: number) {
  const insert = db.prepare("INSERT OR IGNORE INTO frontier(url, host, depth) VALUES (?1, ?2, ?3)");
  db.transaction(() => {
    for (const raw of urls) {
      try {
        const url = new URL(raw);
        if (url.protocol !== "http:" && url.protocol !== "https:") continue;
        url.hash = "";
        insert.run(url.href, url.host, depth);
      } catch {}
    }
  })();
}

/** Claims up to `n` pending rows, one host at a time bounded by `perHost`, and marks them running. */
export function claim(db: Database, n: number, perHost: number) {
  return db.transaction(() => {
    const busy = new Map<string, number>(
      (
        db
          .query("SELECT host, count(*) c FROM frontier WHERE state='running' GROUP BY host")
          .all() as {
          host: string;
          c: number;
        }[]
      ).map((r) => [r.host, r.c]),
    );
    const rows = db
      .query(
        "SELECT url, host, depth FROM frontier WHERE state='pending' ORDER BY depth, rowid LIMIT ?1",
      )
      .all(n * 8) as { url: string; host: string; depth: number }[];
    const out: typeof rows = [];
    for (const row of rows) {
      if (out.length >= n) break;
      if ((busy.get(row.host) ?? 0) >= perHost) continue;
      busy.set(row.host, (busy.get(row.host) ?? 0) + 1);
      out.push(row);
    }
    const mark = db.prepare("UPDATE frontier SET state='running', claimed_at=?2 WHERE url=?1");
    for (const row of out) mark.run(row.url, Date.now());
    return out;
  })();
}

const CHALLENGE =
  /just a moment|cf-chl|challenge-platform|attention required|enable javascript and cookies|ddos protection by/i;
export function isChallenge(status: number, html: string): boolean {
  return (
    ((status === 403 || status === 429 || status === 503) && CHALLENGE.test(html)) ||
    (html.length < 6000 && CHALLENGE.test(html))
  );
}

async function spawnText(cmd: string[], timeoutMs: number): Promise<string> {
  const child = Bun.spawn(cmd, { stdout: "pipe", stderr: "ignore", stdin: "ignore" });
  const timer = setTimeout(() => child.kill(), timeoutMs);
  try {
    const out = await new Response(child.stdout).text();
    await child.exited;
    return out;
  } finally {
    clearTimeout(timer);
  }
}

let chrome: Promise<any> | undefined;
const webviewGate = { active: 0 };
async function webviewHtml(url: string, timeoutMs: number): Promise<string> {
  if (webviewGate.active >= 4) throw new Error("webview busy");
  webviewGate.active++;
  try {
    chrome ??= Promise.resolve(Bun as any);
    await using view = new (Bun as any).WebView({
      width: 1280,
      height: 800,
      backend: { type: "chrome", url: false, argv: ["--no-sandbox"] },
    });
    await Promise.race([
      view.navigate(url),
      Bun.sleep(timeoutMs).then(() => {
        throw new Error("webview timeout");
      }),
    ]);
    return String(await view.evaluate("document.documentElement.outerHTML"));
  } finally {
    webviewGate.active--;
  }
}

export interface Fetched {
  tier: Tier;
  status: number;
  html: string;
}

export async function fetchTier(tier: Tier, url: string, timeoutMs = 30_000): Promise<Fetched> {
  if (tier === "fetch") {
    const response = await fetch(url, {
      headers: { "user-agent": UA, accept: "text/html,*/*" },
      redirect: "follow",
      signal: AbortSignal.timeout(timeoutMs),
    });
    const type = response.headers.get("content-type") ?? "";
    if (!/html|xml|text/i.test(type) && type) return { tier, status: response.status, html: "" };
    return { tier, status: response.status, html: await response.text() };
  }
  if (tier === "lightpanda")
    return {
      tier,
      status: 200,
      html: await spawnText(["lightpanda", "fetch", "--dump", "html", url], timeoutMs),
    };
  if (tier === "obscura")
    return {
      tier,
      status: 200,
      html: await spawnText(["obscura", "fetch", url, "--dump", "html"], timeoutMs),
    };
  return { tier, status: 200, html: await webviewHtml(url, timeoutMs) };
}

export function extract(html: string, base: string) {
  const title =
    /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1]?.replace(/\s+/g, " ").trim() ?? "";
  const text = html
    .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&[a-z#0-9]+;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  const links = new Set<string>();
  for (const m of html.matchAll(/<a\s[^>]*href=["']([^"']+)["']/gi)) {
    try {
      links.add(new URL(m[1]!, base).href);
    } catch {}
  }
  const assets = new Map<string, string>();
  for (const m of html.matchAll(
    /<(?:img|source|video)\s[^>]*(?:src|data-src)=["']([^"']+)["']/gi,
  )) {
    try {
      const href = new URL(m[1]!, base).href;
      const kind = /\.(mp4|webm|m3u8)(\?|$)/i.test(href)
        ? "video"
        : /\.(jpe?g|png|webp|gif|avif)(\?|$)/i.test(href)
          ? "image"
          : "";
      if (kind) assets.set(href, kind);
    } catch {}
  }
  return { title, text, links: [...links], assets: [...assets] };
}

export async function fetchLadder(
  url: string,
  tiers: Tier[],
): Promise<{ result?: Fetched; notes: string[] }> {
  const notes: string[] = [];
  for (const tier of tiers) {
    try {
      const got = await fetchTier(tier, url);
      if (!got.html) {
        notes.push(`${tier}:empty(${got.status})`);
        if (got.status >= 400 && got.status < 500 && got.status !== 403 && got.status !== 429)
          return { result: got, notes };
        continue;
      }
      if (isChallenge(got.status, got.html)) {
        notes.push(`${tier}:challenge`);
        continue;
      }
      if (got.status >= 400 && tier === "fetch") {
        notes.push(`${tier}:${got.status}`);
        if (got.status === 404 || got.status === 410) return { result: got, notes };
        continue;
      }
      return { result: got, notes };
    } catch (error) {
      notes.push(`${tier}:${String((error as Error).message).slice(0, 60)}`);
    }
  }
  return { notes };
}

async function worker(
  db: Database,
  id: number,
  opts: {
    tiers: Tier[];
    perHost: number;
    delay: number;
    maxDepth: number;
    allow: Set<string>;
    stop: () => boolean;
  },
) {
  const done = db.prepare(
    "UPDATE frontier SET state=?2, tier=?3, status=?4, note=?5, attempts=attempts+1 WHERE url=?1",
  );
  const savePage = db.prepare(
    "INSERT OR REPLACE INTO pages(url, host, title, tier, status, bytes, text, fetched_at) VALUES (?1,?2,?3,?4,?5,?6,?7,?8)",
  );
  const saveFts = db.prepare("INSERT INTO chunks_fts(url, title, body) VALUES (?1,?2,?3)");
  const saveAsset = db.prepare("INSERT OR IGNORE INTO assets(url, page, kind) VALUES (?1,?2,?3)");
  while (!opts.stop()) {
    const [job] = claim(db, 1, opts.perHost);
    if (!job) {
      if (!db.query("SELECT 1 FROM frontier WHERE state IN ('pending','running') LIMIT 1").get())
        return;
      await Bun.sleep(250 + id * 7);
      continue;
    }
    try {
      const { result, notes } = await fetchLadder(job.url, opts.tiers);
      if (!result?.html) {
        done.run(job.url, "skipped", null, result?.status ?? null, notes.join(","));
        continue;
      }
      const page = extract(result.html, job.url);
      db.transaction(() => {
        savePage.run(
          job.url,
          job.host,
          page.title,
          result.tier,
          result.status,
          result.html.length,
          page.text.slice(0, 200_000),
          Date.now(),
        );
        db.prepare("DELETE FROM chunks_fts WHERE url=?1").run(job.url);
        for (let at = 0; at < page.text.length; at += 4000)
          saveFts.run(job.url, page.title, page.text.slice(at, at + 4000));
        for (const [asset, kind] of page.assets) saveAsset.run(asset, job.url, kind);
        done.run(job.url, "done", result.tier, result.status, notes.join(","));
      })();
      if (job.depth < opts.maxDepth)
        enqueue(
          db,
          page.links.filter((l) => opts.allow.has(new URL(l).host)),
          job.depth + 1,
        );
    } catch (error) {
      done.run(job.url, "skipped", null, null, String((error as Error).message).slice(0, 120));
    }
    if (opts.delay) await Bun.sleep(opts.delay);
  }
}

export async function seedSitemaps(db: Database, origin: string) {
  const seen = new Set<string>();
  const queue = [`${origin}/sitemap.xml`];
  while (queue.length && seen.size < 50) {
    const url = queue.shift()!;
    if (seen.has(url)) continue;
    seen.add(url);
    try {
      const xml = await (
        await fetch(url, { headers: { "user-agent": UA }, signal: AbortSignal.timeout(60_000) })
      ).text();
      const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]!.trim());
      if (/<sitemapindex/i.test(xml)) queue.push(...locs);
      else enqueue(db, locs, 1);
    } catch {}
  }
}

export async function publish(db: Database, limit: number) {
  const { mintClient, publishItems, livePrefix } = await import("./web-engine-cdn");
  const s3 = await mintClient();
  const prefix = await livePrefix();
  const rows = db
    .query("SELECT url, page FROM assets WHERE state='new' AND kind='image' LIMIT ?1")
    .all(limit || 1_000_000) as { url: string; page: string }[];
  const update = db.prepare(
    "UPDATE assets SET state=?2, sha256=?3, bytes=?4, cdn_path=?5, note=?6 WHERE url=?1",
  );
  const seen = new Set<string>();
  let skipped = 0,
    uploaded = 0;
  for (let at = 0; at < rows.length; at += 200) {
    const batch = rows.slice(at, at + 200);
    const items: import("./web-engine-cdn").CdnItem[] = [];
    const byPath = new Map<string, string>();
    let next = 0;
    await Promise.all(
      Array.from({ length: 8 }, async () => {
        while (next < batch.length) {
          const row = batch[next++]!;
          try {
            const response = await fetch(row.url, {
              headers: { "user-agent": UA, referer: row.page },
              signal: AbortSignal.timeout(60_000),
            });
            const bytes = new Uint8Array(await response.arrayBuffer());
            const type = response.headers.get("content-type")?.split(";")[0] ?? "";
            const ext = (
              {
                "image/png": "png",
                "image/jpeg": "jpg",
                "image/webp": "webp",
                "image/gif": "gif",
                "image/avif": "avif",
              } as Record<string, string>
            )[type];
            if (!response.ok || !ext || bytes.length < 2048) {
              update.run(
                row.url,
                "skipped",
                null,
                bytes.length,
                null,
                `${response.status} ${type}`,
              );
              skipped++;
              continue;
            }
            const sha = new Bun.CryptoHasher("sha256").update(bytes).digest("hex");
            const path = `/assets/crawl/${new URL(row.url).host}/${sha.slice(0, 2)}/${sha}.${ext}`;
            if (seen.has(path)) {
              update.run(row.url, "duplicate", sha, bytes.length, path, null);
              skipped++;
              continue;
            }
            seen.add(path);
            byPath.set(path, row.url);
            items.push({ path, sha256: sha, bytes, contentType: type });
          } catch (error) {
            update.run(
              row.url,
              "skipped",
              null,
              null,
              null,
              String((error as Error).message).slice(0, 120),
            );
            skipped++;
          }
        }
      }),
    );
    const result = await publishItems(s3, items, prefix);
    for (const path of result.live) {
      const item = items.find((i) => i.path === path)!;
      update.run(byPath.get(path)!, "uploaded", item.sha256, item.bytes.length, path, null);
      uploaded++;
    }
    for (const f of result.failed) {
      update.run(byPath.get(f.path)!, "skipped", null, null, null, f.error);
      skipped++;
    }
  }
  return { uploaded, skipped, considered: rows.length };
}

/** Manifest entries of every uploaded asset, for cdn-origin-add.ts. */
export function cdnEntries(db: Database) {
  const types: Record<string, string> = {
    png: "image/png",
    jpg: "image/jpeg",
    webp: "image/webp",
    gif: "image/gif",
    avif: "image/avif",
  };
  const out: Record<
    string,
    { path: string; sha256: string; size: number; contentType: string; cacheControl: string }
  > = {};
  for (const row of db
    .query(
      "SELECT cdn_path p, sha256 h, bytes b FROM assets WHERE state='uploaded' AND cdn_path IS NOT NULL",
    )
    .all() as { p: string; h: string; b: number }[]) {
    out[row.p] = {
      path: row.p,
      sha256: row.h,
      size: row.b,
      contentType: types[row.p.split(".").at(-1)!] ?? "application/octet-stream",
      cacheControl: "public, max-age=31536000, immutable",
    };
  }
  return out;
}

export function stats(db: Database) {
  return {
    frontier: db.query("SELECT state, count(*) n FROM frontier GROUP BY state").all(),
    tiers: db.query("SELECT tier, count(*) n FROM pages GROUP BY tier").all(),
    assets: db.query("SELECT state, count(*) n FROM assets GROUP BY state").all(),
    pages: (db.query("SELECT count(*) n FROM pages").get() as { n: number }).n,
  };
}

if (import.meta.main) {
  const [command = "stats", ...rest] = process.argv.slice(2);
  const args = parseArgs(rest);
  const home = resolve(args.one("home", join(homedir(), "apps/shenron-engine")));
  const db = openDb(home);
  if (command === "stats") console.log(JSON.stringify(stats(db)));
  else if (command === "repair-cdn") {
    const { mintClient, repairObject } = await import("./web-engine-cdn");
    const s3 = await mintClient();
    const entries = Object.values(cdnEntries(db));
    let fixed = 0,
      failed = 0,
      next = 0;
    await Promise.all(
      Array.from({ length: 8 }, async () => {
        while (next < entries.length) {
          const e = entries[next++]!;
          try {
            if (await repairObject(s3, e)) fixed++;
          } catch {
            failed++;
          }
        }
      }),
    );
    console.log(JSON.stringify({ checked: entries.length, fixed, failed }));
  } else if (command === "export-cdn") console.log(JSON.stringify(cdnEntries(db)));
  else if (command === "publish") {
    console.log(JSON.stringify(await publish(db, args.num("limit", 0))));
    if (args.bare.has("deploy")) {
      // Hand the manifest entries to the CDN origin on dbfr (see cdn-origin-add.ts); it restarts only when entries are new.
      const entries = join(home, "cdn-entries.json");
      await Bun.write(entries, JSON.stringify(cdnEntries(db)));
      const script = join(import.meta.dir, "cdn-origin-add.ts");
      const run = async (cmd: string[]) => {
        const p = Bun.spawn(cmd, { stdout: "inherit", stderr: "inherit" });
        if (await p.exited) throw new Error(`${cmd[0]} failed`);
      };
      await run(["scp", "-q", entries, script, "dbfr:/tmp/"]);
      await run([
        "ssh",
        "dbfr",
        'sudo -n "$(command -v bun || echo $HOME/.bun/bin/bun)" /tmp/cdn-origin-add.ts /tmp/cdn-entries.json',
      ]);
    }
  } else if (command === "run") {
    const seeds = args.flags.get("seed") ?? ["https://dragonballfr.com"];
    const tiers = args
      .one("tiers", TIER_NAMES.join(","))
      .split(",")
      .filter((t): t is Tier => (TIER_NAMES as readonly string[]).includes(t));
    const allow = new Set([
      ...seeds.map((s) => new URL(s).host),
      ...args.one("allow-host", "").split(",").filter(Boolean),
    ]);
    db.exec("UPDATE frontier SET state='pending' WHERE state='running'");
    enqueue(db, seeds, 0);
    if (args.bare.has("sitemap"))
      for (const seed of seeds) await seedSitemaps(db, new URL(seed).origin);
    const maxPages = args.num("max-pages", 0);
    const stop = () =>
      maxPages > 0 &&
      (db.query("SELECT count(*) n FROM pages").get() as { n: number }).n >= maxPages;
    const options = {
      tiers,
      perHost: args.num("per-host", 4),
      delay: args.num("delay", 100),
      maxDepth: args.num("max-depth", 8),
      allow,
      stop,
    };
    await Promise.all(
      Array.from({ length: args.num("workers", 24) }, (_, id) => worker(db, id, options)),
    );
    console.log(JSON.stringify(stats(db)));
    if (args.bare.has("publish")) console.log(JSON.stringify(await publish(db, 0)));
  } else throw new Error(`unknown command ${command}`);
}
