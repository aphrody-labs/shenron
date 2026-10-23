// SPDX-License-Identifier: Apache-2.0
/** OAuth code exchange, token verification and the development identities. */
import { afterEach, describe, expect, test } from "bun:test";
import { createDevPort, devIdentity } from "../src/auth/dev";
import { createDiscordPort, DISCORD_API } from "../src/auth/discord";
import { ConfigError, loadConfig } from "../src/config";
import type { RunningActivityServer } from "../src/server";
import { fakeDiscord, startTestServer, testConfig } from "./support";

interface Seen {
  readonly url: string;
  readonly method: string;
  readonly headers: Headers;
  readonly body: string;
}

/** A `fetch` that records requests and answers from a queue of responders. */
function scripted(...responders: Array<(seen: Seen) => Response | Promise<Response>>) {
  const seen: Seen[] = [];
  const impl = (async (input: string | URL | Request, init?: RequestInit) => {
    const entry: Seen = {
      url: String(input),
      method: init?.method ?? "GET",
      headers: new Headers(init?.headers),
      body: init?.body ? String(init.body) : "",
    };
    seen.push(entry);
    const responder = responders[Math.min(seen.length - 1, responders.length - 1)]!;
    return responder(entry);
  }) as typeof fetch;
  return { seen, fetch: impl };
}

describe("code exchange", () => {
  test("posts the code with the secrets to Discord and returns only the access token", async () => {
    const bot = scripted(() =>
      Response.json({
        access_token: "discord-access-token-123",
        refresh_token: "must-not-leak",
        scope: "identify",
        token_type: "Bearer",
        expires_in: 604800,
      }),
    );
    const port = createDiscordPort({
      clientId: "123456789012345678",
      clientSecret: "the-client-secret",
      fetch: bot.fetch,
    });
    const result = await port.exchangeCode("authorization-code-abc");
    expect(result).toEqual({ ok: true, accessToken: "discord-access-token-123" });
    expect(bot.seen).toHaveLength(1);
    const call = bot.seen[0]!;
    expect(call.url).toBe(`${DISCORD_API}/oauth2/token`);
    expect(call.method).toBe("POST");
    expect(call.headers.get("content-type")).toBe("application/x-www-form-urlencoded");
    const form = new URLSearchParams(call.body);
    expect(Object.fromEntries(form)).toEqual({
      client_id: "123456789012345678",
      client_secret: "the-client-secret",
      grant_type: "authorization_code",
      code: "authorization-code-abc",
    });
  });

  test("tells a refused code from an unavailable Discord", async () => {
    const make = (response: () => Response) =>
      createDiscordPort({
        clientId: "123456789012345678",
        clientSecret: "s",
        fetch: scripted(response).fetch,
      });
    expect(
      await make(() => new Response("{}", { status: 400 })).exchangeCode("code-12345678"),
    ).toEqual({
      ok: false,
      reason: "invalid_code",
    });
    expect(
      await make(() => new Response("oops", { status: 503 })).exchangeCode("code-12345678"),
    ).toEqual({
      ok: false,
      reason: "unavailable",
    });
    expect(await make(() => Response.json({ nope: 1 })).exchangeCode("code-12345678")).toEqual({
      ok: false,
      reason: "unavailable",
    });
    const down = createDiscordPort({
      clientId: "123456789012345678",
      clientSecret: "s",
      fetch: (async () => {
        throw new Error("network down");
      }) as unknown as typeof fetch,
    });
    expect(await down.exchangeCode("code-12345678")).toEqual({ ok: false, reason: "unavailable" });
  });

  test("a malformed code never reaches Discord; a missing secret is not configured", async () => {
    const bot = scripted(() => Response.json({}));
    const port = createDiscordPort({
      clientId: "123456789012345678",
      clientSecret: "s",
      fetch: bot.fetch,
    });
    for (const code of ["", "short", "has space in it 123", "x".repeat(600), "a&b=c-12345678"])
      expect(await port.exchangeCode(code)).toEqual({ ok: false, reason: "invalid_code" });
    expect(bot.seen).toHaveLength(0);
    const bare = createDiscordPort({ clientId: null, clientSecret: null, fetch: bot.fetch });
    expect(await bare.exchangeCode("code-12345678")).toEqual({
      ok: false,
      reason: "not_configured",
    });
  });
});

describe("POST /api/token", () => {
  let running: RunningActivityServer | null = null;
  afterEach(async () => {
    await running?.stop();
    running = null;
  });

  const post = (body: unknown, url: string) =>
    fetch(`${url}/api/token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: typeof body === "string" ? body : JSON.stringify(body),
    });

  test("exchanges a code through the injected Discord port", async () => {
    running = startTestServer();
    const response = await post({ code: "good-code-123" }, running.url);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ access_token: "token-goku-1" });
  });

  test("end to end with the real Discord port over a simulated fetch", async () => {
    const discord = scripted(() => Response.json({ access_token: "from-discord-token-9" }));
    running = startTestServer({
      discord: createDiscordPort({
        clientId: "123456789012345678",
        clientSecret: "client-secret-value",
        fetch: discord.fetch,
      }),
    });
    const response = await post({ code: "real-code-12345" }, running.url);
    expect(await response.json()).toEqual({ access_token: "from-discord-token-9" });
    expect(new URLSearchParams(discord.seen[0]!.body).get("client_secret")).toBe(
      "client-secret-value",
    );
  });

  test("maps failures to statuses without echoing Discord's answer or any secret", async () => {
    running = startTestServer();
    const refused = await post({ code: "bad-code-12345" }, running.url);
    expect(refused.status).toBe(400);
    expect(await refused.json()).toEqual({ error: "invalid_code" });
    for (const body of ["{", "[]", "null", JSON.stringify({ code: 12 }), JSON.stringify({})]) {
      const response = await post(body, running.url);
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ error: "invalid_request" });
    }
    const huge = await post({ code: "x".repeat(5_000) }, running.url);
    expect(huge.status).toBe(413);
    const wrongMethod = await fetch(`${running.url}/api/token`);
    expect(wrongMethod.status).toBe(405);
  });

  test("an unavailable Discord is a 502 and a missing secret a 503", async () => {
    running = startTestServer({
      discord: {
        exchangeCode: async () => ({ ok: false, reason: "unavailable" }),
        identify: async () => null,
      },
    });
    expect((await post({ code: "code-12345678" }, running.url)).status).toBe(502);
    await running.stop();
    running = startTestServer({
      discord: createDiscordPort({ clientId: null, clientSecret: null }),
    });
    const response = await post({ code: "code-12345678" }, running.url);
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "not_configured" });
  });

  test("a client that hammers the route is slowed down", async () => {
    running = startTestServer();
    let limited: Response | null = null;
    for (let i = 0; i < 40 && !limited; i++) {
      const response = await post({ code: "bad-code-12345" }, running.url);
      if (response.status === 429) limited = response;
    }
    expect(limited).not.toBeNull();
    expect(Number(limited!.headers.get("retry-after"))).toBeGreaterThan(0);
  });
});

describe("token verification", () => {
  const user = {
    id: "100000000000000001",
    username: "goku",
    global_name: "Son Goku",
    avatar: "a1b2c3",
  };

  test("takes the identity from Discord, not from the client", async () => {
    const discord = scripted(() => Response.json(user));
    const port = createDiscordPort({ clientId: "1", clientSecret: "s", fetch: discord.fetch });
    expect(await port.identify("access-token-123")).toEqual({
      userId: "100000000000000001",
      name: "Son Goku",
      avatar: "a1b2c3",
    });
    expect(discord.seen[0]!.url).toBe(`${DISCORD_API}/users/@me`);
    expect(discord.seen[0]!.headers.get("authorization")).toBe("Bearer access-token-123");
  });

  test("prefers the guild nickname and survives its absence", async () => {
    const discord = scripted(
      () => Response.json(user),
      () => Response.json({ nick: "Kakarot" }),
    );
    const port = createDiscordPort({ clientId: "1", clientSecret: "s", fetch: discord.fetch });
    expect((await port.identify("access-token-123", "222222222222222222"))?.name).toBe("Kakarot");
    expect(discord.seen[1]!.url).toBe(`${DISCORD_API}/users/@me/guilds/222222222222222222/member`);

    const noMember = scripted(
      () => Response.json(user),
      () => new Response("{}", { status: 403 }),
    );
    const plain = createDiscordPort({ clientId: "1", clientSecret: "s", fetch: noMember.fetch });
    expect((await plain.identify("access-token-456", "222222222222222222"))?.name).toBe("Son Goku");
  });

  test("falls back to the username and rejects malformed answers", async () => {
    const noGlobal = scripted(() => Response.json({ ...user, global_name: null, avatar: null }));
    const port = createDiscordPort({ clientId: "1", clientSecret: "s", fetch: noGlobal.fetch });
    expect(await port.identify("access-token-123")).toEqual({
      userId: "100000000000000001",
      name: "goku",
      avatar: null,
    });
    const odd = createDiscordPort({
      clientId: "1",
      clientSecret: "s",
      fetch: scripted(() => Response.json({ id: "not-a-snowflake", username: "x" })).fetch,
    });
    expect(await odd.identify("access-token-123")).toBeNull();
  });

  test("a verified token is trusted briefly; a refused one is remembered even shorter", async () => {
    let time = 1_000_000;
    const ok = scripted(() => Response.json(user));
    const port = createDiscordPort({
      clientId: "1",
      clientSecret: "s",
      fetch: ok.fetch,
      now: () => time,
      identityTtlMs: 60_000,
      refusalTtlMs: 10_000,
    });
    await port.identify("access-token-123");
    await port.identify("access-token-123");
    expect(ok.seen).toHaveLength(1);
    time += 61_000;
    await port.identify("access-token-123");
    expect(ok.seen).toHaveLength(2);

    const refused = scripted(() => new Response("{}", { status: 401 }));
    const strict = createDiscordPort({
      clientId: "1",
      clientSecret: "s",
      fetch: refused.fetch,
      now: () => time,
      refusalTtlMs: 10_000,
    });
    expect(await strict.identify("access-token-bad")).toBeNull();
    expect(await strict.identify("access-token-bad")).toBeNull();
    expect(refused.seen).toHaveLength(1);
    time += 11_000;
    await strict.identify("access-token-bad");
    expect(refused.seen).toHaveLength(2);
  });

  test("an unreachable Discord is not cached as a refusal", async () => {
    let up = false;
    const flaky = (async () => {
      if (!up) throw new Error("down");
      return Response.json(user);
    }) as unknown as typeof fetch;
    const port = createDiscordPort({ clientId: "1", clientSecret: "s", fetch: flaky });
    expect(await port.identify("access-token-123")).toBeNull();
    up = true;
    expect((await port.identify("access-token-123"))?.userId).toBe("100000000000000001");
  });

  test("tokens that cannot be real are not sent to Discord", async () => {
    const discord = scripted(() => Response.json(user));
    const port = createDiscordPort({ clientId: "1", clientSecret: "s", fetch: discord.fetch });
    for (const token of ["", "short", "has space 12345", "x".repeat(900)])
      expect(await port.identify(token)).toBeNull();
    expect(discord.seen).toHaveLength(0);
  });
});

describe("development identities", () => {
  test("map mock codes to fixed characters", async () => {
    const port = createDevPort();
    expect(await port.exchangeCode("mock-code-2")).toEqual({
      ok: true,
      accessToken: "dev-token-2",
    });
    expect((await port.exchangeCode("mock-code-9")).ok).toBe(false);
    expect(await port.identify("dev-token-2")).toEqual(devIdentity(2));
    expect(await port.identify("dev-token-9")).toBeNull();
    expect(devIdentity(1)?.userId).toMatch(/^\d{18}$/);
  });

  test("are refused in production and on a public bind", () => {
    expect(() => loadConfig({ SHENRON_ACTIVITY_DEV_AUTH: "1", NODE_ENV: "production" })).toThrow(
      ConfigError,
    );
    expect(() =>
      loadConfig({ SHENRON_ACTIVITY_DEV_AUTH: "1", SHENRON_ACTIVITY_HOST: "0.0.0.0" }),
    ).toThrow(ConfigError);
    expect(loadConfig({ SHENRON_ACTIVITY_DEV_AUTH: "1" }).devAuth).toBe(true);
    expect(loadConfig({}).devAuth).toBe(false);
  });

  test("a development server accepts them over the real routes", async () => {
    const server = startTestServer({
      config: testConfig({ SHENRON_ACTIVITY_DEV_AUTH: "1" }),
      discord: undefined,
    });
    try {
      const response = await fetch(`${server.url}/api/token`, {
        method: "POST",
        body: JSON.stringify({ code: "mock-code-3" }),
      });
      expect(await response.json()).toEqual({ access_token: "dev-token-3" });
    } finally {
      await server.stop();
    }
  });
});

describe("configuration", () => {
  test("reads the documented variables", () => {
    const config = loadConfig({
      SHENRON_ACTIVITY_PORT: "5999",
      SHENRON_ACTIVITY_PUBLIC_URL: "https://activity.dragonballfr.com/",
      DISCORD_CLIENT_ID: "123456789012345678",
      DISCORD_CLIENT_SECRET: " secret ",
      SHENRON_ACTIVITY_SECRET: "x".repeat(32),
      SHENRON_BOT_API_URL: "http://127.0.0.1:5006/",
      SHENRON_ACTIVITY_TOKEN: "service-token",
    });
    expect(config).toMatchObject({
      port: 5999,
      host: "127.0.0.1",
      publicUrl: "https://activity.dragonballfr.com",
      clientId: "123456789012345678",
      clientSecret: "secret",
      botApiUrl: "http://127.0.0.1:5006",
      botApiToken: "service-token",
      devAuth: false,
    });
    expect(config.activitySecret).toBe("x".repeat(32));
    expect(config.warnings).toEqual([]);
  });

  test("falls back to the shared bot API address and drops what is unusable", () => {
    const config = loadConfig({
      SHENRON_ACTIVITY_SECRET: "short",
      DISCORD_CLIENT_ID: "not-a-number",
      SHENRON_ACTIVITY_PUBLIC_URL: "ftp://x",
    });
    expect(config.botApiUrl).toBe("http://127.0.0.1:5006");
    expect(config.activitySecret).toBeNull();
    expect(config.clientId).toBeNull();
    expect(config.publicUrl).toBeNull();
    expect(config.warnings).toHaveLength(3);
    expect(() => loadConfig({ SHENRON_ACTIVITY_PORT: "99999" })).toThrow(ConfigError);
  });

  test("the fake Discord of the tests is only a test double", async () => {
    expect((await fakeDiscord().identify("nope-nope-nope")) === null).toBe(true);
  });
});
