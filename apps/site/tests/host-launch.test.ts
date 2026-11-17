// SPDX-License-Identifier: Apache-2.0
import { afterAll, expect, mock, test } from "bun:test";
import {
  DEFAULT_LAUNCH_CONFIG,
  resolveLaunchConfig,
} from "@aphrody/shenron-config/wiki-launch-config";

mock.module("server-only", () => ({}));
mock.module("@/lib/db", () => {
  throw new Error("Launch policy must not initialize the Next database");
});
const previous = process.env.SHENRON_HOST_URL;
const originalNow = Date.now;
let now = originalNow();
Date.now = () => now;
let config = resolveLaunchConfig({ openKeys: ["characters"] });
let reads = 0;
let status = 200;
let forwarded = new Headers();
let written: unknown;
let pendingRead: ReturnType<typeof Promise.withResolvers<Response>> | null = null;
let pendingStarted: ReturnType<typeof Promise.withResolvers<void>> | null = null;
const server = Bun.serve({
  hostname: "127.0.0.1",
  port: 0,
  async fetch(request) {
    expect(new URL(request.url).pathname).toBe("/api/v1/site/launch");
    if (request.method === "POST") {
      written = await request.json();
      forwarded = request.headers;
      return Response.json({ ok: true, config }, { status });
    }
    reads++;
    if (pendingRead) pendingStarted?.resolve();
    return pendingRead ? pendingRead.promise : Response.json({ config }, { status });
  },
});
process.env.SHENRON_HOST_URL = server.url.origin;
const adapter = await import("../src/lib/wiki-launch-config");
afterAll(async () => {
  Date.now = originalNow;
  await server.stop(true);
  if (previous === undefined) delete process.env.SHENRON_HOST_URL;
  else process.env.SHENRON_HOST_URL = previous;
});

test("Next shares one policy read, retains the last policy on outage and never loads its database", async () => {
  const results = await Promise.all(Array.from({ length: 6 }, () => adapter.getLaunchConfig()));
  expect(reads).toBe(1);
  for (const result of results) expect(result).toEqual(config);
  now += 31_000;
  status = 503;
  expect(await adapter.getLaunchConfig()).toEqual(config);
  expect(reads).toBe(2);
  expect(await adapter.getLaunchConfig()).toEqual(config);
  expect(reads).toBe(2);
  status = 200;
});

test("a late policy read cannot replace a saved access rule", async () => {
  now += 31_000;
  pendingRead = Promise.withResolvers<Response>();
  pendingStarted = Promise.withResolvers<void>();
  const observed = adapter.getLaunchConfig();
  await pendingStarted.promise;
  config = resolveLaunchConfig({ access: { characters: { mode: "admin", roleIds: [] } } });
  expect(
    await adapter.saveLaunchConfig(
      { access: config.access },
      "forged",
      new Headers({ cookie: "reader=fixture", authorization: "Bearer fixture" }),
    ),
  ).toEqual(config);
  expect(written).toEqual({ access: config.access });
  expect(forwarded.get("cookie")).toBe("reader=fixture");
  expect(forwarded.get("authorization")).toBe("Bearer fixture");
  pendingRead.resolve(Response.json({ config: DEFAULT_LAUNCH_CONFIG }));
  pendingRead = null;
  expect(await observed).toEqual(config);
  expect(await adapter.getLaunchConfig()).toEqual(config);
  await adapter.saveLaunchConfig(
    { order: [] },
    null,
    new Headers({ cookie: "legacy=fixture" }),
    "approved-proxy-token",
  );
  expect(forwarded.get("authorization")).toBe("Bearer approved-proxy-token");
});

test("an absent Bun host cannot reactivate Next storage", async () => {
  delete process.env.SHENRON_HOST_URL;
  const fresh = await import(`../src/lib/wiki-launch-config.ts?fixture=${Math.random()}`);
  expect(await fresh.getLaunchConfig()).toEqual(DEFAULT_LAUNCH_CONFIG);
  await expect(fresh.saveLaunchConfig({ order: [] })).rejects.toMatchObject({ status: 503 });
  process.env.SHENRON_HOST_URL = server.url.origin;
});
