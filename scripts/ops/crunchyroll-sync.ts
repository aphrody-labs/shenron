#!/usr/bin/env bun
// SPDX-License-Identifier: Apache-2.0
/**
 * crunchyroll-sync: maps a Shenron series onto its Crunchyroll series and refreshes episode availability.
 *
 *   bun scripts/ops/crunchyroll-sync.ts [--series DBS_BEERUS] [--locale fr-FR] [--apply]
 *
 * Reads seasons and episodes through the Bun Video Crunchyroll client with the owner's credentials, maps them with
 * @aphrody/shenron-media/crunchyroll-mapping and, with --apply, writes bot.db_episodes.availability (and the
 * duration when empty) for the matching episode numbers. Metadata only; nothing is downloaded or decrypted.
 *
 * Credentials (protected env, never printed): BUN_VIDEO_CRUNCHYROLL_ACCESS_TOKEN, or CRUNCHYROLL_EMAIL +
 * CRUNCHYROLL_PASSWORD + BUN_VIDEO_CRUNCHYROLL_BASIC_AUTHORIZATION. Without them the script reports
 * « not configured » and exits 0, so the timer that runs it is harmless until the credentials exist.
 */
import { createCrunchyrollClient } from "@aphrody/bun-video/crunchyroll";
import { CRUNCHYROLL_SERIES_BY_SHENRON, mapCrunchyrollEpisodes, type CrunchyrollEpisode } from "../../packages/media/src/crunchyroll-mapping";

const arg = (name: string, fallback: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1]! : fallback;
};
const series = arg("series", "DBS_BEERUS");
const locale = arg("locale", "fr-FR");
const apply = process.argv.includes("--apply");
const crunchyrollSeries = CRUNCHYROLL_SERIES_BY_SHENRON[series];
if (!crunchyrollSeries) throw new Error(`No Crunchyroll series is mapped for ${series}`);

const env = process.env;
const accessToken = env.BUN_VIDEO_CRUNCHYROLL_ACCESS_TOKEN;
const basicAuthorization = env.BUN_VIDEO_CRUNCHYROLL_BASIC_AUTHORIZATION;
if (!accessToken && !(basicAuthorization && env.CRUNCHYROLL_EMAIL && env.CRUNCHYROLL_PASSWORD)) {
  console.log(JSON.stringify({ configured: false, series, crunchyrollSeries, note: "Crunchyroll credentials are not configured" }));
  process.exit(0);
}

const client = createCrunchyrollClient({ accessToken, basicAuthorization, accountId: env.BUN_VIDEO_CRUNCHYROLL_ACCOUNT_ID, locale });
const login = accessToken ? await client.loginWithAccessToken() : await client.login(env.CRUNCHYROLL_EMAIL!, env.CRUNCHYROLL_PASSWORD!);
if (!login.success) throw new Error("Crunchyroll authentication failed");

const seasons = (await client.getSeasons(crunchyrollSeries)) as { items?: { id: string }[]; data?: { id: string }[] };
const episodes: CrunchyrollEpisode[] = [];
for (const season of seasons.items ?? seasons.data ?? []) {
  const page = (await client.getEpisodes(season.id)) as { items?: CrunchyrollEpisode[]; data?: CrunchyrollEpisode[] };
  episodes.push(...(page.items ?? page.data ?? []));
}
const mapped = mapCrunchyrollEpisodes(episodes);
console.log(JSON.stringify({ series, crunchyrollSeries, seasons: (seasons.items ?? seasons.data ?? []).length, episodes: mapped.length }));
if (!apply || !mapped.length) process.exit(0);

const lit = (value: string) => `$q$${value}$q$`;
const sql = [
  "BEGIN;",
  ...mapped.map(
    (e) =>
      `UPDATE bot.db_episodes SET availability = ${lit(JSON.stringify([e.availability]))}::jsonb, duration_sec = COALESCE(duration_sec, ${e.durationSec ?? "NULL"}) WHERE series = ${lit(series)} AND number_in_series = ${e.number};`,
  ),
  "COMMIT;",
].join("\n");
const p = Bun.spawn(["ssh", "dbfr", "sudo -n docker exec -i shenron-postgres psql -U postgres -d shenron_site -v ON_ERROR_STOP=1 -At"], { stdin: new Blob([sql]), stdout: "inherit", stderr: "inherit" });
if (await p.exited) throw new Error("database update failed");
console.log(`availability refreshed for ${mapped.length} episodes`);
