// SPDX-License-Identifier: Apache-2.0
import { afterAll, expect, mock, test } from "bun:test";
import { DEFAULT_HOME_CONFIG, resolveHomeConfig } from "@shenron/config/home";

mock.module("server-only", () => ({}));
mock.module("@/lib/db", () => {
  throw new Error("Hosted home must not initialize the Next database");
});
const { getHomeConfig, saveHomeConfig, HostHomeError } = await import("../src/lib/home-config");
let config = resolveHomeConfig({ hero: { lede: "First fixture" } });
let status = 200;
let written: unknown;
let forwarded = new Headers();
const server = Bun.serve({
  hostname: "127.0.0.1",
  port: 0,
  async fetch(request) {
    expect(new URL(request.url).pathname).toBe("/api/v1/site/home");
    if (request.method === "POST") {
      written = await request.json();
      forwarded = request.headers;
      return Response.json({ ok: true, config: config }, { status });
    }
    return Response.json({ config: config }, { status });
  },
});
const previous = process.env.SHENRON_HOST_URL;
process.env.SHENRON_HOST_URL = server.url.origin;
afterAll(async () => {
  await server.stop(true);
  if (previous === undefined) delete process.env.SHENRON_HOST_URL;
  else process.env.SHENRON_HOST_URL = previous;
});

test("Next reads and writes the hosted homepage without resolving DB, while preserving request credentials", async () => {
  expect((await getHomeConfig()).hero.lede).toBe("First fixture");
  config = resolveHomeConfig({ hero: { lede: "Latest fixture" } });
  expect((await getHomeConfig()).hero.lede).toBe("Latest fixture");
  expect(
    await saveHomeConfig(
      { hero: { lede: "Saved fixture" } },
      "untrusted",
      new Headers({ cookie: "reader=fixture", authorization: "Bearer fixture" }),
    ),
  ).toEqual(config);
  expect(written).toEqual({ hero: { lede: "Saved fixture" } });
  expect(forwarded.get("cookie")).toBe("reader=fixture");
  expect(forwarded.get("authorization")).toBe("Bearer fixture");
  await saveHomeConfig(
    {},
    null,
    new Headers({ cookie: "legacy-admin=fixture" }),
    "approved-proxy-token",
  );
  expect(forwarded.get("authorization")).toBe("Bearer approved-proxy-token");
  status = 403;
  await expect(saveHomeConfig({ hero: { lede: "Rejected fixture" } }, null)).rejects.toBeInstanceOf(
    HostHomeError,
  );
  status = 503;
  expect(await getHomeConfig()).toEqual(DEFAULT_HOME_CONFIG);
});

test("an absent host cannot reactivate Next database storage", async () => {
  delete process.env.SHENRON_HOST_URL;
  try {
    expect(await getHomeConfig()).toEqual(DEFAULT_HOME_CONFIG);
    const error = await saveHomeConfig({ hero: { lede: "Saved fixture" } }).catch(
      (value: unknown) => value,
    );
    expect(error).toBeInstanceOf(HostHomeError);
    if (!(error instanceof HostHomeError)) throw new Error("Expected a home service failure");
    expect(error.status).toBe(503);
  } finally {
    process.env.SHENRON_HOST_URL = server.url.origin;
  }
});
