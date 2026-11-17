#!/usr/bin/env bun
/**
 * yolo-web-asset-harvest.ts — extraction d'assets (scrape Markdown).
 *
 * Le scrape Markdown passe par YOLO WEB (yoloWebScrape).
 *
 * Pipeline (aligné shenron crawl) :
 *  1. yoloWebScrape(url)                           → MD + extraction liens média
 *  2. Download des URLs image/audio découvertes → public/{sfx,dbz,sprites}/bxc/
 *
 * Usage :
 *   bun apps/site/scripts/yolo-web-asset-harvest.ts
 *   bun apps/site/scripts/yolo-web-asset-harvest.ts --delay 800
 *   bun apps/site/scripts/yolo-web-asset-harvest.ts --max-sources 1
 *
 * Voir aussi : `bun apps/bot/scripts/rag-harvest.ts run-seeds`
 */
import { Database } from "bun:sqlite";
import { mkdirSync, writeFileSync, existsSync, readFileSync, appendFileSync } from "node:fs";
import { join, dirname, basename, extname } from "node:path";
import { createHash } from "node:crypto";
import { yoloWebScrape } from "@aphrody/shenron-pipeline/yolo-web";
import { BOT_HOST, CDN_ORIGIN, SITE_URL } from "../src/lib/config";

const SITE_ROOT = join(import.meta.dir, "..");
const PUBLIC = join(SITE_ROOT, "public");
// La moisson n'écrit plus dans `public/` : elle y avait déposé 411 fichiers
// et 86 Mo — dont dix-neuf SVG appartenant à des tiers (wordmarks Wikipédia,
// icône Toei) — que le site rediffusait sur son propre domaine sans qu'aucune
// ligne de code ni de base n'y renvoie. Le dépôt reste hors du dossier servi ;
// ce qui doit être publié passe par une étape de tri explicite.
const MOISSON = join(process.env.HOME ?? SITE_ROOT, "shenron-media-masters", "yolo-web-harvest");
const OUT_AUDIO = join(MOISSON, "audio");
const OUT_IMG = join(MOISSON, "images");
const OUT_SPRITES = join(MOISSON, "sprites");
const BOT_ASSET_ROOT = join(SITE_ROOT, "..", "bot", "assets", "ext", "bxc");
// Inventaire et journal hors de `public/` : ils nommaient les sources
// moissonnées et les chemins internes, en lecture libre sur le domaine.
const INVENTAIRES = join(SITE_ROOT, "scripts", "inventaires");
const INV = join(INVENTAIRES, "yolo-web-asset-inventory.json");
const LOG = join(INVENTAIRES, "yolo-web-asset-harvest.log");

// CLI
const argv = process.argv.slice(2);
function opt(name: string, dflt?: string): string | undefined {
  const i = argv.indexOf(`--${name}`);
  if (i >= 0 && argv[i + 1] && !argv[i + 1]!.startsWith("--")) return argv[i + 1];
  return dflt;
}
const delayMs = parseInt(opt("delay", "800")!, 10);
const maxSources = Math.max(1, parseInt(opt("max-sources", String(Number.MAX_SAFE_INTEGER))!, 10));
const CDN_BASE = (process.env.BXC_ASSET_CDN_BASE ?? BOT_HOST).replace(/\/$/, "");
const CDN_ALLOWED_ORIGINS = new Set(
  (process.env.BXC_ASSET_CDN_ALLOWED_ORIGINS ?? [SITE_URL, BOT_HOST, CDN_ORIGIN].join(","))
    .split(",")
    .map((origin) => origin.trim().replace(/\/$/, ""))
    .filter(Boolean),
);

type Source = { id: string; name: string; url: string; mode: "recon" | "mirror" | "both" };

/**
 * Catalogue massif de sources (officielles + éditoriales + hubs assets).
 * Aligné rag-harvest db_sources + seeds Wiki/Bandai/Toei/Shueisha/Viz.
 */
const SOURCES: Source[] = [
  // ── Officiel Toei / Shueisha / Bandai ───────────────────────────────────
  {
    id: "dbofficial-fr",
    name: "DB Official FR",
    url: "https://fr.dragon-ball-official.com/",
    mode: "both",
  },
  {
    id: "dbofficial-en",
    name: "DB Official EN",
    url: "https://en.dragon-ball-official.com/",
    mode: "both",
  },
  // dbofficial-jp : domaine super-official souvent down — on garde le hub EN games
  {
    id: "dbofficial-games-hub",
    name: "DB Official games hub",
    url: "https://en.dragon-ball-official.com/games",
    mode: "both",
  },
  {
    id: "dbofficial-news",
    name: "DB Official news hub",
    url: "https://en.dragon-ball-official.com/news",
    mode: "recon",
  },
  {
    id: "dbofficial-fr-news",
    name: "DB Official FR news",
    url: "https://fr.dragon-ball-official.com/news",
    mode: "recon",
  },
  {
    id: "dbofficial-anime",
    name: "DB Official anime",
    url: "https://en.dragon-ball-official.com/anime",
    mode: "recon",
  },
  {
    id: "dbofficial-manga",
    name: "DB Official manga",
    url: "https://en.dragon-ball-official.com/manga",
    mode: "recon",
  },
  {
    id: "dbofficial-games",
    name: "DB Official games",
    url: "https://en.dragon-ball-official.com/games",
    mode: "recon",
  },
  {
    id: "bandai-eu",
    name: "Bandai EU Dragon Ball",
    url: "https://en.bandainamcoent.eu/dragon-ball",
    mode: "both",
  },
  {
    id: "bandai-eu-fr",
    name: "Bandai FR Dragon Ball",
    url: "https://www.bandainamcoent.eu/fr/dragon-ball",
    mode: "both",
  },
  {
    id: "bandai-news",
    name: "Bandai EU news",
    url: "https://en.bandainamcoent.eu/news",
    mode: "recon",
  },
  {
    id: "bandai-fighterz",
    name: "Bandai FighterZ",
    url: "https://en.bandainamcoent.eu/games/dragon-ball-fighterz",
    mode: "both",
  },
  {
    id: "bandai-sparking",
    name: "Bandai Sparking Zero",
    url: "https://en.bandainamcoent.eu/games/dragon-ball-sparking-zero",
    mode: "both",
  },
  {
    id: "bandai-xenoverse2",
    name: "Bandai Xenoverse 2",
    url: "https://en.bandainamcoent.eu/games/dragon-ball-xenoverse-2",
    mode: "recon",
  },
  {
    id: "bandai-dokkan",
    name: "Bandai Dokkan",
    url: "https://en.bandainamcoent.eu/games/dragon-ball-z-dokkan-battle",
    mode: "recon",
  },
  {
    id: "bandai-legends",
    name: "Bandai Legends",
    url: "https://en.bandainamcoent.eu/games/dragon-ball-legends",
    mode: "recon",
  },
  // www.bandainamcoent.com/games/dragon-ball → 404 (probe) : non listé
  {
    id: "toei-catalog",
    name: "Toei catalog DB",
    url: "https://www.toei-animation.com/catalog/dragon-ball/",
    mode: "both",
  },
  {
    id: "toei-home",
    name: "Toei Animation home",
    url: "https://www.toei-animation.com/",
    mode: "recon",
  },
  {
    id: "toei-jp-db",
    name: "Toei JP Dragon Ball",
    url: "https://www.toei-anim.co.jp/tv/dragon/",
    mode: "recon",
  },
  {
    id: "toei-jp-super",
    name: "Toei JP Super",
    url: "https://www.toei-anim.co.jp/special/dragonball_s/",
    mode: "recon",
  },
  {
    id: "shueisha",
    name: "Shueisha corporate",
    url: "https://www.shueisha.co.jp/en/",
    mode: "recon",
  },
  {
    id: "shonenjump-plus",
    name: "Shonen Jump+",
    url: "https://shonenjumpplus.com/",
    mode: "recon",
  },
  { id: "viz-db", name: "Viz Dragon Ball", url: "https://www.viz.com/dragon-ball", mode: "recon" },
  {
    id: "viz-dbs",
    name: "Viz DB Super chapters",
    url: "https://www.viz.com/shonenjump/chapters/dragon-ball-super",
    mode: "recon",
  },
  // ── News / presse ──────────────────────────────────────────────────────
  {
    id: "dbnews-fr",
    name: "dragonball.news FR",
    url: "https://dragonball.news/fr/",
    mode: "recon",
  },
  { id: "dbnews-en", name: "dragonball.news EN", url: "https://dragonball.news/", mode: "recon" },
  {
    id: "dbnews-games",
    name: "dragonball.news games",
    url: "https://dragonball.news/category/games/",
    mode: "recon",
  },
  // ── Référence fan historique ───────────────────────────────────────────
  { id: "kanzenshuu", name: "Kanzenshuu", url: "https://www.kanzenshuu.com/", mode: "mirror" },
  {
    id: "kanzenshuu-guides",
    name: "Kanzenshuu guides",
    url: "https://www.kanzenshuu.com/guides/",
    mode: "mirror",
  },
  // episode-guides/ → 404 (probe) — utiliser /episodes/ si dispo
  {
    id: "kanzenshuu-episodes",
    name: "Kanzenshuu episodes",
    url: "https://www.kanzenshuu.com/episodes/",
    mode: "recon",
  },
  {
    id: "kanzenshuu-movies",
    name: "Kanzenshuu movies",
    url: "https://www.kanzenshuu.com/movies/",
    mode: "recon",
  },
  {
    id: "kanzenshuu-manga",
    name: "Kanzenshuu manga",
    url: "https://www.kanzenshuu.com/manga/",
    mode: "recon",
  },
  {
    id: "kanzenshuu-reference",
    name: "Kanzenshuu reference",
    url: "https://www.kanzenshuu.com/reference/",
    mode: "recon",
  },
  // ── Super wiki ─────────────────────────────────────────────────────────
  // ── Wikipedia ──────────────────────────────────────────────────────────
  {
    id: "wiki-db",
    name: "Wikipedia Dragon Ball",
    url: "https://en.wikipedia.org/wiki/Dragon_Ball",
    mode: "recon",
  },
  {
    id: "wiki-dbz",
    name: "Wikipedia DBZ",
    url: "https://en.wikipedia.org/wiki/Dragon_Ball_Z",
    mode: "recon",
  },
  {
    id: "wiki-dbs",
    name: "Wikipedia Super",
    url: "https://en.wikipedia.org/wiki/Dragon_Ball_Super",
    mode: "recon",
  },
  {
    id: "wiki-gt",
    name: "Wikipedia GT",
    url: "https://en.wikipedia.org/wiki/Dragon_Ball_GT",
    mode: "recon",
  },
  {
    id: "wiki-toriyama",
    name: "Wikipedia Toriyama",
    url: "https://en.wikipedia.org/wiki/Akira_Toriyama",
    mode: "recon",
  },
  {
    id: "wiki-fr-db",
    name: "Wikipedia FR DB",
    url: "https://fr.wikipedia.org/wiki/Dragon_Ball",
    mode: "recon",
  },
  {
    id: "wiki-fr-dbz",
    name: "Wikipedia FR DBZ",
    url: "https://fr.wikipedia.org/wiki/Dragon_Ball_Z",
    mode: "recon",
  },
  // ── API / data ─────────────────────────────────────────────────────────
  {
    id: "dragonball-api",
    name: "dragonball-api web",
    url: "https://web.dragonball-api.com/",
    mode: "mirror",
  },
  { id: "jikan", name: "Jikan MAL API", url: "https://jikan.moe/", mode: "recon" },
  {
    id: "mal-db",
    name: "MyAnimeList DB",
    url: "https://myanimelist.net/anime/223/Dragon_Ball",
    mode: "recon",
  },
  {
    id: "mal-dbz",
    name: "MyAnimeList DBZ",
    url: "https://myanimelist.net/anime/813/Dragon_Ball_Z",
    mode: "recon",
  },
  {
    id: "anilist",
    name: "AniList search",
    url: "https://anilist.co/search/anime?search=Dragon%20Ball",
    mode: "recon",
  },
  {
    id: "kitsu",
    name: "Kitsu explore",
    url: "https://kitsu.io/explore/anime?text=dragon%20ball",
    mode: "recon",
  },
  // ── Sprites / game assets catalogs ─────────────────────────────────────
  {
    id: "spriters-ssw2",
    name: "Spriters SSW2",
    url: "https://www.spriters-resource.com/ds_dsi/dbzsupersonicwarriors2/",
    mode: "mirror",
  },
  {
    id: "spriters-aots",
    name: "Spriters Attack of Saiyans",
    url: "https://www.spriters-resource.com/ds_dsi/dragonballzattackofthesaiyans/",
    mode: "mirror",
  },
  {
    id: "spriters-extreme",
    name: "Spriters Extreme Butouden",
    url: "https://www.spriters-resource.com/nintendo_3ds/dragonballzextremebutouden/",
    mode: "mirror",
  },
  {
    id: "spriters-search",
    name: "Spriters search DB",
    url: "https://www.spriters-resource.com/search/?q=dragon+ball",
    mode: "recon",
  },
  // ── Streaming editorial pages (key art only) ───────────────────────────
  {
    id: "crunchyroll-dbs",
    name: "Crunchyroll Super",
    url: "https://www.crunchyroll.com/series/G63VGG2NY/dragon-ball-super",
    mode: "recon",
  },
];

type AssetHit = {
  url: string;
  type: string;
  fromPage: string;
  via: "yolo-web-scrape";
};

type DlRec = {
  url: string;
  path: string;
  kind: "audio" | "image" | "other";
  fromPage: string;
  via: string;
  ok: boolean;
  bytes: number;
  error: string | null;
  cdnPath?: string | null;
  cdnUrl?: string | null;
};

function log(line: string) {
  console.log(line);
  appendFileSync(LOG, line + "\n");
}

const MEDIA_URL_RE =
  /https?:\/\/[^\s"'<>\\]+\.(?:mp3|wav|ogg|m4a|png|jpe?g|webp|gif|svg|avif)(?:\?[^\s"'<>\\]*)?/gi;

function extractFromMarkdown(md: string, page: string): AssetHit[] {
  const hits: AssetHit[] = [];
  const seen = new Set<string>();
  for (const m of md.matchAll(MEDIA_URL_RE)) {
    const url = m[0]!.replace(/[),.;]+$/, "");
    if (seen.has(url)) continue;
    seen.add(url);
    const type = /\.(mp3|wav|ogg|m4a)(\?|$)/i.test(url) ? "audio" : "image";
    hits.push({ url, type, fromPage: page, via: "yolo-web-scrape" });
  }
  return hits;
}

function classify(url: string): "audio" | "image" | "other" {
  if (/\.(mp3|wav|ogg|m4a)(\?|$)/i.test(url)) return "audio";
  if (/\.(png|jpe?g|webp|gif|svg|avif)(\?|$)/i.test(url)) return "image";
  return "other";
}

function destPath(url: string, kind: "audio" | "image" | "other"): string {
  const clean = url.split("?")[0]!;
  let name = basename(clean).replace(/[^a-zA-Z0-9._-]+/g, "_");
  if (!name || name === "_" || name.length < 3) {
    name = createHash("sha1").update(url).digest("hex").slice(0, 16) + (extname(clean) || ".bin");
  }
  if (name.length > 140) name = name.slice(-140);
  if (kind === "audio") return join(OUT_AUDIO, name);
  if (kind === "image") {
    const low = url.toLowerCase();
    if (low.includes("sprite") || low.includes("sheet") || low.includes("spriters")) {
      return join(OUT_SPRITES, name);
    }
    return join(OUT_IMG, name);
  }
  return join(OUT_IMG, name);
}

function validBuf(buf: ArrayBuffer, kind: "audio" | "image" | "other"): boolean {
  if (buf.byteLength < 400) return false;
  const u8 = new Uint8Array(buf);
  if (kind === "audio") {
    return (
      (u8[0] === 0x49 && u8[1] === 0x44 && u8[2] === 0x33) ||
      (u8[0] === 0xff && (u8[1]! & 0xe0) === 0xe0) ||
      buf.byteLength > 1500
    );
  }
  if (kind === "image") {
    return (
      (u8[0] === 0x89 && u8[1] === 0x50) ||
      (u8[0] === 0xff && u8[1] === 0xd8) ||
      (u8[0] === 0x47 && u8[1] === 0x49) ||
      (u8[8] === 0x57 && u8[9] === 0x45) ||
      buf.byteLength > 600
    );
  }
  return buf.byteLength > 400;
}

async function downloadOne(hit: AssetHit): Promise<DlRec> {
  const kind = classify(hit.url);
  const dest = destPath(hit.url, kind);
  const rec: DlRec = {
    url: hit.url,
    path: dest.replace(MOISSON + "/", ""),
    kind,
    fromPage: hit.fromPage,
    via: hit.via,
    ok: false,
    bytes: 0,
    error: null,
  };
  if (kind === "other") {
    rec.error = "skip non-media";
    return rec;
  }
  try {
    if (existsSync(dest)) {
      const st = await Bun.file(dest).arrayBuffer();
      if (st.byteLength > 400) {
        rec.ok = true;
        rec.bytes = st.byteLength;
        return rec;
      }
    }
    const res = await fetch(hit.url, {
      headers: {
        "User-Agent": "DBFR-yolo-web-harvest/2.0 (shenron rag-harvest pattern; rights FR)",
        Referer: hit.fromPage,
      },
      signal: AbortSignal.timeout(40_000),
    });
    if (!res.ok) {
      rec.error = `HTTP ${res.status}`;
      return rec;
    }
    const buf = await res.arrayBuffer();
    if (!validBuf(buf, kind)) {
      rec.error = `invalid ${kind} ${buf.byteLength}B`;
      return rec;
    }
    mkdirSync(dirname(dest), { recursive: true });
    await Bun.write(dest, buf);
    rec.ok = true;
    rec.bytes = buf.byteLength;
    return rec;
  } catch (e) {
    rec.error = e instanceof Error ? e.message : String(e);
    return rec;
  }
}

function cdnEligible(url: string): boolean {
  try {
    return CDN_ALLOWED_ORIGINS.has(new URL(url).origin);
  } catch {
    return false;
  }
}

async function promoteToCdn(records: DlRec[]): Promise<number> {
  mkdirSync(BOT_ASSET_ROOT, { recursive: true });
  let promoted = 0;
  for (const record of records) {
    if (!record.ok || !cdnEligible(record.url)) {
      record.cdnPath = null;
      record.cdnUrl = null;
      continue;
    }
    const extension =
      extname(record.path).toLowerCase() || (record.kind === "audio" ? ".mp3" : ".bin");
    const key = `${createHash("sha256").update(record.url).digest("hex").slice(0, 24)}${extension}`;
    const relativePath = `./assets/ext/bxc/${key}`;
    const destination = join(BOT_ASSET_ROOT, key);
    if (!existsSync(destination)) {
      await Bun.write(destination, await Bun.file(join(MOISSON, record.path)).arrayBuffer());
    }
    record.cdnPath = relativePath;
    record.cdnUrl = `${CDN_BASE}/assets/ext/bxc/${key}`;
    promoted++;
  }
  return promoted;
}

async function harvestSource(src: (typeof SOURCES)[0]): Promise<AssetHit[]> {
  const hits: AssetHit[] = [];

  {
    // 1) scrape markdown through YOLO WEB
    log(`[*] YOLO WEB scrape ${src.url}`);
    try {
      const markdown = await yoloWebScrape(src.url, {});
      if (markdown.length > 80) {
        const mdHits = extractFromMarkdown(markdown, src.url);
        log(`  [scrape] ${mdHits.length} media URLs from markdown (${markdown.length} chars)`);
        hits.push(...mdHits);
        const mdDir = join(MOISSON, "brut", src.id);
        mkdirSync(mdDir, { recursive: true });
        writeFileSync(join(mdDir, "page.md"), markdown);
      }
    } catch (error) {
      log(`  [scrape] failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  return hits;
}

/** Fusionne les sources statiques + db_sources SQLite bot (comme rag-harvest). */
function loadAllSources(): Source[] {
  const map = new Map<string, Source>();
  for (const s of SOURCES) map.set(s.url, s);
  // bot.db sources table
  try {
    const dbPath = join(SITE_ROOT, "../bot/data/bot.db");
    if (existsSync(dbPath)) {
      const db = new Database(dbPath, { readonly: true });
      const rows = db
        .query(`SELECT id, name, url FROM db_sources WHERE url LIKE 'http%'`)
        .all() as { id: string; name: string; url: string }[];
      db.close();
      for (const r of rows) {
        if (!map.has(r.url)) {
          map.set(r.url, {
            id: r.id,
            name: r.name,
            url: r.url,
            mode: "recon",
          });
        }
      }
      log(`  [db_sources] +${rows.length} rows from bot.db`);
    }
  } catch (e) {
    log(`  [db_sources] skip: ${e instanceof Error ? e.message : e}`);
  }
  return [...map.values()];
}

async function main() {
  mkdirSync(OUT_AUDIO, { recursive: true });
  mkdirSync(OUT_IMG, { recursive: true });
  mkdirSync(OUT_SPRITES, { recursive: true });
  writeFileSync(
    LOG,
    `=== Shenron asset harvest through YOLO WEB ${new Date().toISOString()} ===\n`,
  );

  const sources = loadAllSources().slice(0, maxSources);
  log(`[*] ${sources.length} sources uniques (catalogue + db_sources)`);

  const allHits: AssetHit[] = [];
  const seen = new Set<string>();

  for (let i = 0; i < sources.length; i++) {
    const src = sources[i]!;
    log(`\n=== [${i + 1}/${sources.length}] ${src.id} ${src.url}`);
    if (i > 0 && delayMs > 0) await Bun.sleep(delayMs);
    try {
      const hits = await harvestSource(src);
      for (const h of hits) {
        if (!seen.has(h.url)) {
          seen.add(h.url);
          allHits.push(h);
        }
      }
    } catch (e) {
      log(`  ERROR: ${e instanceof Error ? e.message : e}`);
    }
  }

  log(`\n[*] Download ${allHits.length} unique media URLs…`);
  const results: DlRec[] = [];
  // sequential-ish batches to avoid hammering
  const batch = 6;
  for (let i = 0; i < allHits.length; i += batch) {
    const slice = allHits.slice(i, i + batch);
    const part = await Promise.all(slice.map(downloadOne));
    results.push(...part);
    const okN = part.filter((r) => r.ok).length;
    log(`  batch ${i / batch + 1}: ${okN}/${slice.length} ok`);
  }

  const ok = results.filter((r) => r.ok);
  const promoted = await promoteToCdn(results);
  const inv = {
    generatedAt: new Date().toISOString(),
    engine: "yolo-web",
    summary: {
      sources: sources.length,
      uniqueUrls: allHits.length,
      ok: ok.length,
      fail: results.length - ok.length,
      bytes: ok.reduce((s, r) => s + r.bytes, 0),
      audio: ok.filter((r) => r.kind === "audio").length,
      images: ok.filter((r) => r.kind === "image").length,
      cdnPromoted: promoted,
    },
    sourceIds: sources.map((s) => s.id),
    records: results,
  };
  writeFileSync(INV, JSON.stringify(inv, null, 2));
  log(`\n✓ ${ok.length} assets / ${(inv.summary.bytes / 1024 / 1024).toFixed(2)} MiB → ${INV}`);

  // Promote audio into public/sfx/ if new
  for (const r of ok.filter((x) => x.kind === "audio")) {
    const name = basename(r.path);
    const dest = join(PUBLIC, "sfx", name);
    if (!existsSync(dest)) {
      const src = join(MOISSON, r.path);
      if (existsSync(src)) {
        writeFileSync(dest, readFileSync(src));
        log(`  → promoted sfx/${name}`);
      }
    }
  }

  if (ok.length < 1) process.exit(2);
}

if (import.meta.main) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
