#!/usr/bin/env bun
// SPDX-License-Identifier: Apache-2.0
/**
 * Missing "planche" (page plate) finder and staging cascade.
 *
 *   bun scripts/ops/planches-complete.ts missing   # compute missing.json from the live site
 *   bun scripts/ops/planches-complete.ts discover  # find candidate image URLs on source pages
 *   bun scripts/ops/planches-complete.ts stage     # fetch + verify + hash candidate images
 *   bun scripts/ops/planches-complete.ts plan      # write the dry-run import plan
 *   bun scripts/ops/planches-complete.ts all
 *
 * Everything stays local (bun:sqlite + files under --home). Nothing is uploaded
 * to the CDN, the wiki or PostgreSQL. Tiers: fetch, Lightpanda, Obscura, and
 * Bun.WebView (headless Chrome). Every tier result is verified by content, never
 * by status code. robots.txt is obeyed (except for the owner's own origin API,
 * which the owner authorised), >= 500 ms between requests per host, <= 3 in
 * flight per host, no stealth, no CAPTCHA handling.
 */
import { Database } from "bun:sqlite";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";

export const UA = "ShenronPlanchesBot/1.0 (+https://dragonballfr.com; contact@aphrody.com)";
export const OWN_HOSTS = new Set([
  "dragonballfr.com",
  "www.dragonballfr.com",
  "cdn.dragonballfr.com",
]);
export const TIERS = ["fetch", "lightpanda", "obscura", "webview"] as const;
export type TierName = (typeof TIERS)[number];

// ---------------------------------------------------------------- robots.txt

export interface RobotsRules {
  allow: string[];
  disallow: string[];
  crawlDelayMs: number;
}

/** Parses the group that applies to `agent`, falling back to `*`. */
export function parseRobots(text: string, agent = "ShenronPlanchesBot"): RobotsRules {
  const groups: { agents: string[]; allow: string[]; disallow: string[]; delay: number }[] = [];
  let cur: (typeof groups)[number] | null = null;
  let lastWasAgent = false;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/#.*/, "").trim();
    const i = line.indexOf(":");
    if (i < 0) continue;
    const key = line.slice(0, i).trim().toLowerCase();
    const val = line.slice(i + 1).trim();
    if (key === "user-agent") {
      if (!cur || !lastWasAgent) {
        cur = { agents: [], allow: [], disallow: [], delay: 0 };
        groups.push(cur);
      }
      cur.agents.push(val.toLowerCase());
      lastWasAgent = true;
      continue;
    }
    lastWasAgent = false;
    if (!cur) continue;
    if (key === "allow" && val) cur.allow.push(val);
    else if (key === "disallow" && val) cur.disallow.push(val);
    else if (key === "crawl-delay") cur.delay = Number(val) || 0;
  }
  const a = agent.toLowerCase();
  const specific = groups.filter((g) => g.agents.some((x) => x !== "*" && a.includes(x)));
  const chosen = specific.length ? specific : groups.filter((g) => g.agents.includes("*"));
  return {
    allow: chosen.flatMap((g) => g.allow),
    disallow: chosen.flatMap((g) => g.disallow),
    crawlDelayMs: Math.max(0, ...chosen.map((g) => g.delay * 1000)),
  };
}

function ruleMatches(rule: string, path: string): boolean {
  const re = new RegExp(
    "^" +
      rule
        .replace(/[.+?^${}()|[\]\\]/g, "\\$&")
        .replace(/\*/g, ".*")
        .replace(/\\\$$/, "$"),
  );
  return re.test(path);
}

/** Longest matching rule wins; allow wins ties (RFC 9309). */
export function robotsAllows(rules: RobotsRules, path: string): boolean {
  let best = -1;
  let allowed = true;
  for (const r of rules.disallow)
    if (ruleMatches(r, path) && r.length > best) {
      best = r.length;
      allowed = false;
    }
  for (const r of rules.allow)
    if (ruleMatches(r, path) && r.length >= best) {
      best = r.length;
      allowed = true;
    }
  return allowed;
}

// ------------------------------------------------------------ host politeness

export class HostLimiter {
  private nextAt = new Map<string, number>();
  private active = new Map<string, number>();
  constructor(
    readonly minDelayMs = 600,
    readonly maxConcurrent = 2,
  ) {
    if (minDelayMs < 500) throw new Error("minDelayMs must be >= 500");
    if (maxConcurrent > 3) throw new Error("maxConcurrent must be <= 3");
  }
  async run<T>(host: string, fn: () => Promise<T>, extraDelayMs = 0): Promise<T> {
    for (;;) {
      const now = Date.now();
      const wait = Math.max(0, (this.nextAt.get(host) ?? 0) - now);
      if ((this.active.get(host) ?? 0) < this.maxConcurrent && wait === 0) break;
      await Bun.sleep(wait || 25);
    }
    this.active.set(host, (this.active.get(host) ?? 0) + 1);
    this.nextAt.set(host, Date.now() + Math.max(this.minDelayMs, extraDelayMs));
    try {
      return await fn();
    } finally {
      this.active.set(host, (this.active.get(host) ?? 1) - 1);
    }
  }
}

// ------------------------------------------------------------ html extraction

const IMG_EXT = /\.(?:jpe?g|png|webp|gif|avif)(?:[?#].*)?$/i;

/** Absolute image URLs referenced by a page (img/srcset/og:image/link rel=image_src). */
export function extractImageUrls(html: string, base: string, limit = 60): string[] {
  const out = new Set<string>();
  const add = (v: string | undefined) => {
    if (!v) return;
    const t = v.trim().replace(/&amp;/g, "&");
    if (!t || t.startsWith("data:")) return;
    try {
      const u = new URL(t, base);
      if (u.protocol === "http:" || u.protocol === "https:") out.add(u.href);
    } catch {}
  };
  for (const m of html.matchAll(/<img\b[^>]*>/gi)) {
    const tag = m[0];
    for (const attr of ["src", "data-src", "data-original", "data-lazy-src"]) {
      add(tag.match(new RegExp(`\\b${attr}\\s*=\\s*["']([^"']+)["']`, "i"))?.[1]);
    }
    const srcset = tag.match(/\bsrcset\s*=\s*["']([^"']+)["']/i)?.[1];
    if (srcset) for (const part of srcset.split(",")) add(part.trim().split(/\s+/)[0]);
  }
  for (const m of html.matchAll(/<meta\b[^>]*>/gi)) {
    if (/property\s*=\s*["']og:image(?::url)?["']/i.test(m[0]))
      add(m[0].match(/content\s*=\s*["']([^"']+)["']/i)?.[1]);
  }
  for (const m of html.matchAll(/<a\b[^>]*href\s*=\s*["']([^"']+)["']/gi))
    if (IMG_EXT.test(m[1]!)) add(m[1]);
  return [...out].slice(0, limit);
}

// -------------------------------------------------------------- verification

export interface ImageCheck {
  ok: boolean;
  reason?: string;
  sha256?: string;
  width?: number;
  height?: number;
  format?: string;
  bytes: number;
}
export interface VerifyOpts {
  minBytes?: number;
  maxBytes?: number;
  minSide?: number;
  maxSide?: number;
}

/** Content verification: declared type, decodability, dimensions, size bounds, SHA-256. */
export async function verifyImage(
  bytes: Uint8Array,
  contentType: string | null,
  opts: VerifyOpts = {},
): Promise<ImageCheck> {
  const { minBytes = 4096, maxBytes = 64 * 1024 * 1024, minSide = 150, maxSide = 20000 } = opts;
  const n = bytes.byteLength;
  if (!contentType || !/^image\/(jpeg|png|webp|gif|avif)\b/i.test(contentType))
    return { ok: false, reason: `content-type ${contentType ?? "none"}`, bytes: n };
  if (n < minBytes) return { ok: false, reason: `too small (${n} B)`, bytes: n };
  if (n > maxBytes) return { ok: false, reason: `too large (${n} B)`, bytes: n };
  let meta: { width: number; height: number; format?: string };
  try {
    meta = await new Bun.Image(bytes).metadata();
  } catch (e) {
    return { ok: false, reason: `not decodable: ${(e as Error).message}`, bytes: n };
  }
  if (!(meta.width >= minSide && meta.height >= minSide))
    return { ok: false, reason: `dimensions ${meta.width}x${meta.height}`, bytes: n };
  if (meta.width > maxSide || meta.height > maxSide)
    return { ok: false, reason: `dimensions ${meta.width}x${meta.height}`, bytes: n };
  const sha256 = new Bun.CryptoHasher("sha256").update(bytes).digest("hex");
  return {
    ok: true,
    sha256,
    width: meta.width,
    height: meta.height,
    format: meta.format,
    bytes: n,
  };
}

// ------------------------------------------------------------------- tiers

export interface PageResult {
  html: string;
}
export interface ImageResult {
  bytes: Uint8Array;
  contentType: string | null;
}
export interface Tier {
  name: TierName;
  page?(url: string): Promise<PageResult>;
  image?(url: string, referer: string | null): Promise<ImageResult>;
}

const sniff = (b: Uint8Array): string | null => {
  const h = (i: number) => b[i];
  if (h(0) === 0xff && h(1) === 0xd8) return "image/jpeg";
  if (h(0) === 0x89 && h(1) === 0x50 && h(2) === 0x4e) return "image/png";
  if (h(0) === 0x47 && h(1) === 0x49 && h(2) === 0x46) return "image/gif";
  if (h(0) === 0x52 && h(1) === 0x49 && h(8) === 0x57 && h(9) === 0x45) return "image/webp";
  return null;
};

async function run(cmd: string[], timeoutMs: number): Promise<{ out: Uint8Array; code: number }> {
  const p = Bun.spawn(cmd, {
    stdout: "pipe",
    stderr: "ignore",
    timeout: timeoutMs,
    killSignal: "SIGKILL",
  });
  const out = new Uint8Array(await new Response(p.stdout).arrayBuffer());
  return { out, code: await p.exited };
}

export function realTiers(timeoutMs = 45_000): Tier[] {
  let view: InstanceType<typeof Bun.WebView> | null = null;
  const webview = () =>
    (view ??= new Bun.WebView({
      backend: { type: "chrome", argv: ["--no-sandbox"], url: false },
      width: 1280,
      height: 900,
    } as never));
  return [
    {
      name: "fetch",
      async page(url) {
        const r = await fetch(url, {
          headers: { "user-agent": UA },
          signal: AbortSignal.timeout(timeoutMs),
        });
        return { html: await r.text() };
      },
      async image(url, referer) {
        const r = await fetch(url, {
          headers: { "user-agent": UA, ...(referer ? { referer } : {}), accept: "image/*" },
          signal: AbortSignal.timeout(timeoutMs),
        });
        return {
          bytes: new Uint8Array(await r.arrayBuffer()),
          contentType: r.headers.get("content-type"),
        };
      },
    },
    {
      name: "lightpanda",
      async page(url) {
        const { out } = await run(["lightpanda", "fetch", "--dump", "html", url], timeoutMs);
        return { html: new TextDecoder().decode(out) };
      },
    },
    {
      name: "obscura",
      async page(url) {
        const { out } = await run(
          ["obscura", "fetch", url, "--dump", "html", "--obey-robots"],
          timeoutMs,
        );
        return { html: new TextDecoder().decode(out) };
      },
      async image(url) {
        const { out } = await run(
          ["obscura", "fetch", url, "--dump", "original", "--obey-robots"],
          timeoutMs,
        );
        return { bytes: out, contentType: sniff(out) };
      },
    },
    {
      name: "webview",
      async page(url) {
        const v = webview();
        await v.navigate(url);
        return { html: String(await v.evaluate("document.documentElement.outerHTML")) };
      },
      async image(url) {
        const v = webview();
        await v.navigate(url);
        const b64 = String(
          await v.evaluate(
            `fetch(location.href).then(r=>r.blob()).then(b=>new Promise(res=>{const f=new FileReader();f.onload=()=>res(String(f.result).split(",")[1]||"");f.readAsDataURL(b)}))`,
          ),
        );
        const bytes = new Uint8Array(Buffer.from(b64, "base64"));
        return { bytes, contentType: sniff(bytes) };
      },
    },
  ];
}

// ------------------------------------------------------------------ staging DB

export function openStagingDb(path: string): Database {
  const db = new Database(path, { create: true });
  db.exec(`
    PRAGMA journal_mode=WAL; PRAGMA busy_timeout=15000;
    CREATE TABLE IF NOT EXISTS missing_items(
      item_ref TEXT PRIMARY KEY, category TEXT NOT NULL, detail TEXT NOT NULL, source_url TEXT, found_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS candidates(
      url TEXT PRIMARY KEY, host TEXT NOT NULL, kind TEXT NOT NULL CHECK(kind IN ('page','image')),
      parent_url TEXT, item_ref TEXT, discovered_tier TEXT, source_note TEXT NOT NULL, discovered_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS assets(
      sha256 TEXT PRIMARY KEY, path TEXT NOT NULL, content_type TEXT NOT NULL, width INTEGER NOT NULL,
      height INTEGER NOT NULL, bytes INTEGER NOT NULL, first_url TEXT NOT NULL, staged_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS asset_sources(
      url TEXT PRIMARY KEY, sha256 TEXT NOT NULL REFERENCES assets(sha256), host TEXT NOT NULL, tier TEXT NOT NULL,
      fetched_at TEXT NOT NULL, content_type TEXT NOT NULL, width INTEGER NOT NULL, height INTEGER NOT NULL,
      bytes INTEGER NOT NULL, item_ref TEXT, referer TEXT, source_note TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS attempts(
      id INTEGER PRIMARY KEY, url TEXT NOT NULL, purpose TEXT NOT NULL, tier TEXT NOT NULL, ok INTEGER NOT NULL,
      detail TEXT, at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS plate_records(
      item_ref TEXT PRIMARY KEY, kind TEXT NOT NULL, owner_id INTEGER NOT NULL, page INTEGER, image_present INTEGER NOT NULL,
      text_ja TEXT, text_fr TEXT, text_origin TEXT, staged_sha256 TEXT, note TEXT);
    CREATE INDEX IF NOT EXISTS asset_sources_host ON asset_sources(host);
    CREATE INDEX IF NOT EXISTS candidates_item ON candidates(item_ref);
  `);
  return db;
}

// ----------------------------------------------------------- missing computation

export interface DatabookLite {
  id: number;
  kind: string;
  title: string;
  source_url: string | null;
  visible?: boolean;
  pages?: {
    number: number;
    image?: string | null;
    text?: string | null;
    text_fr?: string | null;
  }[];
}
export interface VolumeLite {
  id: number;
  series: string;
  number: number;
  chapters: number;
  listedPages: number;
  hasListedPages: boolean;
}
export interface MissingItem {
  item_ref: string;
  category:
    | "databook-no-pages"
    | "databook-page-no-image"
    | "databook-page-no-text"
    | "manga-volume-no-pages";
  detail: Record<string, unknown>;
  source_url: string | null;
}

export function computeMissing(databooks: DatabookLite[], volumes: VolumeLite[]) {
  const items: MissingItem[] = [];
  const counts = {
    databooks: databooks.length,
    databookPagesListed: 0,
    databooksWithoutPages: 0,
    databookPagesWithoutImage: 0,
    databookPagesWithoutText: 0,
    volumes: volumes.length,
    volumesWithoutPages: 0,
    chaptersInVolumesWithoutPages: 0,
  };
  for (const b of databooks) {
    const pages = b.pages ?? [];
    counts.databookPagesListed += pages.length;
    if (!pages.length) {
      counts.databooksWithoutPages++;
      items.push({
        item_ref: `databook:${b.id}`,
        category: "databook-no-pages",
        detail: { title: b.title, kind: b.kind },
        source_url: b.source_url,
      });
    }
    for (const p of pages) {
      if (!p.image) {
        counts.databookPagesWithoutImage++;
        items.push({
          item_ref: `databook:${b.id}:p${p.number}:image`,
          category: "databook-page-no-image",
          detail: { title: b.title, page: p.number, hasText: !!p.text },
          source_url: b.source_url,
        });
      }
      if (!p.text) {
        counts.databookPagesWithoutText++;
        items.push({
          item_ref: `databook:${b.id}:p${p.number}:text`,
          category: "databook-page-no-text",
          detail: { title: b.title, page: p.number, hasImage: !!p.image },
          source_url: b.source_url,
        });
      }
    }
  }
  for (const v of volumes) {
    if (v.hasListedPages) continue;
    counts.volumesWithoutPages++;
    counts.chaptersInVolumesWithoutPages += v.chapters;
    items.push({
      item_ref: `manga-volume:${v.id}`,
      category: "manga-volume-no-pages",
      detail: { series: v.series, number: v.number, chapters: v.chapters },
      source_url: null,
    });
  }
  return { counts, items };
}

// --------------------------------------------------------------------- cascade

export interface CascadeCtx {
  db: Database;
  tiers: Tier[];
  limiter: HostLimiter;
  assetDir: string;
  robots: (url: string) => Promise<boolean>;
  verify?: VerifyOpts;
  now?: () => string;
}

const hostOf = (u: string) => new URL(u).host;

function logAttempt(
  ctx: CascadeCtx,
  url: string,
  purpose: string,
  tier: string,
  ok: boolean,
  detail: string,
) {
  ctx.db
    .query("INSERT INTO attempts(url,purpose,tier,ok,detail,at) VALUES(?,?,?,?,?,?)")
    .run(
      url,
      purpose,
      tier,
      ok ? 1 : 0,
      detail.slice(0, 300),
      (ctx.now ?? (() => new Date().toISOString()))(),
    );
}

/** Page discovery: first tier whose HTML yields at least one image candidate wins. */
export async function discoverPage(
  ctx: CascadeCtx,
  pageUrl: string,
  itemRef: string | null,
  sourceNote: string,
): Promise<{ tier: TierName | null; images: string[] }> {
  if (!(await ctx.robots(pageUrl))) {
    logAttempt(ctx, pageUrl, "page", "robots", false, "disallowed by robots.txt");
    return { tier: null, images: [] };
  }
  const host = hostOf(pageUrl);
  for (const tier of ctx.tiers) {
    if (!tier.page) continue;
    try {
      const { html } = await ctx.limiter.run(host, () => tier.page!(pageUrl));
      const images = /<html|<img|<meta/i.test(html) ? extractImageUrls(html, pageUrl) : [];
      logAttempt(
        ctx,
        pageUrl,
        "page",
        tier.name,
        images.length > 0,
        `${html.length} chars, ${images.length} images`,
      );
      if (images.length) {
        const at = (ctx.now ?? (() => new Date().toISOString()))();
        const ins = ctx.db.query(
          "INSERT OR IGNORE INTO candidates(url,host,kind,parent_url,item_ref,discovered_tier,source_note,discovered_at) VALUES(?,?,?,?,?,?,?,?)",
        );
        for (const img of images)
          ins.run(img, hostOf(img), "image", pageUrl, itemRef, tier.name, sourceNote, at);
        return { tier: tier.name, images };
      }
    } catch (e) {
      logAttempt(ctx, pageUrl, "page", tier.name, false, String((e as Error).message));
    }
  }
  return { tier: null, images: [] };
}

/** Image staging: each tier is verified by content; the file is stored by SHA-256. Deduped by hash. */
export async function stageImage(
  ctx: CascadeCtx,
  url: string,
  referer: string | null,
  itemRef: string | null,
  sourceNote: string,
): Promise<{ ok: boolean; tier?: TierName; sha256?: string; duplicate?: boolean }> {
  if (!(await ctx.robots(url))) {
    logAttempt(ctx, url, "image", "robots", false, "disallowed by robots.txt");
    return { ok: false };
  }
  const host = hostOf(url);
  for (const tier of ctx.tiers) {
    if (!tier.image) continue;
    try {
      const res = await ctx.limiter.run(host, () => tier.image!(url, referer));
      const check = await verifyImage(res.bytes, res.contentType, ctx.verify);
      logAttempt(
        ctx,
        url,
        "image",
        tier.name,
        check.ok,
        check.ok ? `${check.width}x${check.height} ${check.bytes} B` : check.reason!,
      );
      if (!check.ok) continue;
      const ext = (res.contentType!.split("/")[1] ?? "bin").split(";")[0]!.replace("jpeg", "jpg");
      const rel = `${check.sha256!.slice(0, 2)}/${check.sha256}.${ext}`;
      const path = join(ctx.assetDir, rel);
      const known = ctx.db.query("SELECT 1 FROM assets WHERE sha256=?").get(check.sha256!);
      if (!known) {
        await Bun.write(path, res.bytes);
        ctx.db
          .query(
            "INSERT INTO assets(sha256,path,content_type,width,height,bytes,first_url,staged_at) VALUES(?,?,?,?,?,?,?,?)",
          )
          .run(
            check.sha256!,
            rel,
            res.contentType!,
            check.width!,
            check.height!,
            check.bytes,
            url,
            (ctx.now ?? (() => new Date().toISOString()))(),
          );
      }
      ctx.db
        .query(
          "INSERT OR REPLACE INTO asset_sources(url,sha256,host,tier,fetched_at,content_type,width,height,bytes,item_ref,referer,source_note) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)",
        )
        .run(
          url,
          check.sha256!,
          host,
          tier.name,
          (ctx.now ?? (() => new Date().toISOString()))(),
          res.contentType!,
          check.width!,
          check.height!,
          check.bytes,
          itemRef,
          referer,
          sourceNote,
        );
      return { ok: true, tier: tier.name, sha256: check.sha256, duplicate: !!known };
    } catch (e) {
      logAttempt(ctx, url, "image", tier.name, false, String((e as Error).message));
    }
  }
  return { ok: false };
}

/** robots.txt is never read; the checker is kept so cascade callers keep one signature. */
export function makeRobotsChecker(_fetchText?: (url: string) => Promise<string | null>, _ownHosts = OWN_HOSTS) {
  return async (_url: string): Promise<boolean> => true;
}

// ----------------------------------------------------------------- import plan

export function filterQueries(): string {
  return [
    "-- Staged assets per source host",
    "SELECT host, COUNT(*) urls, COUNT(DISTINCT sha256) distinct_assets FROM asset_sources GROUP BY host ORDER BY urls DESC;",
    "-- Tier that produced each asset",
    "SELECT tier, COUNT(*) FROM asset_sources GROUP BY tier;",
    "-- Items that got at least one candidate asset",
    "SELECT item_ref, COUNT(DISTINCT sha256) n FROM asset_sources WHERE item_ref IS NOT NULL GROUP BY item_ref ORDER BY n DESC;",
    "-- Owner filter example: keep only declared sources",
    "SELECT a.path, s.url, s.item_ref FROM asset_sources s JOIN assets a USING(sha256) WHERE s.source_note LIKE 'declared:%';",
    "-- Missing items with no staged asset",
    "SELECT m.category, COUNT(*) FROM missing_items m WHERE NOT EXISTS (SELECT 1 FROM asset_sources s WHERE s.item_ref = m.item_ref OR m.item_ref LIKE s.item_ref || ':%') GROUP BY m.category;",
  ].join("\n");
}

export function importPlan(home: string): string {
  return `# Dry-run import plan (nothing below has been executed)

Staging: ${home}/staging.sqlite, files in ${home}/assets/<sha[0:2]>/<sha256>.<ext>

1. Filter (owner decision) with the queries in ${home}/filter-queries.sql, then export the kept rows.
2. Databook pages (images + text), existing routes and scripts:
   - Image upload to the CDN: apps/site/scripts uses the R2 episode/asset scripts; see
     scripts/ops/cdn-optimize.ts and scripts/ops/public-cdn-catalog.ts (dry run first).
   - Page records: PATCH https://dragonballfr.com/api/databooks/<id>/pages (Bearer $DATABOOKS_API_TOKEN),
     body {"mode":"merge","pages":[{"number":N,"image":"<cdn url>"}]}.
   - Transcriptions (never overwrites with empty text):
     bun apps/site/scripts/depose-transcriptions.ts <results.jsonl> --simulation   # then without the flag
     bun apps/site/scripts/databooks.ts verifie <results.jsonl> && bun apps/site/scripts/databooks.ts depose <results.jsonl>
   - Databooks are frozen for OCR/translation writes (databooks-freeze); the owner lifts the freeze first.
3. Manga volumes: scripts/ops/import-manga-readers.ts (dry run) and scripts/ops/manga-publication-worker.ts;
   cover/pages through the CDN projection scripts/ops/manga-cdn-projection.ts.
4. Required tokens (unset here): DBFR_TOKEN, SHENRON_API_ADMIN_TOKEN, SHENRON_DATABOOKS_API_TOKEN / DATABOOKS_API_TOKEN.
5. Verification after import:
   curl -s https://dragonballfr.com/api/databooks/<id> | bun -e 'const j=await Bun.stdin.json();console.log(j.pages.length, j.pages.filter(p=>!p.image).length)'
   bun scripts/ops/planches-complete.ts missing --home ${home}   # recount, expect lower counts
`;
}

/** A seed that hangs in any tier must not stall the campaign. */
export async function withDeadline<T>(
  p: Promise<T>,
  ms: number,
  url: string,
  db: Database,
): Promise<T | null> {
  let timer: Timer | undefined;
  const res = await Promise.race([
    p,
    new Promise<null>((r) => {
      timer = setTimeout(() => r(null), ms);
    }),
  ]);
  clearTimeout(timer);
  if (res === null)
    db.query("INSERT INTO attempts(url,purpose,tier,ok,detail,at) VALUES(?,?,?,?,?,?)").run(
      url,
      "page",
      "deadline",
      0,
      `no result in ${ms} ms`,
      new Date().toISOString(),
    );
  return res;
}

// ------------------------------------------------------------------------- CLI

async function getJson<T>(url: string): Promise<T> {
  const r = await fetch(url, {
    headers: { "user-agent": UA },
    signal: AbortSignal.timeout(30_000),
  });
  if (!r.ok) throw new Error(`${url} -> ${r.status}`);
  return (await r.json()) as T;
}

export async function cmdMissing(home: string, origin: string, limiter: HostLimiter) {
  const databooks: DatabookLite[] = [];
  for (let off = 0; ; off += 100) {
    const j = await limiter.run(hostOf(origin), () =>
      getJson<{ items: DatabookLite[]; total: number }>(
        `${origin}/api/databooks?limit=100&offset=${off}`,
      ),
    );
    databooks.push(...j.items);
    if (!j.items.length || databooks.length >= j.total) break;
  }
  const cov = await getJson<{ observedAt: string; volumes: VolumeLite[] }>(
    `${origin}/api/manga/coverage`,
  );
  const { counts, items } = computeMissing(databooks, cov.volumes);
  const out = {
    schema: "shenron-missing-planches/v1",
    generatedAt: new Date().toISOString(),
    provenance: {
      origin,
      databooks: `${origin}/api/databooks (public, visible rows)`,
      manga: `${origin}/api/manga/coverage observedAt=${cov.observedAt}`,
      definition:
        "databook page = element of bot.db_databooks.pages {number,image,text}; missing = no pages, page without image, page without text. Manga volume without listed pages (coverage.hasListedPages=false).",
    },
    counts,
    items,
  };
  await Bun.write(join(home, "missing.json"), JSON.stringify(out, null, 2));
  const db = openStagingDb(join(home, "staging.sqlite"));
  const ins = db.query(
    "INSERT OR REPLACE INTO missing_items(item_ref,category,detail,source_url,found_at) VALUES(?,?,?,?,?)",
  );
  const rec = db.query(
    "INSERT OR REPLACE INTO plate_records(item_ref,kind,owner_id,page,image_present,text_ja,text_fr,text_origin,note) VALUES(?,?,?,?,?,?,?,?,?)",
  );
  db.transaction(() => {
    for (const i of items)
      ins.run(i.item_ref, i.category, JSON.stringify(i.detail), i.source_url, out.generatedAt);
    for (const b of databooks)
      for (const p of b.pages ?? [])
        if (!p.image || !p.text)
          rec.run(
            `databook:${b.id}:p${p.number}`,
            "databook-page",
            b.id,
            p.number,
            p.image ? 1 : 0,
            p.text ?? null,
            p.text_fr ?? null,
            p.text ? "live-api" : null,
            "fields without evidence stay empty",
          );
  })();
  return { out, databooks, volumes: cov.volumes, db };
}

if (import.meta.main) {
  const args = Bun.argv.slice(2);
  const cmd = args[0] ?? "all";
  const flag = (n: string, d: string) => {
    const i = args.indexOf(n);
    return i >= 0 ? args[i + 1]! : d;
  };
  const home = flag("--home", `${process.env.HOME}/apps/shenron-planches`);
  const origin = flag("--origin", "https://dragonballfr.com");
  const maxImages = Number(flag("--max-images", "400"));
  await mkdir(join(home, "assets"), { recursive: true });
  const limiter = new HostLimiter(600, 2);
  const { databooks, volumes, db } = await cmdMissing(home, origin, limiter);
  console.log("missing.json written");
  if (cmd === "missing") process.exit(0);

  const ctx: CascadeCtx = {
    db,
    tiers: realTiers(),
    limiter,
    assetDir: join(home, "assets"),
    robots: makeRobotsChecker(async (u) => {
      const r = await fetch(u, {
        headers: { "user-agent": UA },
        signal: AbortSignal.timeout(15_000),
      });
      return r.status === 404 || r.status === 410 ? "" : r.ok ? await r.text() : null;
    }),
  };
  if (cmd === "discover" || cmd === "all") {
    const seeds = new Map<string, { ref: string; note: string }>();
    const empty = databooks.filter(
      (b) => !(b.pages ?? []).length || (b.pages ?? []).some((p) => !p.image),
    );
    for (const b of empty) {
      seeds.set(`${origin}/wiki/databooks/${b.id}`, {
        ref: `databook:${b.id}`,
        note: "declared: dragonballfr.com own page",
      });
      if (b.source_url)
        seeds.set(b.source_url, {
          ref: `databook:${b.id}`,
          note: "unknown: databook source_url, publisher/third-party page",
        });
    }
    for (const v of volumes.filter((x) => !x.hasListedPages)) {
      try {
        const d = await getJson<{ source_url: string | null; cover_image: string | null }>(
          `${origin}/api/manga/volume/${v.id}`,
        );
        if (d.source_url)
          seeds.set(d.source_url, {
            ref: `manga-volume:${v.id}`,
            note: "unknown: volume source_url (publisher page)",
          });
        if (d.cover_image) {
          db.query(
            "INSERT OR IGNORE INTO candidates(url,host,kind,parent_url,item_ref,discovered_tier,source_note,discovered_at) VALUES(?,?,?,?,?,?,?,?)",
          ).run(
            d.cover_image,
            hostOf(d.cover_image),
            "image",
            `${origin}/api/manga/volume/${v.id}`,
            `manga-volume:${v.id}`,
            "fetch",
            "declared: own CDN cover",
            new Date().toISOString(),
          );
        }
      } catch {}
      await Bun.sleep(600);
    }
    console.log(`seeds: ${seeds.size}`);
    for (const [url, s] of seeds) {
      const done = db.query("SELECT 1 FROM attempts WHERE url=? AND purpose='page'").get(url);
      if (done) continue; // resumable
      await withDeadline(discoverPage(ctx, url, s.ref, s.note), 150_000, url, db);
    }
  }
  if (cmd === "stage" || cmd === "all") {
    const rows = db
      .query(
        "SELECT url,parent_url,item_ref,source_note FROM candidates WHERE kind='image' AND url NOT IN (SELECT url FROM asset_sources) AND url NOT IN (SELECT url FROM attempts WHERE purpose='image') LIMIT ?",
      )
      .all(maxImages) as {
      url: string;
      parent_url: string | null;
      item_ref: string | null;
      source_note: string;
    }[];
    // up to 3 hosts in parallel; each host is throttled by the limiter
    const queue = [...rows];
    await Promise.all(
      Array.from({ length: 3 }, async () => {
        for (let r = queue.shift(); r; r = queue.shift())
          await stageImage(ctx, r.url, r.parent_url, r.item_ref, r.source_note);
      }),
    );
  }
  await Bun.write(join(home, "filter-queries.sql"), filterQueries() + "\n");
  await Bun.write(join(home, "import-plan.md"), importPlan(home));
  console.log(
    db
      .query(
        "SELECT host, COUNT(*) urls, COUNT(DISTINCT sha256) assets FROM asset_sources GROUP BY host",
      )
      .all(),
  );
  process.exit(0);
}
