// SPDX-License-Identifier: Apache-2.0
import { expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createDesktopLinkHandler } from "../src/host/desktop-link";
import { createLocalApi } from "../src/host";
import { verifyDesktopLink } from "../src/desktop-link";
import type { BetterAuthPort, ChatSocketData } from "../src/server";

const secret = "synthetic-secret-".repeat(3);
const state = "s".repeat(32);
const path = `/api/desktop/link?state=${state}&port=4123`;
const auth: BetterAuthPort = {
  handler: async () => new Response(),
  session: async (headers) =>
    headers.get("cookie")?.includes("synthetic-session=valid")
      ? { userId: "synthetic-user", discordId: "123456789012345678" }
      : null,
};

test("desktop link rejects malformed state, privileged ports and wrong methods before session lookup", async () => {
  let calls = 0;
  const handler = createDesktopLinkHandler(
    { BETTER_AUTH_SECRET: secret },
    {
      ...auth,
      session: async () => {
        calls++;
        return null;
      },
    },
  );
  for (const suffix of [
    "?state=short&port=4123",
    `?state=${state}&port=80`,
    `?state=${state}&port=evil`,
  ]) {
    expect(
      (await handler(new Request(`https://example.test/api/desktop/link${suffix}`))).status,
    ).toBe(400);
  }
  expect(
    (await handler(new Request(`https://example.test${path}`, { method: "POST" }))).status,
  ).toBe(405);
  expect(calls).toBe(0);
});

test("anonymous desktop sign-in keeps its callback relative and never uses owner headers", async () => {
  const handler = createDesktopLinkHandler({ BETTER_AUTH_SECRET: secret }, auth);
  const response = await handler(
    new Request(`https://internal.test${path}`, {
      headers: { "X-Shenron-Owner": "discord:123456789012345678" },
    }),
  );
  expect(response.status).toBe(302);
  expect(response.headers.get("location")).toBe(`/signin?callbackURL=${encodeURIComponent(path)}`);
  expect(response.headers.get("cache-control")).toBe("private, no-store");
});

test("missing auth, missing secret and session errors fail closed", async () => {
  for (const handler of [
    createDesktopLinkHandler({ BETTER_AUTH_SECRET: secret }, null),
    createDesktopLinkHandler({}, auth),
    createDesktopLinkHandler(
      { BETTER_AUTH_SECRET: secret },
      {
        ...auth,
        session: async () => {
          throw new Error("unavailable");
        },
      },
    ),
  ])
    expect((await handler(new Request(`https://example.test${path}`))).status).toBe(503);
});

test("the actual Bun host issues state-bound localized codes through both mounting modes", async () => {
  const dir = mkdtempSync(join(tmpdir(), "shenron-desktop-link-"));
  const host = createLocalApi(
    {
      HOME: dir,
      SHENRON_DATA_DIR: dir,
      APHRODY_BIN: join(dir, "absent"),
      SHENRON_CHAT_TOOLS: "0",
      BETTER_AUTH_SECRET: secret,
      SHENRON_CHAT_STORE: "off",
      SHENRON_CHAT_BACKENDS: "none",
    },
    { betterAuth: auth },
  );
  const servers = [
    Bun.serve<ChatSocketData>(
      Object.assign(host.serveOptions(), { hostname: "127.0.0.1", port: 0 }),
    ),
    Bun.serve({
      hostname: "127.0.0.1",
      port: 0,
      fetch: (request, server) => host.fetch(request, server),
      websocket: host.websocket,
    }),
  ];
  try {
    expect(host.handles("/api/desktop/link")).toBe(true);
    for (const server of servers) {
      const response = await fetch(`http://127.0.0.1:${server.port}${path}`, {
        redirect: "manual",
        headers: { cookie: "synthetic-session=valid; NEXT_LOCALE=ja" },
      });
      expect(response.status).toBe(302);
      const callback = new URL(response.headers.get("location")!);
      expect(callback.origin).toBe("http://127.0.0.1:4123");
      expect(callback.pathname).toBe("/api/local/agent-home/callback");
      const code = callback.searchParams.get("code")!;
      expect(verifyDesktopLink(secret, code, state)).toEqual({
        discordId: "123456789012345678",
        name: null,
        avatarUrl: null,
        language: "ja",
      });
      expect(verifyDesktopLink(secret, code, "t".repeat(32))).toBeNull();
      expect(verifyDesktopLink(secret, code, state, Date.now() + 120_001)).toBeNull();
      const verify = (value: unknown) =>
        fetch(`http://127.0.0.1:${server.port}/api/desktop/link/verify`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(value),
        });
      expect(await (await verify({ code, state })).json()).toEqual({
        discordId: "123456789012345678",
        name: null,
        avatarUrl: null,
        language: "ja",
      });
      expect((await verify({ code, state: "t".repeat(32) })).status).toBe(400);
      expect((await verify({ code: "x".repeat(9000), state })).status).toBe(413);
    }
  } finally {
    await Promise.all(servers.map((server) => server.stop(true)));
    await host.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
