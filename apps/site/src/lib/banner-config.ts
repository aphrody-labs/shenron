// SPDX-License-Identifier: Apache-2.0
/** Request-cached banner adapter; only the Bun host owns storage. */
import "server-only";
import { cache } from "react";
import { unstable_cache } from "next/cache";
import { resolveHostUrl } from "@aphrody/shenron-config/public-urls";
import {
  DEFAULT_PAGE_BANNERS,
  resolvePageBanners,
  type PageBannersConfig,
  type PageHeroKey,
} from "@/lib/page-banners";
import { createShenronApiClient } from "@aphrody/shenron-api/client";
import { endpoints } from "@aphrody/shenron-api/contract";

import { HostBannerError } from "./host-banner-error";
import { dbUniverse } from "./db-universe";
import { selectEpisodeFrameBanner, type BannerFrameScope } from "./episode-frame-banner";
export { HostBannerError } from "./host-banner-error";

function hostBannerClient(host: string, requestHeaders?: Headers, adminToken?: string | null) {
  const forward = Object.assign(
    (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
      const headers = new Headers(init?.headers);
      for (const name of ["cookie", "user-agent", ...(!adminToken ? ["authorization"] : [])]) {
        const value = requestHeaders?.get(name);
        if (value) headers.set(name, value);
      }
      return fetch(input, { ...init, headers, cache: "no-store" });
    },
    { preconnect: fetch.preconnect },
  );
  return createShenronApiClient({
    baseUrl: host,
    fetch: forward,
    adminToken: () => adminToken ?? null,
  });
}

export const getPageBanners = cache(async (): Promise<PageBannersConfig> => {
  const host = resolveHostUrl(process.env);
  if (!host) return structuredClone(DEFAULT_PAGE_BANNERS);
  const result = await hostBannerClient(host).call(endpoints.pageBanners, {});
  return result.ok
    ? resolvePageBanners(result.value.banners)
    : structuredClone(DEFAULT_PAGE_BANNERS);
});

export async function savePageBanners(
  patch: unknown,
  by?: string | null,
  requestHeaders?: Headers,
  adminToken?: string | null,
): Promise<PageBannersConfig> {
  const host = resolveHostUrl(process.env);
  if (!host) throw new HostBannerError(503);
  const result = await hostBannerClient(host, requestHeaders, adminToken).call(
    endpoints.pageBannersSave,
    { body: patch },
  );
  if (!result.ok) throw new HostBannerError(result.kind === "http" ? result.status : 502);
  return resolvePageBanners(result.value.banners);
}

const frameBanner = unstable_cache(
  async (series: string | undefined, start: number | undefined, end: number | undefined) => {
    if (
      [start, end].some(
        (value) => value !== undefined && (!Number.isSafeInteger(value) || value < 0),
      )
    )
      return "";
    if (start !== undefined && end !== undefined && start > end) return "";
    const catalogue = await dbUniverse.frameEpisodes(series, start, end);
    if (!catalogue) return "";
    return selectEpisodeFrameBanner(catalogue, {
      series,
      episodeStart: start,
      episodeEnd: end,
    });
  },
  ["canonical-frame-banner-v1"],
  { revalidate: 3600, tags: ["episode-series", "episodes-by-series"] },
);

/** Public heroes use measured episode frames; unqualified artwork stays out. */
export async function pageHero(_key: PageHeroKey, scope: BannerFrameScope = {}): Promise<string> {
  if (!["episodes", "sagas", "arcs", "chronologie"].includes(_key) && !scope.series) return "";
  return frameBanner(scope.series, scope.episodeStart, scope.episodeEnd).catch(() => "");
}

/** URL affichable pour la bannière d'une série (`DB`, `DBZ`, …). */
export async function bannerForSeries(
  series: string,
  scope: Omit<BannerFrameScope, "series"> = {},
): Promise<string> {
  return frameBanner(series, scope.episodeStart, scope.episodeEnd).catch(() => "");
}
