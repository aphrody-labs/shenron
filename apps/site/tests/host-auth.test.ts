import { afterAll, expect, mock, test } from "bun:test";

mock.module("server-only", () => ({}));

process.env.DATABASE_URL ??= "postgres://u:p@127.0.0.1:1/db";
process.env.BETTER_AUTH_SECRET ??= "s".repeat(40);
process.env.DISCORD_CLIENT_ID ??= "1234567890";
process.env.DISCORD_CLIENT_SECRET ??= "1234567890";

const seen: { path: string; cookie: string | null; method: string }[] = [];
const host = Bun.serve({
  port: 0,
  hostname: "127.0.0.1",
  fetch(request) {
    const url = new URL(request.url);
    seen.push({
      path: url.pathname,
      cookie: request.headers.get("cookie"),
      method: request.method,
    });
    if (url.pathname === "/api/auth/get-session")
      return request.headers.get("cookie")
        ? Response.json({ user: { id: "u1" } })
        : Response.json(null);
    return new Response(null, { status: 302, headers: { location: "https://discord.test/x" } });
  },
});
afterAll(() => host.stop(true));
const origin = `http://127.0.0.1:${host.port}`;

test("the host session is read with the forwarded cookie, null without session or host", async () => {
  const { hostGetSession } = await import("../src/lib/host-auth");
  expect(await hostGetSession(origin, new Headers({ cookie: "a=b" }))).toEqual({
    user: { id: "u1", name: null, image: null },
  });
  expect(await hostGetSession(origin, new Headers())).toBeNull();
  expect(await hostGetSession("http://127.0.0.1:1", new Headers({ cookie: "a=b" }))).toBeNull();
});

test("/api/auth/* is relayed to the host without following its redirects", async () => {
  const { proxyAuthToHost } = await import("../src/lib/host-auth");
  const response = await proxyAuthToHost(
    new Request("https://dragonballfr.com/api/auth/sign-in/social?x=1", {
      method: "POST",
      headers: { cookie: "k=v", "content-type": "application/json" },
      body: "{}",
    }),
    origin,
  );
  expect(response.status).toBe(302);
  expect(response.headers.get("location")).toBe("https://discord.test/x");
  expect(seen.at(-1)).toEqual({ path: "/api/auth/sign-in/social", cookie: "k=v", method: "POST" });
});

test("without SHENRON_HOST_URL the site keeps its own auth", async () => {
  delete process.env.SHENRON_HOST_URL;
  const { hostAuthUrl } = await import("../src/lib/host-auth");
  expect(hostAuthUrl()).toBeNull();
  process.env.SHENRON_HOST_URL = "http://127.0.0.1:4000/";
  expect(hostAuthUrl()).toBe("http://127.0.0.1:4000");
  delete process.env.SHENRON_HOST_URL;
});
