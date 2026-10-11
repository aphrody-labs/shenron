import { afterAll, expect, mock, test } from "bun:test";

mock.module("server-only", () => ({}));

process.env.DATABASE_URL ??= "postgres://u:p@127.0.0.1:1/db";
process.env.BETTER_AUTH_SECRET ??= "s".repeat(40);
process.env.DISCORD_CLIENT_ID ??= "1234567890";
process.env.DISCORD_CLIENT_SECRET ??= "1234567890";

const seen: { path: string; cookie: string | null; method: string; fresh?: boolean }[] = [];
const host = Bun.serve({
  port: 0,
  hostname: "127.0.0.1",
  fetch(request) {
    const url = new URL(request.url);
    seen.push({
      path: url.pathname,
      cookie: request.headers.get("cookie"),
      method: request.method,
      ...(url.pathname === "/api/auth/get-session"
        ? { fresh: url.searchParams.get("disableCookieCache") === "true" }
        : {}),
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
  expect(seen.at(-1)?.fresh).toBe(true);
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

test("without SHENRON_HOST_URL the site fails closed without local auth", async () => {
  delete process.env.SHENRON_HOST_URL;
  const { hostAuthUrl, sessionAuth } = await import("../src/lib/host-auth");
  expect(hostAuthUrl()).toBeNull();
  expect(await sessionAuth.api.getSession({ headers: new Headers({ cookie: "a=b" }) })).toBeNull();
  const unavailable = await sessionAuth.handler(
    new Request("https://dragonballfr.com/api/auth/get-session"),
  );
  expect(unavailable.status).toBe(503);
  expect(unavailable.headers.get("cache-control")).toBe("private, no-store");
  process.env.SHENRON_HOST_URL = "http://127.0.0.1:4000/";
  expect(hostAuthUrl()).toBe("http://127.0.0.1:4000");
  delete process.env.SHENRON_HOST_URL;
});

test("the actual Next auth route and server session facade only call the configured host", async () => {
  const previous = process.env.SHENRON_HOST_URL;
  process.env.SHENRON_HOST_URL = origin;
  try {
    const { GET, POST } = await import("../src/app/api/auth/[...all]/route");
    const { sessionAuth } = await import("../src/lib/host-auth");
    expect(await sessionAuth.api.getSession({ headers: new Headers({ cookie: "a=b" }) })).toEqual({
      user: { id: "u1", name: null, image: null },
    });
    const response = await POST(
      new Request("https://dragonballfr.com/api/auth/sign-in/social", {
        method: "POST",
        body: "{}",
        headers: { "content-type": "application/json" },
      }),
    );
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("https://discord.test/x");
    process.env.SHENRON_HOST_URL = "http://127.0.0.1:1";
    expect((await GET(new Request("https://dragonballfr.com/api/auth/get-session"))).status).toBe(
      503,
    );
  } finally {
    if (previous === undefined) delete process.env.SHENRON_HOST_URL;
    else process.env.SHENRON_HOST_URL = previous;
  }
});
