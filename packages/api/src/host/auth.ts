// SPDX-License-Identifier: Apache-2.0
/**
 * Better Auth on the Bun host: `/api/auth/*` (Request/Response) built from the shared
 * `@aphrody/shenron-auth` bricks (secret, origins, cookies, Discord provider) over the `ba_*` tables
 * of `@aphrody/shenron-db`. Runtime class: `bun`.
 *
 * The group needs `DATABASE_URL` (PostgreSQL), a Discord application (`DISCORD_CLIENT_ID`,
 * `DISCORD_CLIENT_SECRET`) and, in production, `BETTER_AUTH_SECRET`; a missing piece disables
 * it with a short reason, nothing throws. The public origin comes from
 * `@aphrody/shenron-config/public-urls`; `SHENRON_AUTH_ALLOWED_HOSTS` and `SHENRON_AUTH_TRUSTED_ORIGINS`
 * (comma lists) add the loopback origin of a desktop or CLI profile.
 */
import { AUTH_BASE_PATH, normalizeBaseUrl, resolveBetterAuthSecret } from "@aphrody/shenron-auth";
import {
  SESSION_COOKIE_CACHE,
  advancedOptions,
  discordProvider,
  loggingOptions,
  crunchyrollOAuthConfig,
} from "@aphrody/shenron-auth/options";
import { siteAllowedHosts, siteTrustedOrigins } from "@aphrody/shenron-auth/origins";
import { type EnvSource, envString, isProduction } from "@aphrody/shenron-config/env";
import { resolveSiteUrl } from "@aphrody/shenron-config/public-urls";
import { staffPolicyFromEnv } from "@aphrody/shenron-auth/staff";
import { createBunDb } from "@aphrody/shenron-db/bun-sql";
import {
  baAccount,
  baJwks,
  baOauthAccessToken,
  baOauthClient,
  baOauthClientAssertion,
  baOauthClientResource,
  baOauthConsent,
  baOauthRefreshToken,
  baOauthResource,
  baPasskey,
  baSession,
  baTwoFactor,
  baUser,
  baVerification,
} from "@aphrody/shenron-db/schema";
import {
  createAccountDataRepository,
  createAccountProfileRepository,
} from "@aphrody/shenron-db/repos/accounts";
import { createResilientRedis } from "@aphrody/shenron-db/redis";
import { RedisClient } from "bun";
import { betterAuth, type BetterAuthOptions } from "better-auth";
import { APIError } from "better-auth/api";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { bearer, jwt, magicLink, twoFactor } from "better-auth/plugins";
import { cimd } from "@better-auth/cimd";
import { fetchClientMetadataResource } from "@better-auth/cimd/node";
import { mcp } from "@better-auth/mcp";
import { passkey } from "@better-auth/passkey";
import { genericOAuth } from "better-auth/plugins/generic-oauth";
import type { BetterAuthPort, HostSession } from "../server";
import { createAuthRateLimitStorage } from "./auth-rate-limit";
import { buildAccountDeletionHooks } from "./account-deletion";
import { accountProfileHooks } from "./account-profile";
import { sendSmtpEmail } from "./smtp-email";

const list = (raw: string | undefined): string[] =>
  (raw ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

const AUTH_OAUTH_SCOPES = ["openid", "profile", "email", "offline_access"] as const;

async function sendAuthEmail(env: EnvSource, input: { to: string; subject: string; text: string }) {
  const smtpPassword = envString(env, "SMTP_PASSWORD");
  if (smtpPassword) {
    return sendSmtpEmail((name) => envString(env, name) ?? undefined, input);
  }
  const apiKey = envString(env, "RESEND_API_KEY");
  const from = envString(env, "AUTH_EMAIL_FROM");
  if (!apiKey || !from) throw new Error("Transactional auth email is not configured.");
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to: [input.to], subject: input.subject, text: input.text }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`Transactional auth email failed (${response.status}).`);
}

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
  if (Boolean(clientId) !== Boolean(clientSecret)) {
    return {
      reason: "DISCORD_CLIENT_ID et DISCORD_CLIENT_SECRET doivent être configurés ensemble",
    };
  }
  const production = isProduction(env);
  const googleClientId = envString(env, "GOOGLE_CLIENT_ID");
  const googleClientSecret = envString(env, "GOOGLE_CLIENT_SECRET");
  if (Boolean(googleClientId) !== Boolean(googleClientSecret)) {
    return { reason: "GOOGLE_CLIENT_ID et GOOGLE_CLIENT_SECRET doivent être configurés ensemble" };
  }
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
  const crunchyroll = crunchyrollOAuthConfig({
    clientId: envString(env, "CRUNCHYROLL_OAUTH_CLIENT_ID"),
    clientSecret: envString(env, "CRUNCHYROLL_OAUTH_CLIENT_SECRET"),
    discoveryUrl: envString(env, "CRUNCHYROLL_OAUTH_DISCOVERY_URL"),
  });
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
      customRules: {
        "/sign-in/email": { window: 60, max: 5 },
        "/sign-up/email": { window: 60, max: 5 },
        "/sign-in/magic-link": { window: 60, max: 3 },
        "/request-password-reset": { window: 60, max: 3 },
        "/oauth2/register": { window: 60, max: 10 },
        "/two-factor/*": { window: 60, max: 5 },
      },
    },
    session: {
      cookieCache: { ...SESSION_COOKIE_CACHE },
      expiresIn: 60 * 60 * 24 * 30,
      updateAge: 60 * 60 * 24,
    },
    plugins: [
      bearer(),
      twoFactor({
        issuer: "Dragon Ball France",
        allowPasswordless: true,
        backupCodeOptions: { amount: 10, length: 10, storeBackupCodes: "encrypted" },
      }),
      passkey({ rpID: new URL(site).hostname, rpName: "Dragon Ball France", origin: site }),
      magicLink({
        expiresIn: 600,
        disableSignUp: true,
        sendMagicLink: ({ email, url }) =>
          sendAuthEmail(env, {
            to: email,
            subject: "Votre lien de connexion à Dragon Ball France",
            text: `Ce lien de connexion expire dans 10 minutes et ne peut être utilisé qu’une fois :\n${url}`,
          }),
      }),
      jwt(),
      mcp({
        loginPage: "/signin",
        consentPage: "/oauth/consent",
        resource: `${site}/mcp`,
        scopes: [...AUTH_OAUTH_SCOPES],
        clientRegistrationDefaultScopes: ["openid", "profile", "email"],
        clientRegistrationAllowedScopes: ["offline_access"],
        allowDynamicClientRegistration: true,
        allowUnauthenticatedClientRegistration: true,
      }),
      cimd({ fetchClientMetadataResource, metadataProfile: "mcp-2026-07-28" }),
      ...(crunchyroll ? [genericOAuth({ config: [crunchyroll] })] : []),
    ],
    account: {
      encryptOAuthTokens: true,
      accountLinking: { enabled: true, disableImplicitLinking: true },
    },
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 12,
      maxPasswordLength: 256,
      requireEmailVerification: true,
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: ({ user, url }) =>
        sendAuthEmail(env, {
          to: user.email,
          subject: "Réinitialiser votre mot de passe Dragon Ball France",
          text: `Ce lien de réinitialisation expire selon les règles du compte :\n${url}`,
        }),
    },
    emailVerification: {
      sendOnSignIn: true,
      autoSignInAfterVerification: true,
      sendVerificationEmail: ({ user, url }) =>
        sendAuthEmail(env, {
          to: user.email,
          subject: "Confirmez votre adresse e-mail Dragon Ball France",
          text: `Confirmez votre adresse avec ce lien :\n${url}`,
        }),
    },
    ...loggingOptions(production ? "production" : "development"),
    database,
    databaseHooks: {
      user: {
        update: {
          before: async (user) => {
            const data = { ...user };
            if (data.name !== undefined) {
              if (typeof data.name !== "string") {
                throw new APIError("BAD_REQUEST", { message: "Le pseudo doit être une chaîne." });
              }
              data.name = data.name.trim();
              if (data.name.length < 2 || data.name.length > 48) {
                throw new APIError("BAD_REQUEST", {
                  message: "Le pseudo doit contenir entre 2 et 48 caractères.",
                });
              }
            }
            if (data.image !== undefined && data.image !== null && data.image !== "") {
              let avatar: URL;
              try {
                if (typeof data.image !== "string") throw new TypeError("Invalid avatar type");
                avatar = new URL(data.image);
              } catch {
                throw new APIError("BAD_REQUEST", { message: "L’URL de l’avatar est invalide." });
              }
              if (avatar.protocol !== "https:") {
                throw new APIError("BAD_REQUEST", {
                  message: "L’avatar doit utiliser une URL HTTPS.",
                });
              }
            }
            return { data };
          },
        },
      },
    },
    socialProviders: {
      ...(clientId && clientSecret
        ? {
            discord: discordProvider({
              clientId,
              clientSecret,
              extraScopes: ["guilds", "guilds.members.read"],
            }),
          }
        : {}),
      ...(googleClientId && googleClientSecret
        ? {
            google: {
              clientId: googleClientId,
              clientSecret: googleClientSecret,
              prompt: "select_account" as const,
              requireEmailVerification: true,
            },
          }
        : {}),
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
      twoFactor: baTwoFactor,
      passkey: baPasskey,
      jwks: baJwks,
      oauthClient: baOauthClient,
      oauthResource: baOauthResource,
      oauthClientResource: baOauthClientResource,
      oauthRefreshToken: baOauthRefreshToken,
      oauthAccessToken: baOauthAccessToken,
      oauthConsent: baOauthConsent,
      oauthClientAssertion: baOauthClientAssertion,
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
  const staff = staffPolicyFromEnv(env, "site");
  const profiles = createAccountProfileRepository(db, staff.isStaff);
  const profileHooks = accountProfileHooks(profiles);
  options.databaseHooks = {
    ...options.databaseHooks,
    account: profileHooks.account,
    user: {
      ...options.databaseHooks?.user,
      update: { ...options.databaseHooks?.user?.update, ...profileHooks.user.update },
    },
  };
  const auth = betterAuth(options);
  return {
    async close() {
      redis?.close();
      await client.close();
    },
    port: {
      handler: (request) => auth.handler(request),
      session: async (headers) => {
        try {
          // Backend permissions must observe session revocation immediately.
          const found = await auth.api.getSession({ headers, query: { disableCookieCache: true } });
          if (!found) return null;
          const profile = await profiles.synchronize(found.user.id);
          const session: HostSession = {
            userId: found.user.id,
            discordId: profile?.discordId ?? null,
            staff: profile?.roleAdmin ?? false,
            profile: profile
              ? {
                  id: profile.id,
                  discordId: profile.discordId,
                  username: profile.username,
                  avatar: profile.avatar,
                  roleAdmin: profile.roleAdmin,
                  createdAt: profile.createdAt.toISOString(),
                }
              : null,
          };
          return session;
        } catch {
          return null;
        }
      },
    },
  };
}
