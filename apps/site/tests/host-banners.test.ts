// SPDX-License-Identifier: Apache-2.0
import { afterAll, expect, mock, test } from "bun:test";
import { DEFAULT_PAGE_BANNERS, resolvePageBanners } from "@shenron/config/page-banners";

mock.module("server-only", () => ({}));
mock.module("@/lib/db", () => {
  throw new Error("Hosted home must not initialize the Next database");
});
const { getPageBanners, savePageBanners, HostBannerError } =
  await import("../src/lib/banner-config");
let config = resolvePageBanners({ pages: { episodes: "First fixture" } });
let status = 200;
let written: unknown;
let forwarded = new Headers();
const server = Bun.serve({
  hostname: "127.0.0.1",
  port: 0,
  async fetch(request) {
    expect(new URL(request.url).pathname).toBe("/api/v1/site/banners");
    if (request.method === "POST") {
      written = await request.json();
      forwarded = request.headers;
      return Response.json({ ok: true, banners: config }, { status });
    }
    return Response.json({ banners: config }, { status });
  },
});
const previous = process.env.SHENRON_HOST_URL;
process.env.SHENRON_HOST_URL = server.url.origin;
afterAll(async () => {
  await server.stop(true);
  if (previous === undefined) delete process.env.SHENRON_HOST_URL;
  else process.env.SHENRON_HOST_URL = previous;
});

test("Next reads and writes the hosted banners without resolving DB, while preserving request credentials", async () => {
  expect((await getPageBanners()).pages.episodes).toBe("First fixture");
  config = resolvePageBanners({ pages: { episodes: "Latest fixture" } });
  expect((await getPageBanners()).pages.episodes).toBe("Latest fixture");
  expect(
    await savePageBanners(
      { pages: { episodes: "Saved fixture" } },
      "untrusted",
      new Headers({ cookie: "reader=fixture", authorization: "Bearer fixture" }),
    ),
  ).toEqual(config);
  expect(written).toEqual({ pages: { episodes: "Saved fixture" } });
  expect(forwarded.get("cookie")).toBe("reader=fixture");
  expect(forwarded.get("authorization")).toBe("Bearer fixture");
  await savePageBanners(
    {},
    null,
    new Headers({ cookie: "legacy-admin=fixture" }),
    "approved-proxy-token",
  );
  expect(forwarded.get("authorization")).toBe("Bearer approved-proxy-token");
  status = 403;
  await expect(
    savePageBanners({ pages: { episodes: "Rejected fixture" } }, null),
  ).rejects.toBeInstanceOf(HostBannerError);
  status = 503;
  expect(await getPageBanners()).toEqual(DEFAULT_PAGE_BANNERS);
});

test("an absent host cannot reactivate Next database storage", async () => {
  delete process.env.SHENRON_HOST_URL;
  try {
    expect(await getPageBanners()).toEqual(DEFAULT_PAGE_BANNERS);
    const error = await savePageBanners({ pages: { episodes: "Saved fixture" } }).catch(
      (value: unknown) => value,
    );
    expect(error).toBeInstanceOf(HostBannerError);
    if (!(error instanceof HostBannerError)) throw new Error("Expected a home service failure");
    expect(error.status).toBe(503);
  } finally {
    process.env.SHENRON_HOST_URL = server.url.origin;
  }
});
