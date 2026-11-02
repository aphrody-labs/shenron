#!/usr/bin/env bun
// SPDX-License-Identifier: Apache-2.0
/**
 * complete-episode: fills a wiki episode with everything that can be established about it.
 *
 *   bun scripts/ops/complete-episode.ts --id 875 [--dir /tmp/ep875] [--frames 36] [--apply]
 *     [--subtitle-vtt <reviewed.vtt> --subtitle-language <en|fr|ja> --subtitle-label <label>]
 *
 * Sources combined:
 *   - Shenron: the live row (bot API), its first-party MP4 (/api/episodes/<id>/video) and existing frames;
 *   - Bun Video / FilmCraft: metadata and original-resolution PNG frames;
 *   - explicit reviewed WebVTT: optional subtitle input; existing subtitles are otherwise preserved;
 *   - web crawl: the official site (dragonball-super.com, Japanese story, cast and stills) and the English
 *     Wikipedia episode table (native, romanized and English titles, staff, summary).
 * Without --apply it stops after staging everything under --dir and writes plan.json. With --apply it publishes the
 * frames, subtitles and stills to the CDN (additive), updates the origin on dbfr, backs up the row and updates
 * bot.db_episodes in one transaction. Needs SHENRON_ADMIN_TOKEN and the Cloudflare env (see web-engine-cdn.ts).
 */
import { createHash } from "node:crypto";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { livePrefix, mintClient, publishItems, type CdnItem } from "./web-engine-cdn";

const arg = (name: string, fallback?: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : fallback;
};
const id = Number(arg("id"));
if (!Number.isSafeInteger(id)) throw new Error("--id <episode id> is required");
const dir = arg("dir", `/tmp/ep${id}`)!;
const frameTarget = Number(arg("frames", "36"));
const apply = process.argv.includes("--apply");
const BOT = process.env.SHENRON_BOT_URL ?? "https://bot.dragonballfr.com";
const SITE = "https://dragonballfr.com";
const CDN = "https://cdn.dragonballfr.com";
const SSH_HOST = process.env.SHENRON_SSH_HOST ?? "prod";
const sha256 = (bytes: Uint8Array | string) => createHash("sha256").update(bytes).digest("hex");
mkdirSync(join(dir, "frames"), { recursive: true });

// 1. The live row.
const token = process.env.SHENRON_ADMIN_TOKEN;
if (!token) throw new Error("SHENRON_ADMIN_TOKEN is not set");
const row = (await (
  await fetch(`${BOT}/api/database/db_episodes/${id}`, {
    headers: { authorization: `Bearer ${token}` },
  })
).json()) as Record<string, any>;
await Bun.write(join(dir, "row-before.json"), JSON.stringify(row, null, 1));
const existing: any[] = Array.isArray(row.frames) ? row.frames : [];

// 2. Source file (first-party) and Bun Video metadata.
const sourcePath = join(dir, "source.mp4");
if (!(await Bun.file(sourcePath).exists())) {
  const p = Bun.spawn(["curl", "-sf", "-o", sourcePath, `${SITE}/api/episodes/${id}/video`], {
    stderr: "inherit",
  });
  if (await p.exited) throw new Error("source download failed");
}
const sourceBytesHasher = new Bun.CryptoHasher("sha256");
for await (const chunk of Bun.file(sourcePath).stream()) sourceBytesHasher.update(chunk);
const sourceSha = sourceBytesHasher.digest("hex");
const sourceSize = Bun.file(sourcePath).size;
if (!(Bun as any).Video?.available) throw new Error("Bun Video / FilmCraft provider unavailable");
const video = new (Bun as any).Video(sourcePath);
const meta = await video.metadata();
const duration: number = meta.duration ?? meta.durationSeconds;
const width: number = meta.width ?? meta.video?.width;
const height: number = meta.height ?? meta.video?.height;
console.log(JSON.stringify({ sourceSha, sourceSize, duration, width, height }));
const knownSha = existing[0]?.imagePath?.match(/episodes\/\d+\/([a-f0-9]{64})\//)?.[1];

// 3. Frames at new timecodes (existing ones are kept as they are).
const have = existing.map((f) => f.timecodeSec as number);
const times: number[] = [];
const step = (duration - 60) / frameTarget;
for (let i = 0; i < frameTarget; i++) {
  const t = Math.round((30 + step * (i + 0.5)) * 1000) / 1000;
  if (!have.some((h) => Math.abs(h - t) < 8)) times.push(t);
}
const decoder = { bunVideo: 0, cached: 0 };
const cachePath = join(dir, "frames", "index.json");
const cache: Record<string, string> = (await Bun.file(cachePath).exists())
  ? await Bun.file(cachePath).json()
  : {};
const newFrames: { t: number; sha: string; bytes: Uint8Array }[] = [];
let nextFrame = 0;
await Promise.all(
  Array.from({ length: 2 }, async () => {
    while (nextFrame < times.length) {
      const t = times[nextFrame++]!;
      const cachedSha = cache[String(t)];
      if (cachedSha && (await Bun.file(join(dir, "frames", `${cachedSha}.png`)).exists())) {
        newFrames.push({
          t,
          sha: cachedSha,
          bytes: new Uint8Array(
            await Bun.file(join(dir, "frames", `${cachedSha}.png`)).arrayBuffer(),
          ),
        });
        decoder.cached++;
        continue;
      }
      // An unsupported codec or seek is a failed native extraction, never a substituted decoder.
      let bytes: Uint8Array;
      try {
        bytes = new Uint8Array(await new (Bun as any).Video(sourcePath).frame(t).png().bytes());
        decoder.bunVideo++;
      } catch (cause) {
        throw new Error(`Bun Video / FilmCraft could not extract frame at ${t}s`, { cause });
      }
      newFrames.push({ t, sha: sha256(bytes), bytes });
      await Bun.write(join(dir, "frames", `${sha256(bytes)}.png`), bytes);
      cache[String(t)] = sha256(bytes);
      await Bun.write(cachePath, JSON.stringify(cache));
    }
  }),
);
newFrames.sort((a, b) => a.t - b.t);
console.log(
  `frames: ${existing.length} existing + ${newFrames.length} new (${JSON.stringify(decoder)})`,
);

// 4. Reviewed WebVTT input. Native embedded-subtitle extraction is not exposed by this provider.
const subtitleTracks: { language: string; label: string; vtt: string }[] = [];
const subtitlePath = arg("subtitle-vtt");
if (subtitlePath) {
  const language = arg("subtitle-language");
  const label = arg("subtitle-label");
  if (!language || !/^[a-z]{2,3}(?:-[A-Za-z0-9]+)*$/.test(language) || !label?.trim())
    throw new Error("Reviewed subtitles require --subtitle-language and --subtitle-label");
  const file = Bun.file(subtitlePath);
  if (file.size > 8 * 1024 * 1024) throw new Error("Reviewed WebVTT exceeds 8 MiB");
  const vtt = (await file.text()).replace(/^\uFEFF/, "").replaceAll("\r\n", "\n");
  if (!/^WEBVTT(?:[ \t].*)?\n/.test(vtt) || !vtt.includes(" --> ") || vtt.includes("\0"))
    throw new Error("Reviewed subtitle input must contain actual WebVTT cues");
  subtitleTracks.push({ language, label: label.trim(), vtt });
}
const subtitleExtraction = {
  embedded: "unavailable",
  reason: "Bun Video / FilmCraft exposes no embedded subtitle extraction API",
  input: subtitlePath ? "reviewed-webvtt" : "none",
  preserveExisting: true,
};
console.log(`subtitles: ${JSON.stringify(subtitleExtraction)}`);

// 5. Crawl: official site (JA) and Wikipedia (EN).
const ua = {
  "user-agent":
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/155 Safari/537.36 Shenron/1.0",
};
const official = await (await fetch("https://dragonball-super.com/", { headers: ua })).text();
const officialText = official
  .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, " ")
  .replace(/<[^>]+>/g, "\n")
  .split("\n")
  .map((l) => l.trim())
  .filter(Boolean);
const storyAt = officialText.indexOf("STORY");
const episodeNumber = row.numberInSeries as number;
const titleJa = (() => {
  const n = String(episodeNumber).padStart(2, "0");
  const at = officialText.findIndex(
    (l, i) => i > storyAt && l === n && officialText[i + 1] && !/^\d+$/.test(officialText[i + 1]!),
  );
  return at >= 0 ? officialText[at + 1]! : null;
})();
const synopsisJa = titleJa ? (officialText[officialText.indexOf(titleJa) + 1] ?? null) : null;
// The page lists every episode; the cast block that belongs to this one follows its synopsis.
const castAt = officialText.indexOf("CHARACTER", titleJa ? officialText.indexOf(titleJa) : storyAt);
const onAir = officialText.indexOf("ON AIR", castAt);
const names: string[] = [];
let cursor = castAt + 1;
while (cursor < onAir && names.length < 24) {
  if (officialText[cursor] === names[0]) break;
  names.push(officialText[cursor]!);
  cursor++;
}
const cast: { characterJa: string; voiceActorJa: string; descriptionJa: string }[] = [];
for (let i = cursor; i + 2 < onAir; i += 3)
  cast.push({
    characterJa: officialText[i]!,
    voiceActorJa: officialText[i + 1]!,
    descriptionJa: officialText[i + 2]!,
  });
const stillUrls = [
  ...new Set([...official.matchAll(/img\/story\/(st\d\d-\d\d\.jpg)/g)].map((m) => m[1]!)),
]
  .filter((n) => n.startsWith(`st${String(episodeNumber).padStart(2, "0")}-`))
  .map((n) => `https://dragonball-super.com/img/story/${n}`);

const wiki = (await (
  await fetch(
    "https://en.wikipedia.org/w/api.php?action=parse&page=Dragon_Ball_Super:_Beerus&prop=wikitext&format=json",
    { headers: ua },
  )
).json()) as any;
const wikitext: string = wiki.parse.wikitext["*"];
const block =
  new RegExp(`\\| EpisodeNumber\\s*= ${episodeNumber}\\n([\\s\\S]*?)\\n\\}\\}`).exec(
    wikitext,
  )?.[1] ?? "";
const field = (name: string) =>
  new RegExp(`\\| ${name}\\s*= (.*)`)
    .exec(block)?.[1]
    ?.replace(/\{\{Ill\|([^|}]*)[^}]*\}\}/g, "$1")
    .replace(/\{\{[^}]*\}\}|\[\[(?:[^|\]]*\|)?([^\]]*)\]\]/g, "$1")
    .replace(/''/g, "")
    .trim() || null;
const wikiEpisode = {
  titleEn: field("Title"),
  titleRomaji: field("TranslitTitle"),
  titleNative: field("NativeTitle"),
  director: field("DirectedBy"),
  storyboard: field("Aux2"),
  animationDirector: field("Aux3"),
  summaryEn: field("ShortSummary"),
};
console.log(
  JSON.stringify({
    titleJa,
    wikiEpisode: { ...wikiEpisode, summaryEn: wikiEpisode.summaryEn?.slice(0, 60) },
    cast: cast.length,
    stills: stillUrls.length,
  }),
);

// 6. Stage and plan.
const frameObjects = [
  ...existing,
  ...newFrames.map((f) => ({
    tags: [],
    width,
    height,
    source: "bun-video",
    caption: null,
    sourceId: `bun-video:${sourceSha}:${f.t}`,
    imagePath: `${CDN}/media/episodes/${id}/${sourceSha}/${f.sha}.png`,
    isNotable: false,
    sortOrder: 0,
    sourceUrl: existing[0]?.sourceUrl ?? `${SITE}/api/episodes/${id}/video`,
    timecodeSec: f.t,
    episodeNumber: null,
    characterNames: [],
  })),
]
  .toSorted((a, b) => a.timecodeSec - b.timecodeSec)
  .map((f, i) => Object.assign({}, f, { sortOrder: i }));

const subtitleObjects = [
  ...(Array.isArray(row.subtitles) ? row.subtitles : []).filter(
    (track: { lang?: string }) => !subtitleTracks.some((input) => input.language === track.lang),
  ),
  ...subtitleTracks.map((t) => ({
    lang: t.language,
    label: t.label,
    src: `${CDN}/media/episodes/${id}/${sourceSha}/${sha256(t.vtt)}.vtt`,
  })),
];
const synopsisFr: string | null = arg("synopsis-fr") ?? null;
const officialMetadata = {
  schema: "shenron-episode-official/v1",
  collectedAt: new Date().toISOString(),
  titles: {
    fr: row.title,
    ja: titleJa ?? wikiEpisode.titleNative,
    romaji: wikiEpisode.titleRomaji,
    en: wikiEpisode.titleEn,
  },
  synopsisJa,
  staff: {
    director: wikiEpisode.director,
    storyboard: wikiEpisode.storyboard,
    animationDirector: wikiEpisode.animationDirector,
  },
  correspondsToDbsEpisodes: "1-2",
  cast,
  stills: stillUrls.map((u) => `${CDN}/assets/crawl/dragon-ball-super.com/${u.split("/").pop()}`),
  sources: [
    { name: "Site officiel (ja)", url: "https://dragonball-super.com/#story" },
    {
      name: "Wikipedia (en), Dragon Ball Super: Beerus",
      url: "https://en.wikipedia.org/wiki/Dragon_Ball_Super:_Beerus",
    },
    {
      name: "Crunchyroll",
      url: row.availability?.[0]?.url ?? "https://www.crunchyroll.com/series/GT00389311/",
    },
  ],
  video: {
    sha256: sourceSha,
    bytes: sourceSize,
    width,
    height,
    durationSeconds: duration,
    frames: frameObjects.length,
    producer: "bun-video",
  },
};
await Bun.write(
  join(dir, "plan.json"),
  JSON.stringify(
    {
      id,
      frames: frameObjects.length,
      subtitles: subtitleObjects,
      subtitleExtraction,
      officialMetadata,
      wikiEpisode,
    },
    null,
    1,
  ),
);
if (knownSha && knownSha !== sourceSha)
  console.warn(
    `WARNING: existing frames came from source ${knownSha}, this file hashes to ${sourceSha}`,
  );
if (!apply) {
  console.log(`staged in ${dir} (plan.json); pass --apply to publish`);
  process.exit(0);
}

// 7. Publish to the CDN (additive), then the origin on dbfr.
const stills: CdnItem[] = [];
for (const url of stillUrls) {
  const response = await fetch(url, { headers: ua });
  if (!response.ok) continue;
  const bytes = new Uint8Array(await response.arrayBuffer());
  stills.push({
    path: `/assets/crawl/dragon-ball-super.com/${url.split("/").pop()}`,
    sha256: sha256(bytes),
    bytes,
    contentType: "image/jpeg",
  });
}
const items: CdnItem[] = [
  ...newFrames.map((f) => ({
    path: `/media/episodes/${id}/${sourceSha}/${f.sha}.png`,
    sha256: f.sha,
    bytes: f.bytes,
    contentType: "image/png",
  })),
  ...subtitleTracks.map((t) => ({
    path: `/media/episodes/${id}/${sourceSha}/${sha256(t.vtt)}.vtt`,
    sha256: sha256(t.vtt),
    bytes: new TextEncoder().encode(t.vtt),
    contentType: "text/vtt",
  })),
  ...stills,
];
const s3 = await mintClient();
const published = await publishItems(s3, items, await livePrefix(), (message) =>
  console.log(message),
);
console.log(JSON.stringify({ live: published.live.length, failed: published.failed }));
if (published.failed.length) throw new Error("some objects failed to publish");
const entries = Object.fromEntries(
  items.map((i) => [
    i.path,
    {
      sha256: i.sha256,
      size: i.bytes.length,
      contentType: i.contentType,
      cacheControl: "public, max-age=31536000, immutable",
    },
  ]),
);
await Bun.write(join(dir, "cdn-entries.json"), JSON.stringify(entries));
const run = async (cmd: string[], stdin?: string) => {
  const p = Bun.spawn(cmd, {
    stdin: stdin ? new Blob([stdin]) : "ignore",
    stdout: "inherit",
    stderr: "inherit",
  });
  if (await p.exited) throw new Error(`${cmd[0]} failed`);
};
await run([
  "scp",
  "-q",
  join(dir, "cdn-entries.json"),
  join(import.meta.dir, "cdn-origin-add.ts"),
  `${SSH_HOST}:/tmp/`,
]);
await run([
  "ssh",
  SSH_HOST,
  'sudo -n "$(command -v bun || echo /usr/local/bin/bun)" /tmp/cdn-origin-add.ts /tmp/cdn-entries.json',
]);

// 8. Database: back up the row, then update it in one transaction.
const q = (value: unknown) =>
  value === null || value === undefined
    ? "NULL"
    : `$j$${typeof value === "string" ? value : JSON.stringify(value)}$j$`;
const sql = `\\set ON_ERROR_STOP on
BEGIN;
CREATE TABLE IF NOT EXISTS bot.db_episodes_backup_completion AS SELECT now() AS saved_at, * FROM bot.db_episodes WHERE false;
INSERT INTO bot.db_episodes_backup_completion SELECT now(), * FROM bot.db_episodes WHERE id = ${id};
UPDATE bot.db_episodes SET
  frames = ${q(frameObjects)}::jsonb,
  subtitles = ${subtitleObjects.length ? `${q(subtitleObjects)}::jsonb` : "subtitles"},
  title_ja = COALESCE(title_ja, ${q(titleJa ?? wikiEpisode.titleNative)}),
  title_romaji = COALESCE(title_romaji, ${q(wikiEpisode.titleRomaji)}),
  arc_id = COALESCE(arc_id, ${arg("arc-id") ? Number(arg("arc-id")) : "NULL"}),
  synopsis_fr = COALESCE(synopsis_fr, ${q(synopsisFr)}),
  official_metadata = ${q(officialMetadata)}::jsonb,
  duration_sec = ${Math.floor(duration)}
WHERE id = ${id};
COMMIT;
SELECT id, title_ja, title_romaji, arc_id, jsonb_array_length(frames) AS frames, jsonb_array_length(coalesce(subtitles,'[]'::jsonb)) AS subs, (official_metadata IS NOT NULL) AS official FROM bot.db_episodes WHERE id = ${id};
`;
await Bun.write(join(dir, "update.sql"), sql);
await run(
  [
    "ssh",
    SSH_HOST,
    "sudo -n docker exec -i shenron-postgres psql -U postgres -d shenron_site -v ON_ERROR_STOP=1",
  ],
  sql,
);
console.log("database updated; row backup in bot.db_episodes_backup_completion");
