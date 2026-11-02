// SPDX-License-Identifier: Apache-2.0
/** Better Auth on the Bun host: options from the shared bricks, group availability reasons. */
import { expect, test } from "bun:test";
import { betterAuth } from "better-auth";
import { memoryAdapter } from "better-auth/adapters/memory";
import { buildHostAuthOptions, createHostAuth } from "../src/host/auth";
import { BETTER_AUTH_PATH, type BetterAuthPort, createShenronApi } from "../src/server";

const discord = { DISCORD_CLIENT_ID: "id", DISCORD_CLIENT_SECRET: "secret" };
const longSecret = "s".repeat(40);

test("Bun profile updates reject invalid input before writing and preserve partial updates", async () => {
  const options = buildHostAuthOptions({ BETTER_AUTH_SECRET: longSecret, ...discord }, undefined);
  if ("reason" in options) throw new Error(options.reason);
  const auth = betterAuth({
    ...options,
    baseURL: "http://localhost:3000",
    database: memoryAdapter({
      user: [],
      session: [],
      account: [],
      verification: [],
      twoFactor: [],
      passkey: [],
      jwks: [],
      oauthClient: [],
      oauthResource: [],
      oauthClientResource: [],
      oauthRefreshToken: [],
      oauthAccessToken: [],
      oauthConsent: [],
      oauthClientAssertion: [],
    }),
    emailAndPassword: { enabled: true },
    logger: { disabled: true },
  });
  const request = (path: string, body: unknown, cookie = "") =>
    new Request(`http://localhost:3000/api/auth/${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: "http://localhost:3000", cookie },
      body: JSON.stringify(body),
    });
  const cookies = (response: Response) =>
    response.headers
      .getSetCookie()
      .map((value) => value.split(";")[0])
      .join("; ");
  const signed = await auth.handler(
    request("sign-up/email", {
      name: "Goku",
      email: "profile@example.test",
      password: "test-password-123456",
      image: "https://example.test/goku.png",
    }),
  );
  expect(signed.status).toBe(200);
  let cookie = cookies(signed);
  const readUser = async () => {
    const session = await auth.api.getSession({
      headers: new Headers({ cookie }),
      query: { disableCookieCache: true },
    });
    if (!session) throw new Error("Missing test session");
    return session.user;
  };
  for (const body of [
    { name: " " },
    { name: " G " },
    { name: "a".repeat(49) },
    { name: null },
    { name: 123 },
    { name: [] },
    { image: "http://example.test/goku.png" },
    { image: "javascript:alert(1)" },
    { image: "not a url" },
    { image: 123 },
    { name: "Vegeta", image: false },
  ]) {
    const rejected = await auth.handler(request("update-user", body, cookie));
    expect(rejected.status).toBe(400);
    const user = await readUser();
    expect(user.name).toBe("Goku");
    expect(user.image).toBe("https://example.test/goku.png");
  }
  for (const [body, expected] of [
    [{ name: "  悟空  " }, { name: "悟空", image: "https://example.test/goku.png" }],
    [{ name: "a".repeat(48) }, { name: "a".repeat(48), image: "https://example.test/goku.png" }],
    [
      { image: "https://example.test/vegeta.png" },
      { name: "a".repeat(48), image: "https://example.test/vegeta.png" },
    ],
    [{ image: null }, { name: "a".repeat(48), image: null }],
    [{ image: "" }, { name: "a".repeat(48), image: "" }],
  ] as const) {
    const updated = await auth.handler(request("update-user", body, cookie));
    expect(updated.status).toBe(200);
    cookie = cookies(updated) || cookie;
    const user = await readUser();
    expect(user.name).toBe(expected.name);
    expect(user.image).toBe(expected.image);
    // Better Auth must refresh the signed cookie as well as the stored profile.
    const cached = await auth.api.getSession({ headers: new Headers({ cookie }) });
    expect(cached?.user.name).toBe(expected.name);
    expect(cached?.user.image).toBe(expected.image);
  }
  const unsigned = await auth.handler(request("update-user", { name: "Vegeta" }));
  expect(unsigned.status).toBe(401);
});

test("production options use the shared policy: secure cookies, consent, no localhost", () => {
  const options = buildHostAuthOptions(
    { NODE_ENV: "production", BETTER_AUTH_SECRET: longSecret, ...discord },
    undefined,
  );
  if ("reason" in options) throw new Error(options.reason);
  expect(options.basePath).toBe("/api/auth");
  expect(options.secret).toBe(longSecret);
  expect(options.advanced?.useSecureCookies).toBe(true);
  expect(options.rateLimit?.enabled).toBe(true);
  expect(options.rateLimit?.customStorage).toBeDefined();
  expect(options.trustedOrigins).not.toContain("http://localhost:3000");
  const providers = options.socialProviders as { discord: { prompt: string; scope: string[] } };
  expect(providers.discord.prompt).toBe("consent");
  expect(providers.discord.scope).toEqual(["guilds", "guilds.members.read"]);
});

test("extra hosts and origins of a desktop profile are appended from the environment", () => {
  const options = buildHostAuthOptions(
    {
      BETTER_AUTH_SECRET: longSecret,
      SHENRON_AUTH_ALLOWED_HOSTS: "127.0.0.1:4000",
      SHENRON_AUTH_TRUSTED_ORIGINS: "http://127.0.0.1:4000",
      ...discord,
    },
    undefined,
  );
  if ("reason" in options) throw new Error(options.reason);
  expect(options.trustedOrigins).toContain("http://127.0.0.1:4000");
  expect((options.baseURL as { allowedHosts: string[] }).allowedHosts).toContain("127.0.0.1:4000");
});

test("a missing piece disables the group with a reason, never throws", () => {
  const withoutDiscord = buildHostAuthOptions({ BETTER_AUTH_SECRET: longSecret }, undefined);
  expect("reason" in withoutDiscord).toBe(false);
  if (!("reason" in withoutDiscord)) {
    expect(withoutDiscord.socialProviders).toEqual({});
    expect(withoutDiscord.emailAndPassword).toMatchObject({ enabled: true });
  }
  expect(buildHostAuthOptions({ NODE_ENV: "production", ...discord }, undefined)).toEqual({
    reason: "BETTER_AUTH_SECRET absent ou trop court",
  });
  expect(createHostAuth({ ...discord })).toEqual({
    reason: "DATABASE_URL absente : authentification indisponible",
  });
  expect(createHostAuth({ DATABASE_URL: "mysql://x", ...discord })).toEqual({
    reason: "DATABASE_URL invalide",
  });
});

test("with a database URL and a Discord application the port is built (lazy connection)", async () => {
  const built = createHostAuth({
    DATABASE_URL: "postgres://u:p@127.0.0.1:1/db",
    BETTER_AUTH_SECRET: longSecret,
    ...discord,
  });
  expect("port" in built).toBe(true);
  if ("port" in built) await built.close();
});

test("createShenronApi claims /api/auth only with a port, and hands the request over", async () => {
  const base = {
    rateLimit: { hit: async () => ({ allowed: true, retryAfterSeconds: 0 }) },
    publicCache: { get: async () => null, set: async () => {} },
    invalidation: { invalidate: async () => {} },
    cors: { allowedOrigins: [] },
    clientIp: () => "127.0.0.1",
    isDirectLoopback: () => true,
  } as never;
  const off = createShenronApi(base, { service: "shenron-server" });
  expect(off.handles(`${BETTER_AUTH_PATH}/get-session`)).toBe(false);
  const port: BetterAuthPort = { handler: async (r) => new Response(new URL(r.url).pathname) };
  const on = createShenronApi({ ...(base as object), betterAuth: port } as never, {
    service: "shenron-server",
  });
  expect(on.handles(`${BETTER_AUTH_PATH}/callback/discord`)).toBe(true);
  expect(on.handles("/api/authx")).toBe(false);
  const response = await on.request(`${BETTER_AUTH_PATH}/callback/discord`, { method: "POST" });
  expect(await response.text()).toBe("/api/auth/callback/discord");
  expect(Object.keys(on.routes)).toContain("/api/auth/*");
});

test("the AuthPort resolves the owner and admin from a Better Auth session", async () => {
  const { createEnvAuth } = await import("../src/host");
  const sessions: Record<string, { userId: string; discordId?: string | null; staff?: boolean }> = {
    linked: { userId: "u1", discordId: "123456789012345678", staff: false },
    plain: { userId: "u2", discordId: null },
    staff: { userId: "u3", discordId: "223456789012345678", staff: true },
  };
  const auth = createEnvAuth(
    { SHENRON_ADMIN_TOKEN: "adm" },
    () => true,
    async (headers) => sessions[headers.get("authorization")?.slice(7) ?? ""] ?? null,
  );
  const req = (token?: string) =>
    new Request("http://x/", { headers: token ? { authorization: `Bearer ${token}` } : {} });
  expect(await auth.owner(req("linked"))).toBe("discord:123456789012345678");
  expect(await auth.owner(req("plain"))).toBe("user:u2");
  expect(await auth.owner(req())).toBe("local"); // loopback fallback without a session
  expect(await auth.admin(req("staff"))).toBe(true);
  expect(await auth.admin(req("linked"))).toBe(false);
  expect(await auth.admin(req("adm"))).toBe(true);
  const failing = createEnvAuth(
    {},
    () => false,
    async () => {
      throw new Error("db down");
    },
  );
  expect(await failing.owner(req("x"))).toBeNull();
});
