// SPDX-License-Identifier: Apache-2.0
import { afterAll, expect, mock, test } from "bun:test";
import { DEFAULT_SITE_THEME, resolveSiteTheme } from "@shenron/config/site-theme";

mock.module("server-only", () => ({}));
mock.module("@/lib/db", () => {
  throw new Error("Hosted theme must not initialize the Next database");
});
const { getSiteTheme, saveSiteTheme, HostThemeError } = await import("../src/lib/theme-config");
let theme = resolveSiteTheme({ colors: { orange: "#123456" } });
let status = 200;
let written: unknown;
let forwarded = new Headers();
const server = Bun.serve({
  hostname: "127.0.0.1",
  port: 0,
  async fetch(request) {
    expect(new URL(request.url).pathname).toBe("/api/v1/site/theme");
    if (request.method === "POST") {
      written = await request.json();
      forwarded = request.headers;
      return Response.json({ ok: true, theme }, { status });
    }
    return Response.json({ theme }, { status });
  },
});
const previous = process.env.SHENRON_HOST_URL;
process.env.SHENRON_HOST_URL = server.url.origin;
afterAll(async () => {
  await server.stop(true);
  if (previous === undefined) delete process.env.SHENRON_HOST_URL;
  else process.env.SHENRON_HOST_URL = previous;
});

test("Next reads and writes the hosted palette without resolving DB, while preserving request credentials", async () => {
  expect((await getSiteTheme()).colors.orange).toBe("#123456");
  theme = resolveSiteTheme({ colors: { orange: "#abcdef" } });
  expect((await getSiteTheme()).colors.orange).toBe("#abcdef");
  expect(
    await saveSiteTheme(
      { radius: 1 },
      "untrusted",
      new Headers({ cookie: "reader=fixture", authorization: "Bearer fixture" }),
    ),
  ).toEqual(theme);
  expect(written).toEqual({ radius: 1 });
  expect(forwarded.get("cookie")).toBe("reader=fixture");
  expect(forwarded.get("authorization")).toBe("Bearer fixture");
  await saveSiteTheme(
    {},
    null,
    new Headers({ cookie: "legacy-admin=fixture" }),
    "approved-proxy-token",
  );
  expect(forwarded.get("authorization")).toBe("Bearer approved-proxy-token");
  status = 403;
  await expect(saveSiteTheme({ radius: 0 }, null)).rejects.toBeInstanceOf(HostThemeError);
  status = 503;
  expect(await getSiteTheme()).toEqual(DEFAULT_SITE_THEME);
});
