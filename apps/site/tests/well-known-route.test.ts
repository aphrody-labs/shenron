// SPDX-License-Identifier: Apache-2.0
import { afterEach, expect, mock, test } from "bun:test";

const relayed: string[] = [];
mock.module("@/lib/host-auth", () => ({
  sessionAuth: {
    handler: async (request: Request) => {
      relayed.push(new URL(request.url).pathname);
      return Response.json({ issuer: "https://dragonballfr.com" });
    },
  },
}));

const { GET, HEAD, OPTIONS } = await import("../src/app/.well-known/[...path]/route");

afterEach(() => {
  relayed.length = 0;
});

const at = (path: string, method = "GET") =>
  new Request(`https://dragonballfr.com${path}`, { method });

test("unknown /.well-known paths answer 404 without reaching the auth host", async () => {
  for (const path of [
    "/.well-known/security.txt",
    "/.well-known/openid-configuration",
    "/.well-known/oauth-authorization-server",
    "/.well-known/unknown",
  ]) {
    expect((await GET(at(path))).status).toBe(404);
    expect((await HEAD(at(path, "HEAD"))).status).toBe(404);
    expect((await OPTIONS(at(path, "OPTIONS"))).status).toBe(404);
  }
  expect(relayed).toEqual([]);
});

test("the OAuth and MCP metadata aliases of the auth host are relayed", async () => {
  for (const path of [
    "/.well-known/oauth-protected-resource",
    "/.well-known/oauth-protected-resource/mcp",
    "/.well-known/oauth-authorization-server/api/auth",
  ]) {
    const response = await GET(at(path));
    expect(response.status).toBe(200);
  }
  expect(relayed).toEqual([
    "/.well-known/oauth-protected-resource",
    "/.well-known/oauth-protected-resource/mcp",
    "/.well-known/oauth-authorization-server/api/auth",
  ]);
});
