// SPDX-License-Identifier: Apache-2.0
/**
 * Crawl all episodes from the live site API and audit their player reachability.
 */

interface Player {
  name: string;
  provider: string;
  embedUrl: string;
  lang?: string;
}

interface EpisodeSummary {
  id: number;
  title: string;
  series: string;
  players?: Player[];
}

console.log("Starting full crawl of https://dragonballfr.com/api/episodes...");

const limit = 200;
let offset = 0;
const allEpisodes: EpisodeSummary[] = [];

while (true) {
  const url = `https://dragonballfr.com/api/episodes?limit=${limit}&offset=${offset}`;
  const res = await fetch(url);
  if (!res.ok) {
    console.error(`Failed to fetch ${url}: ${res.status}`);
    break;
  }
  const data = (await res.json()) as { total: number; episodes: EpisodeSummary[] };
  allEpisodes.push(...data.episodes);
  console.log(`Fetched ${allEpisodes.length}/${data.total} episodes...`);
  if (allEpisodes.length >= data.total || data.episodes.length === 0) break;
  offset += data.episodes.length;
}

console.log(`\n=== Crawl Complete: ${allEpisodes.length} Episodes ===`);

const providerStats: Record<string, number> = {};
const issues: { id: number; title: string; series: string; issue: string; player?: string }[] = [];
let totalPlayers = 0;

for (const ep of allEpisodes) {
  const players = ep.players ?? [];
  totalPlayers += players.length;
  if (players.length === 0) {
    issues.push({ id: ep.id, title: ep.title, series: ep.series, issue: "no_players" });
  }
  for (const p of players) {
    providerStats[p.provider] = (providerStats[p.provider] || 0) + 1;
    if (!p.embedUrl || !URL.canParse(p.embedUrl)) {
      issues.push({
        id: ep.id,
        title: ep.title,
        series: ep.series,
        issue: "invalid_embed_url",
        player: p.name,
      });
    }
  }
}

console.log("\nTotal players across all episodes:", totalPlayers);
console.log("Providers breakdown:", JSON.stringify(providerStats, null, 2));
console.log("Episodes with issues:", issues.length);

console.log("\nProbing live reachability of sample player embeds (concurrency 10)...");
const sample: { epId: number; name: string; provider: string; embedUrl: string }[] = allEpisodes
  .slice(0, 30)
  .flatMap((ep) =>
    (ep.players ?? []).map((p: Player) => ({
      epId: ep.id,
      name: p.name,
      provider: p.provider,
      embedUrl: p.embedUrl,
    })),
  );

console.log(`Sample size: ${sample.length} players to test.`);

let successCount = 0;
let failCount = 0;
const BATCH_SIZE = 10;

for (let i = 0; i < sample.length; i += BATCH_SIZE) {
  const batch = sample.slice(i, i + BATCH_SIZE);
  await Promise.all(
    batch.map(async (item) => {
      try {
        const res = await fetch(item.embedUrl, {
          method: "HEAD",
          headers: { "User-Agent": "Mozilla/5.0", Referer: "https://dragonballfr.com/" },
          signal: AbortSignal.timeout(5000),
        });
        if (res.ok || res.status === 405 || res.status === 403) {
          successCount++;
        } else {
          failCount++;
          console.warn(
            `[WARN] Ep ${item.epId} (${item.name}): HTTP ${res.status} on ${item.embedUrl}`,
          );
        }
      } catch {
        try {
          const res2 = await fetch(item.embedUrl, {
            method: "GET",
            headers: { "User-Agent": "Mozilla/5.0", Referer: "https://dragonballfr.com/" },
            signal: AbortSignal.timeout(5000),
          });
          if (res2.ok) {
            successCount++;
          } else {
            failCount++;
            console.warn(
              `[FAIL] Ep ${item.epId} (${item.name}): HTTP ${res2.status} on ${item.embedUrl}`,
            );
          }
        } catch (err: unknown) {
          failCount++;
          const msg = err instanceof Error ? err.message : String(err);
          console.warn(`[ERROR] Ep ${item.epId} (${item.name}): ${msg}`);
        }
      }
    }),
  );
}

console.log(`\nProbe results: ${successCount} successful / ${failCount} failed.`);
