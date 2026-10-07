// SPDX-License-Identifier: Apache-2.0
/** Request-cached banner adapter; only the Bun host owns storage. */
import "server-only";
import { cache } from "react";
import { resolveHostUrl } from "@shenron/config/public-urls";
import {
  DEFAULT_PAGE_BANNERS,
  resolveBannerUrl,
  resolvePageBanners,
  type PageBannersConfig,
  type PageHeroKey,
} from "@/lib/page-banners";
import { createShenronApiClient } from "@shenron/api/client";
import { endpoints } from "@shenron/api/contract";

import { HostBannerError } from "./host-banner-error";
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

/** URL affichable pour le hero d'une page (landing). */
export async function pageHero(key: PageHeroKey): Promise<string> {
  const cfg = await getPageBanners();
  return resolveBannerUrl(cfg.pages[key], cfg.fallback);
}

/** URL affichable pour la bannière d'une série (`DB`, `DBZ`, …). */
export async function bannerForSeries(series: string): Promise<string> {
  const cfg = await getPageBanners();
  const raw = cfg.series[series] ?? cfg.fallback;
  return resolveBannerUrl(raw, cfg.fallback);
}
