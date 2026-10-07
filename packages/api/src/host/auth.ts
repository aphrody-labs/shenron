// SPDX-License-Identifier: Apache-2.0
/**
 * Better Auth on the Bun host: `/api/auth/*` (Request/Response) built from the shared
 * `@shenron/auth` bricks (secret, origins, cookies, Discord provider) over the `ba_*` tables
 * of `@shenron/db`. Runtime class: `bun`.
 *
 * The group needs `DATABASE_URL` (PostgreSQL), a Discord application (`DISCORD_CLIENT_ID`,
 * `DISCORD_CLIENT_SECRET`) and, in production, `BETTER_AUTH_SECRET`; a missing piece disables
 * it with a short reason, nothing throws. The public origin comes from
 * `@shenron/config/public-urls`; `SHENRON_AUTH_ALLOWED_HOSTS` and `SHENRON_AUTH_TRUSTED_ORIGINS`
 * (comma lists) add the loopback origin of a desktop or CLI profile.
 */
import { AUTH_BASE_PATH, normalizeBaseUrl, resolveBetterAuthSecret } from "@shenron/auth";
import {
  SESSION_COOKIE_CACHE,
  advancedOptions,
  discordProvider,
  loggingOptions,
} from "@shenron/auth/options";
import { siteAllowedHosts, siteTrustedOrigins } from "@shenron/auth/origins";
import { type EnvSource, envString, isProduction } from "@shenron/config/env";
import { resolveSiteUrl } from "@shenron/config/public-urls";
import { staffPolicyFromEnv } from "@shenron/auth/staff";
import { createBunDb } from "@shenron/db/bun-sql";
import { baAccount, baSession, baUser, baVerification } from "@shenron/db/schema";
import {
  createAccountDataRepository,
  createDiscordAccountLookup,
} from "@shenron/db/repos/accounts";
import { createResilientRedis } from "@shenron/db/redis";
import { RedisClient } from "bun";
import { betterAuth, type BetterAuthOptions } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { bearer } from "better-auth/plugins";
import type { BetterAuthPort, HostSession } from "../server";
import { createAuthRateLimitStorage } from "./auth-rate-limit";
import { buildAccountDeletionHooks } from "./account-deletion";

const list = (raw: string | undefined): string[] =>
  (raw ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

export type AuthAvailability =
  | { port: BetterAuthPort; close(): Promise<void> }
  | { reason: string };

/** Options of the host's Better Auth, without side effect (tests build them without a database). */
export function buildHostAuthOptions(
  env: EnvSource,
  database: BetterAuthOptions["database"],
): BetterAuthOptions | { reason: string } {
  const clientId = envString(env, "DISCORD_CLIENT_ID");
  const clientSecret = envString(env, "DISCORD_CLIENT_SECRET");
  if (!clientId || !clientSecret) return { reason: "application Discord non configurée" };
  const production = isProduction(env);
  let secret: string;
  try {
    secret = resolveBetterAuthSecret({
      NODE_ENV: production ? "production" : "development",
      BETTER_AUTH_SECRET: envString(env, "BETTER_AUTH_SECRET"),
      SESSION_SECRET: envString(env, "SESSION_SECRET"),
      BETTER_AUTH_DEV_SECRET: envString(env, "BETTER_AUTH_DEV_SECRET"),
    }).secret;
  } catch {
    return { reason: "BETTER_AUTH_SECRET absent ou trop court" };
  }
  const site = normalizeBaseUrl(resolveSiteUrl(env));
  return {
    appName: "DBFR",
    baseURL: {
      allowedHosts: [
        ...siteAllowedHosts({ production }),
        ...list(envString(env, "SHENRON_AUTH_ALLOWED_HOSTS")),
      ],
      protocol: production ? "https" : "http",
      fallback: site,
    },
    basePath: AUTH_BASE_PATH,
    secret,
    rateLimit: {
      enabled: production,
      window: 60,
      max: 100,
      customStorage: createAuthRateLimitStorage(),
    },
    session: {
      cookieCache: { ...SESSION_COOKIE_CACHE },
      expiresIn: 60 * 60 * 24 * 30,
      updateAge: 60 * 60 * 24,
    },
    plugins: [bearer()],
    ...loggingOptions(production ? "production" : "development"),
    database,
    socialProviders: {
      discord: discordProvider({
        clientId,
        clientSecret,
        extraScopes: ["guilds", "guilds.members.read"],
      }),
    },
    trustedOrigins: [
      ...siteTrustedOrigins({ production }),
      ...list(envString(env, "SHENRON_AUTH_TRUSTED_ORIGINS")),
    ],
    advanced: advancedOptions({ production }),
  };
}

/** Better Auth port of the host, or the reason why the group stays disabled. */
export function createHostAuth(env: EnvSource): AuthAvailability {
  const url = envString(env, "DATABASE_URL");
  if (!url) return { reason: "DATABASE_URL absente : authentification indisponible" };
  const options = buildHostAuthOptions(env, undefined);
  if ("reason" in options) return options;
  let db: ReturnType<typeof createBunDb>["db"];
  let client: ReturnType<typeof createBunDb>["client"];
  try {
    ({ db, client } = createBunDb({ env, applicationName: "shenron-auth" }));
  } catch {
    return { reason: "DATABASE_URL invalide" };
  }
  options.database = drizzleAdapter(db, {
    provider: "pg",
    debugLogs: !isProduction(env),
    schema: {
      user: baUser,
      session: baSession,
      account: baAccount,
      verification: baVerification,
    },
  });
  const redisUrl = envString(env, "REDIS_URL");
  const redis = redisUrl
    ? createResilientRedis({
        url: redisUrl,
        name: "shenron-auth-rate-limit",
        createClient: (redisAddress) =>
          new RedisClient(redisAddress, {
            autoReconnect: true,
            maxRetries: 2,
            enableOfflineQueue: false,
            connectionTimeout: 1000,
          }),
      })
    : null;
  options.rateLimit = { ...options.rateLimit, customStorage: createAuthRateLimitStorage(redis) };
  options.user = { deleteUser: buildAccountDeletionHooks(createAccountDataRepository(db)) };
  const auth = betterAuth(options);
  const accounts = createDiscordAccountLookup(db);
  const staff = staffPolicyFromEnv(env, "site");
  return {
    async close() {
      redis?.close();
      await client.close();
    },
    port: {
      handler: (request) => auth.handler(request),
      session: async (headers) => {
        try {
          const found = await auth.api.getSession({ headers });
          if (!found) return null;
          const discordId = await accounts.discordIdForUser(found.user.id).catch(() => null);
          const session: HostSession = {
            userId: found.user.id,
            discordId,
            staff: staff.isStaff(discordId),
          };
          return session;
        } catch {
          return null;
        }
      },
    },
  };
}
