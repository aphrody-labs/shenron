// SPDX-License-Identifier: Apache-2.0
/**
 * Runs on the owner's workstation (real Chrome, residential network): signs in with the owner's cookies, lets the
 * Crunchyroll web app authenticate itself, then reads series, seasons and episodes metadata with that session.
 *
 *   bun crunchyroll-catalog-browser.ts <cookies.json> <series id> <out.json> [locale]
 *
 * Output holds public catalogue metadata only (ids, titles, numbers, durations, locales); the token never leaves
 * the process. A Cloudflare challenge is reported and not bypassed.
 */
import { readFileSync, writeFileSync } from "node:fs";

const [cookiesFile, seriesId, outFile, locale = "fr-FR"] = Bun.argv.slice(2);
if (!cookiesFile || !seriesId || !outFile)
  throw new Error(
    "usage: crunchyroll-catalog-browser.ts <cookies.json> <series id> <out.json> [locale]",
  );
const cookies = JSON.parse(readFileSync(cookiesFile, "utf8")) as Record<string, unknown>[];
let bearer: string | undefined;
const bearerObserved = Promise.withResolvers<void>();
const headed = process.env.CRUNCHYROLL_HEADED === "1";
await using view = new (Bun as any).WebView({
  width: 1280,
  height: 900,
  backend: { type: "chrome", url: false, ...(headed ? {} : {}) },
});
await view.navigate("https://www.crunchyroll.com/robots.txt");
await view.cdp("Network.enable");
await view.cdp("Network.setCookies", {
  cookies: cookies.map((c) => Object.assign({ url: "https://www.crunchyroll.com/" }, c)),
});
const grab = (event: any) => {
  const headers = (event.data.request?.headers ?? event.data.headers ?? {}) as Record<
    string,
    string
  >;
  const auth = headers.authorization ?? headers.Authorization;
  if (auth?.startsWith("Bearer ") && !bearer) {
    bearer = auth.slice(7);
    if (bearer) bearerObserved.resolve();
  }
};
view.addEventListener("Network.requestWillBeSent", grab);
view.addEventListener("Network.requestWillBeSentExtraInfo", grab);
await view.navigate(`https://www.crunchyroll.com/fr/series/${seriesId}`);
if (!bearer) {
  const deadline = setTimeout(() => bearerObserved.resolve(), 30_000);
  try {
    await bearerObserved.promise;
  } finally {
    clearTimeout(deadline);
  }
}
const title = String(await view.evaluate("document.title"));
if (!bearer) {
  console.log(
    JSON.stringify({
      ok: false,
      title,
      note: /just a moment/i.test(title)
        ? "Cloudflare challenge page; not bypassed"
        : "no bearer observed (not signed in?)",
    }),
  );
  process.exit(1);
}
const result = await view.evaluate(`(async () => {
  const token = ${JSON.stringify(bearer)}, locale = ${JSON.stringify(locale)}, series = ${JSON.stringify(seriesId)};
  const get = async path => { const r = await fetch("https://www.crunchyroll.com" + path + (path.includes("?") ? "&" : "?") + "locale=" + locale, { headers: { authorization: "Bearer " + token } }); if (!r.ok) throw new Error(path + " HTTP " + r.status); return r.json(); };
  const keep = e => ({ id: e.id, title: e.title, slug_title: e.slug_title, episode_number: e.episode_number, sequence_number: e.sequence_number, season_id: e.season_id, season_number: e.season_number, duration_ms: e.duration_ms, audio_locale: e.audio_locale, subtitle_locales: e.subtitle_locales, is_premium_only: e.is_premium_only, description: e.description, episode_air_date: e.episode_air_date, images: e.images?.thumbnail?.[0]?.map(i => ({ width: i.width, height: i.height, source: i.source })) });
  const info = (await get("/content/v2/cms/series/" + series)).data?.[0];
  const seasons = (await get("/content/v2/cms/series/" + series + "/seasons")).data ?? [];
  const episodes = [];
  for (const s of seasons) episodes.push(...((await get("/content/v2/cms/seasons/" + s.id + "/episodes")).data ?? []).map(keep));
  return { series: info && { id: info.id, title: info.title, slug_title: info.slug_title, description: info.description, episode_count: info.episode_count, season_count: info.season_count, images: info.images }, seasons: seasons.map(s => ({ id: s.id, title: s.title, season_number: s.season_number, number_of_episodes: s.number_of_episodes })), episodes };
})()`);
writeFileSync(
  outFile,
  JSON.stringify({ capturedAt: new Date().toISOString(), locale, ...(result as object) }),
);
const r = result as { seasons: unknown[]; episodes: unknown[] };
console.log(JSON.stringify({ ok: true, seasons: r.seasons.length, episodes: r.episodes.length }));
