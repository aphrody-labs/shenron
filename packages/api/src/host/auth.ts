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
import { createBunDb } from "@shenron/db/bun-sql";
import { baAccount, baSession, baUser, baVerification } from "@shenron/db/schema";
import { betterAuth, type BetterAuthOptions } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { bearer } from "better-auth/plugins";
import type { BetterAuthPort } from "../server";

const list = (raw: string | undefined): string[] =>
  (raw ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

export type AuthAvailability = { port: BetterAuthPort } | { reason: string };

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
  let db: ReturnType<typeof createBunDb>["db"];
  try {
    db = createBunDb({ env, applicationName: "shenron-auth" }).db;
  } catch {
    return { reason: "DATABASE_URL invalide" };
  }
  const options = buildHostAuthOptions(
    env,
    drizzleAdapter(db, {
      provider: "pg",
      debugLogs: !isProduction(env),
      schema: {
        user: baUser,
        session: baSession,
        account: baAccount,
        verification: baVerification,
      },
    }),
  );
  if ("reason" in options) return options;
  const auth = betterAuth(options);
  return {
    port: {
      handler: (request) => auth.handler(request),
      session: async (headers) => {
        try {
          const found = await auth.api.getSession({ headers });
          return found ? { userId: found.user.id } : null;
        } catch {
          return null;
        }
      },
    },
  };
}
