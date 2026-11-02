#!/usr/bin/env bun
// SPDX-License-Identifier: Apache-2.0
/**
 * beerus-sync: keeps Dragon Ball Super: Beerus (series DBS_BEERUS) current without a human.
 *
 *   bun scripts/ops/beerus-sync.ts [--apply] [--complete] [--crawl]
 *
 * 1. Reads the episode table of the English Wikipedia article and the official site (dragonball-super.com).
 * 2. Adds each announced episode that has no row in bot.db_episodes and fills the empty fields of the others
 *    (existing values are never overwritten).
 * 3. With --complete, runs complete-episode.ts (Bun Video frames, subtitles, metadata, CDN) for every episode whose
 *    first-party video answers and that still has fewer than 20 frames.
 * 4. With --crawl, crawls the official site with the web engine and publishes the new image assets to the CDN.
 *
 * Without --apply it prints the SQL it would run. Needs SHENRON_ADMIN_TOKEN, the Cloudflare env and ssh access to dbfr.
 */
import { join } from "node:path";

const apply = process.argv.includes("--apply");
const complete = process.argv.includes("--complete");
const crawl = process.argv.includes("--crawl");
const SERIES = "DBS_BEERUS";
const ARC_ID = 18;
const SITE = "https://dragonballfr.com";
const SSH_HOST = process.env.SHENRON_SSH_HOST ?? "prod";
const ua = {
  "user-agent":
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/155 Safari/537.36 Shenron/1.0",
};
const run = async (cmd: string[], stdin?: string) => {
  const p = Bun.spawn(cmd, {
    stdin: stdin === undefined ? "ignore" : new Blob([stdin]),
    stdout: "pipe",
    stderr: "inherit",
  });
  const out = await new Response(p.stdout).text();
  if (await p.exited) throw new Error(`${cmd[0]} failed`);
  return out;
};
const psql = (sql: string) =>
  run(
    [
      "ssh",
      SSH_HOST,
      "sudo -n docker exec -i shenron-postgres psql -U postgres -d shenron_site -v ON_ERROR_STOP=1 -At",
    ],
    sql,
  );
const lit = (value: unknown) =>
  value === null || value === undefined ? "NULL" : `$q$${String(value)}$q$`;

export interface AnnouncedEpisode {
  number: number;
  titleEn: string | null;
  titleRomaji: string | null;
  titleJa: string | null;
  airDate: number | null;
  summaryEn: string | null;
}

const clean = (value: string | undefined) =>
  value
    ?.replace(/\{\{Ill\|([^|}]*)[^}]*\}\}/g, "$1")
    .replace(/\{\{[^}]*\}\}|<ref[\s\S]*?(?:\/>|<\/ref>)|\[\[(?:[^|\]]*\|)?([^\]]*)\]\]/g, "$1")
    .replace(/''/g, "")
    .trim() || null;

/** Episode rows of the Wikipedia `Episode list` templates. */
export function parseWikipediaEpisodes(wikitext: string): AnnouncedEpisode[] {
  const episodes: AnnouncedEpisode[] = [];
  for (const block of wikitext.split(/\{\{\^?\|?Episode list\b/).slice(1)) {
    const field = (name: string) =>
      clean(new RegExp(`\\|[ \\t]*${name}[ \\t]*=[ \\t]*([^\\n]*)`).exec(block)?.[1]);
    const number = Number(field("EpisodeNumber"));
    if (!Number.isSafeInteger(number)) continue;
    const date = /Start date\|(\d{4})\|(\d{1,2})\|(\d{1,2})/.exec(block);
    episodes.push({
      number,
      titleEn: field("Title"),
      titleRomaji: field("TranslitTitle"),
      titleJa: field("NativeTitle"),
      airDate: date
        ? Math.floor(Date.UTC(Number(date[1]), Number(date[2]) - 1, Number(date[3])) / 1000)
        : null,
      summaryEn: field("ShortSummary"),
    });
  }
  return episodes.toSorted((a, b) => a.number - b.number);
}

/** French working title when the French broadcaster has not published one: a plain translation, flagged as such. */
const FRENCH_TITLES: Record<string, string> = {
  "The God Who Destroys": "Le dieu de la Destruction",
  "The God of Destruction Heads to the Planet of the Kai":
    "Le dieu de la Destruction se rend sur la planète de Kaïo",
  "The God of Destruction Heads to Earth": "Le dieu de la Destruction se dirige vers la Terre",
  "The God of Saiyans": "Le dieu des Saiyans",
};

if (import.meta.main) {
  const wiki = (await (
    await fetch(
      "https://en.wikipedia.org/w/api.php?action=parse&page=Dragon_Ball_Super:_Beerus&prop=wikitext&format=json",
      { headers: ua },
    )
  ).json()) as any;
  const announced = parseWikipediaEpisodes(wiki.parse.wikitext["*"]).filter((e) => e.titleEn);

  // The official page lists each episode as « NN / Japanese title / synopsis ».
  const official = await (await fetch("https://dragonball-super.com/", { headers: ua })).text();
  const lines = official
    .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, " ")
    .replace(/<[^>]+>/g, "\n")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  const officialJa = new Map<number, string>();
  for (let i = 0; i < lines.length - 2; i++) {
    if (/^\d{2}$/.test(lines[i]!) && !/^\d+$/.test(lines[i + 1]!) && lines[i + 1]!.length < 40)
      officialJa.set(Number(lines[i]), lines[i + 1]!);
  }

  const rows = (
    await psql(
      `select id, number_in_series from bot.db_episodes where series = ${lit(SERIES)} order by number_in_series`,
    )
  )
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((l) => l.split("|").map(Number));
  const have = new Map(rows.map(([id, n]) => [n!, id!]));
  const statements: string[] = ["BEGIN;"];
  let nextId = Number((await psql("select max(id) from bot.db_episodes")).trim()) + 1;
  for (const e of announced) {
    const officialTitle = officialJa.get(e.number);
    const ja =
      e.titleJa ??
      (officialTitle && /[\u3040-\u30ff\u4e00-\u9fff]/.test(officialTitle) ? officialTitle : null);
    const titleFr = e.titleEn ? (FRENCH_TITLES[e.titleEn] ?? e.titleEn) : null;
    if (!have.has(e.number)) {
      statements.push(
        `INSERT INTO bot.db_episodes (id, series, number_in_series, title, title_ja, title_romaji, arc_id, air_date, image, visible, official_source_url) VALUES (${nextId++}, ${lit(SERIES)}, ${e.number}, ${lit(titleFr)}, ${lit(ja)}, ${lit(e.titleRomaji)}, ${ARC_ID}, ${e.airDate ?? "NULL"}, '/banners/dbs-beerus-2026.jpg', true, 'https://dragonball-super.com/#story');`,
      );
    } else {
      statements.push(
        `UPDATE bot.db_episodes SET title_ja = COALESCE(title_ja, ${lit(ja)}), title_romaji = COALESCE(title_romaji, ${lit(e.titleRomaji)}), arc_id = COALESCE(arc_id, ${ARC_ID}), air_date = COALESCE(air_date, ${e.airDate ?? "NULL"}) WHERE id = ${have.get(e.number)};`,
      );
    }
  }
  statements.push("COMMIT;");
  console.log(
    `announced: ${announced.map((e) => e.number).join(",") || "none"}; in database: ${[...have.keys()].join(",") || "none"}`,
  );
  if (!apply) console.log(statements.join("\n"));
  else if (statements.length > 2)
    console.log((await psql(statements.join("\n"))).trim() || "database updated");

  if (complete) {
    const current = (
      await psql(
        `select id, coalesce(jsonb_array_length(frames), 0) from bot.db_episodes where series = ${lit(SERIES)} order by number_in_series`,
      )
    )
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((l) => l.split("|").map(Number));
    for (const [id, frames] of current) {
      const head = await fetch(`${SITE}/api/episodes/${id}/video`, {
        method: "HEAD",
        headers: ua,
      }).catch(() => null);
      if (!head?.ok || (frames ?? 0) >= 20) continue;
      console.log(`completing episode ${id} (${frames} frames)`);
      const exitCode = await Bun.spawn(
        [
          "bun",
          join(import.meta.dir, "complete-episode.ts"),
          "--id",
          String(id),
          "--arc-id",
          String(ARC_ID),
          ...(apply ? ["--apply"] : []),
        ],
        { stdout: "inherit", stderr: "inherit" },
      ).exited;
      if (exitCode)
        console.error(
          `episode ${id}: complete-episode exited ${exitCode}; the next run retries it`,
        );
    }
  }

  if (crawl) {
    const home = join(process.env.HOME ?? "/tmp", "apps", "shenron-beerus");
    const engine = join(import.meta.dir, "web-engine.ts");
    await Bun.spawn(
      [
        "bun",
        engine,
        "run",
        "--seed",
        "https://dragonball-super.com",
        "--seed",
        "https://dragonball-super.com/en/",
        "--max-depth",
        "2",
        "--max-pages",
        "300",
        "--workers",
        "6",
        "--home",
        home,
      ],
      { stdout: "inherit", stderr: "inherit" },
    ).exited;
    if (apply)
      await Bun.spawn(
        [process.execPath, engine, "publish", "--limit", "500", "--deploy", "--home", home],
        {
          stdout: "inherit",
          stderr: "inherit",
        },
      ).exited;
  }
}
