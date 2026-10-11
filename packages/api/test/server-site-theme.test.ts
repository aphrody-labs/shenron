// SPDX-License-Identifier: Apache-2.0
import { expect, test } from "bun:test";
import {
  DEFAULT_SITE_THEME,
  themeCssVars,
  type SiteTheme,
} from "@aphrody/shenron-config/site-theme";
import { createShenronApiClient } from "../src/client";
import { endpoints } from "../src/contract";
import { createMemoryRateLimiter, createPublicCache, noopInvalidation } from "../src/http";
import { createShenronApi } from "../src/server";

test("Bun serves live themes and restricts normalized writes to authenticated admins", async () => {
  let stored: unknown = null;
  const writes: { theme: SiteTheme; by: string | null }[] = [];
  const api = createShenronApi(
    {
      siteTheme: {
        read: async () => stored,
        save: async (theme, by) => {
          writes.push({ theme, by });
          stored = theme;
        },
      },
      auth: {
        owner: async () => "discord:staff",
        admin: async (request) => request.headers.get("authorization") === "Bearer fixture-admin",
      },
      rateLimit: createMemoryRateLimiter(),
      publicCache: createPublicCache(),
      invalidation: noopInvalidation,
      cors: { allowedOrigins: [] },
      clientIp: () => "fixture",
      isDirectLoopback: () => true,
    },
    { service: "shenron-server" },
  );
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    routes: api.routes,
    fetch: api.fetch,
  });
  const guest = createShenronApiClient({ baseUrl: server.url });
  const admin = createShenronApiClient({ baseUrl: server.url, adminToken: () => "fixture-admin" });
  try {
    expect(await guest.call(endpoints.siteTheme, {})).toMatchObject({
      ok: true,
      value: { theme: DEFAULT_SITE_THEME },
    });
    const response = await fetch(new URL(endpoints.siteTheme.path, server.url));
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("etag")).toBeNull();
    const rejected = await guest.call(endpoints.siteThemeSave, { body: { radius: 2 } });
    expect(rejected).toMatchObject({ ok: false, kind: "http", status: 403 });
    expect(writes).toHaveLength(0);
    const saved = await admin.call(endpoints.siteThemeSave, {
      body: {
        colors: { orange: "#123456", red: "</style><script>bad</script>" },
        radius: 99,
        updatedBy: "forged",
      },
    });
    expect(saved).toMatchObject({
      ok: true,
      value: {
        ok: true,
        theme: { colors: { orange: "#123456", red: DEFAULT_SITE_THEME.colors.red }, radius: 2 },
      },
    });
    expect(writes[0]?.by).toBe("discord:staff");
    expect(themeCssVars(writes[0]!.theme)).not.toContain("<");
    expect(await guest.call(endpoints.siteTheme, {})).toMatchObject({
      ok: true,
      value: { theme: writes[0]!.theme },
    });
  } finally {
    await server.stop(true);
  }
});

test("the theme capability does not claim routes without its port", async () => {
  const api = createShenronApi(
    {
      rateLimit: createMemoryRateLimiter(),
      publicCache: createPublicCache(),
      invalidation: noopInvalidation,
      cors: { allowedOrigins: [] },
      clientIp: () => "fixture",
      isDirectLoopback: () => true,
    },
    { service: "shenron-server" },
  );
  expect(api.handles(endpoints.siteTheme.path)).toBe(false);
});
