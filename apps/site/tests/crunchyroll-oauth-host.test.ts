// SPDX-License-Identifier: Apache-2.0
import { afterAll, expect, test } from "bun:test";
import {
  linkedCrunchyrollAccessToken,
  connectCrunchyrollAccount,
} from "../src/lib/crunchyroll-oauth-host";

const calls: Array<{ path: string; cookie: string | null; body: unknown }> = [];
const host = Bun.serve({
  port: 0,
  hostname: "127.0.0.1",
  async fetch(request) {
    const path = new URL(request.url).pathname;
    const body = request.method === "POST" ? await request.json() : null;
    calls.push({ path, cookie: request.headers.get("cookie"), body });
    if (path.endsWith("list-accounts"))
      return Response.json([{ id: "owned-account", providerId: "crunchyroll" }]);
    if (path.endsWith("get-access-token"))
      return Response.json({ accessToken: "private-linked-token" });
    return Response.json(
      { url: "https://auth.crunchyroll.com/authorize" },
      { headers: { "set-cookie": "oauth-state=opaque; HttpOnly; Secure" } },
    );
  },
});
afterAll(() => host.stop(true));
const target = `http://127.0.0.1:${host.port}`;
const req = () =>
  new Request("https://dragonballfr.com/api/admin/video/crunchyroll/connect", {
    method: "POST",
    headers: { cookie: "better-auth.session=private", origin: "https://dragonballfr.com" },
  });
test("linked token retrieval binds to the current session's returned account ID", async () => {
  expect(await linkedCrunchyrollAccessToken(req(), target)).toBe("private-linked-token");
  expect(calls.at(-1)?.body).toEqual({ accountId: "owned-account" });
  expect(calls.at(-1)?.cookie).toBe("better-auth.session=private");
});
test("OAuth linking preserves Better Auth state cookies and rejects foreign origins", async () => {
  const response = await connectCrunchyrollAccount(req(), target);
  expect(response.headers.get("set-cookie")).toContain("oauth-state=opaque");
  expect(calls.at(-1)?.body).toEqual({
    provider: "crunchyroll",
    callbackURL: "https://dragonballfr.com/admin",
  });
  const foreign = new Request(req(), { headers: { origin: "https://evil.test" } });
  const before = calls.length;
  expect((await connectCrunchyrollAccount(foreign, target)).status).toBe(403);
  expect(calls.length).toBe(before);
});
