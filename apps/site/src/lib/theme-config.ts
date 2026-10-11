// SPDX-License-Identifier: Apache-2.0
/** Request-cached theme adapter; only the Bun host owns storage. */
import "server-only";
import { cache } from "react";
import { resolveHostUrl } from "@aphrody/shenron-config/public-urls";
import {
  DEFAULT_SITE_THEME,
  resolveSiteTheme,
  type SiteTheme,
} from "@aphrody/shenron-config/site-theme";
import { createShenronApiClient } from "@aphrody/shenron-api/client";
import { endpoints } from "@aphrody/shenron-api/contract";

import { HostThemeError } from "./host-theme-error";
export { HostThemeError } from "./host-theme-error";

function hostThemeClient(host: string, requestHeaders?: Headers, adminToken?: string | null) {
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

export const getSiteTheme = cache(async (): Promise<SiteTheme> => {
  const host = resolveHostUrl(process.env);
  if (!host) return DEFAULT_SITE_THEME;
  const result = await hostThemeClient(host).call(endpoints.siteTheme, {});
  return result.ok ? resolveSiteTheme(result.value.theme) : DEFAULT_SITE_THEME;
});

export async function saveSiteTheme(
  patch: unknown,
  by?: string | null,
  requestHeaders?: Headers,
  adminToken?: string | null,
): Promise<SiteTheme> {
  const host = resolveHostUrl(process.env);
  if (!host) throw new HostThemeError(503);
  const result = await hostThemeClient(host, requestHeaders, adminToken).call(
    endpoints.siteThemeSave,
    { body: patch },
  );
  if (!result.ok) throw new HostThemeError(result.kind === "http" ? result.status : 502);
  return resolveSiteTheme(result.value.theme);
}
