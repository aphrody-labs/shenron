// SPDX-License-Identifier: Apache-2.0
import { afterAll, expect, mock, test } from "bun:test";
import { DEFAULT_CHRONOLOGY_CONFIG, resolveChronologyConfig } from "@shenron/config/chronology";

mock.module("server-only", () => ({}));
mock.module("@/lib/db", () => {
  throw new Error("Hosted home must not initialize the Next database");
});
const { getChronologyConfig, saveChronologyConfig, HostChronologyError } =
  await import("../src/lib/chronology-config");
let config = resolveChronologyConfig({ overrides: { "episode:1": { title: "First fixture" } } });
let status = 200;
let written: unknown;
let forwarded = new Headers();
const server = Bun.serve({
  hostname: "127.0.0.1",
  port: 0,
  async fetch(request) {
    expect(new URL(request.url).pathname).toBe("/api/v1/site/chronology");
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

test("Next reads and writes the hosted chronology without resolving DB, while preserving request credentials", async () => {
  expect((await getChronologyConfig()).overrides["episode:1"]?.title).toBe("First fixture");
  config = resolveChronologyConfig({ overrides: { "episode:1": { title: "Latest fixture" } } });
  expect((await getChronologyConfig()).overrides["episode:1"]?.title).toBe("Latest fixture");
  expect(
    await saveChronologyConfig(
      { overrides: { "episode:1": { title: "Saved fixture" } } },
      "untrusted",
      new Headers({ cookie: "reader=fixture", authorization: "Bearer fixture" }),
    ),
  ).toEqual(config);
  expect(written).toEqual({ overrides: { "episode:1": { title: "Saved fixture" } } });
  expect(forwarded.get("cookie")).toBe("reader=fixture");
  expect(forwarded.get("authorization")).toBe("Bearer fixture");
  await saveChronologyConfig(
    {},
    null,
    new Headers({ cookie: "legacy-admin=fixture" }),
    "approved-proxy-token",
  );
  expect(forwarded.get("authorization")).toBe("Bearer approved-proxy-token");
  status = 403;
  await expect(
    saveChronologyConfig({ overrides: { "episode:1": { title: "Rejected fixture" } } }, null),
  ).rejects.toBeInstanceOf(HostChronologyError);
  status = 503;
  expect(await getChronologyConfig()).toEqual(DEFAULT_CHRONOLOGY_CONFIG);
});

test("an absent host cannot reactivate Next database storage", async () => {
  delete process.env.SHENRON_HOST_URL;
  try {
    expect(await getChronologyConfig()).toEqual(DEFAULT_CHRONOLOGY_CONFIG);
    const error = await saveChronologyConfig({
      overrides: { "episode:1": { title: "Saved fixture" } },
    }).catch((value: unknown) => value);
    expect(error).toBeInstanceOf(HostChronologyError);
    if (!(error instanceof HostChronologyError)) throw new Error("Expected a home service failure");
    expect(error.status).toBe(503);
  } finally {
    process.env.SHENRON_HOST_URL = server.url.origin;
  }
});
