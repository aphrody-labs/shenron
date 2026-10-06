// SPDX-License-Identifier: Apache-2.0
/** Better Auth on the Bun host: options from the shared bricks, group availability reasons. */
import { expect, test } from "bun:test";
import { buildHostAuthOptions, createHostAuth } from "../src/host/auth";
import { BETTER_AUTH_PATH, type BetterAuthPort, createShenronApi } from "../src/server";

const discord = { DISCORD_CLIENT_ID: "id", DISCORD_CLIENT_SECRET: "secret" };
const longSecret = "s".repeat(40);

test("production options use the shared policy: secure cookies, consent, no localhost", () => {
  const options = buildHostAuthOptions(
    { NODE_ENV: "production", BETTER_AUTH_SECRET: longSecret, ...discord },
    undefined,
  );
  if ("reason" in options) throw new Error(options.reason);
  expect(options.basePath).toBe("/api/auth");
  expect(options.secret).toBe(longSecret);
  expect(options.advanced?.useSecureCookies).toBe(true);
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
  expect(buildHostAuthOptions({ BETTER_AUTH_SECRET: longSecret }, undefined)).toEqual({
    reason: "application Discord non configurée",
  });
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

test("with a database URL and a Discord application the port is built (lazy connection)", () => {
  const built = createHostAuth({
    DATABASE_URL: "postgres://u:p@127.0.0.1:1/db",
    BETTER_AUTH_SECRET: longSecret,
    ...discord,
  });
  expect("port" in built).toBe(true);
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
