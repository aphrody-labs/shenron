// SPDX-License-Identifier: Apache-2.0
// `/api/auth/*` is served by the Bun host before the Next relay, with the socket peer as the
// client address; without a host auth port the path falls through to Next.
import { afterAll, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createLocalApi } from "@shenron/api/host";
import { serveFront, type FrontHost } from "../src/front";

const upstream = Bun.serve({
  port: 0,
  hostname: "127.0.0.1",
  fetch: () => Response.json({ from: "next" }),
});
const dir = mkdtempSync(join(tmpdir(), "shenron-auth-front-"));
mkdirSync(join(dir, ".next", "static"), { recursive: true });
mkdirSync(join(dir, "public"), { recursive: true });

const seen: { realIp: string | null; forwardedFor: string | null; path: string }[] = [];
const withAuth = createLocalApi(
  { HOME: dir, SHENRON_DATA_DIR: dir, SHENRON_CHAT_TOOLS: "0", APHRODY_BIN: join(dir, "none") },
  {
    betterAuth: {
      handler: async (request) => {
        seen.push({
          realIp: request.headers.get("x-real-ip"),
          forwardedFor: request.headers.get("x-forwarded-for"),
          path: new URL(request.url).pathname,
        });
        return Response.json({ from: "better-auth" });
      },
    },
  },
);
const without = createLocalApi({
  HOME: dir,
  SHENRON_DATA_DIR: dir,
  SHENRON_CHAT_TOOLS: "0",
  APHRODY_BIN: join(dir, "none"),
});

const front = (host: FrontHost) =>
  serveFront({
    hostname: "127.0.0.1",
    port: 0,
    layout: { dist: join(dir, ".next"), publicDir: join(dir, "public") } as never,
    local: async () => null,
    host,
    nextPort: upstream.port ?? 0,
    ready: () => true,
  });
const on = front(withAuth as unknown as FrontHost);
const off = front(without as unknown as FrontHost);
afterAll(async () => {
  void on.stop(true);
  void off.stop(true);
  void upstream.stop(true);
  await withAuth.close();
  await without.close();
});

test("the group reports itself in the host groups", () => {
  expect(withAuth.groups.auth).toEqual({ available: true });
  expect(without.groups.auth.available).toBe(false);
});

test("/api/auth/* goes to Better Auth with the socket peer, forged headers dropped", async () => {
  const response = await fetch(`http://127.0.0.1:${on.port}/api/auth/get-session`, {
    headers: { "x-real-ip": "203.0.113.9", "x-forwarded-for": "203.0.113.9" },
  });
  expect(await response.json()).toEqual({ from: "better-auth" });
  expect(seen.at(-1)).toEqual({
    realIp: "127.0.0.1",
    forwardedFor: null,
    path: "/api/auth/get-session",
  });
  const post = await fetch(`http://127.0.0.1:${on.port}/api/auth/sign-out`, { method: "POST" });
  expect((await post.json()) as unknown).toEqual({ from: "better-auth" });
});

test("without an auth port the path is left to Next", async () => {
  const response = await fetch(`http://127.0.0.1:${off.port}/api/auth/get-session`);
  expect(await response.json()).toEqual({ from: "next" });
});
