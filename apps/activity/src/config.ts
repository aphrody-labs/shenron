// SPDX-License-Identifier: Apache-2.0
/**
 * Configuration of the Activity server, read once from the environment (docs/operations/ENV.md,
 * section "Activité Discord"). A missing secret disables the capability that needs it, never the
 * whole server: `/health` reports what is available.
 */
import { MIN_SECRET_BYTES } from "@aphrody/shenron-activity/quiz";
import { ACTIVITY_ENV, envString, isProduction, type EnvSource } from "@aphrody/shenron-config/env";
import { resolveBotApiInternalUrl } from "@aphrody/shenron-config/services";
import { join } from "node:path";

export interface ActivityConfig {
  /** Bind address (the reverse proxy of the Activity host reaches it). */
  readonly host: string;
  readonly port: number;
  /** Public origin of the Activity host, e.g. `https://activity.dragonballfr.com`, or `null`. */
  readonly publicUrl: string | null;
  /** Discord application id (OAuth client id); same value as `APPLICATION_ID_SHENRON`. */
  readonly clientId: string | null;
  readonly clientSecret: string | null;
  /** HMAC key of the settlement receipts, shared with the bot (`ACTIVITY_ENV.secret`). */
  readonly activitySecret: string | null;
  /** Base URL of the bot API (`POST /api/activity/settle`), without trailing slash. */
  readonly botApiUrl: string;
  /** Bearer token of the bot's `/api/activity/*` routes (`ACTIVITY_ENV.token`, `SHENRON_ACTIVITY_TOKEN`). */
  readonly botApiToken: string | null;
  /** Directory of the built client (`bun run build`). */
  readonly distDir: string;
  /** Development identities (`?mock=1`): loopback binds only, never together with production. */
  readonly devAuth: boolean;
  readonly production: boolean;
  /** Problems found while reading the environment (fatal ones throw). */
  readonly warnings: readonly string[];
}

const APP_ROOT = join(import.meta.dir, "..");
export const DEFAULT_PORT = 5013;
export const DEFAULT_HOST = "127.0.0.1";

const LOOPBACK = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigError";
  }
}

function snowflake(value: string | undefined): string | null {
  return value !== undefined && /^\d{5,25}$/.test(value) ? value : null;
}

function origin(value: string | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.origin : null;
  } catch {
    return null;
  }
}

export function loadConfig(env: EnvSource): ActivityConfig {
  const warnings: string[] = [];
  const production = isProduction(env);
  const host = envString(env, "SHENRON_ACTIVITY_HOST") ?? DEFAULT_HOST;
  const rawPort = Number(envString(env, "SHENRON_ACTIVITY_PORT") ?? DEFAULT_PORT);
  if (!Number.isInteger(rawPort) || rawPort < 0 || rawPort > 65_535)
    throw new ConfigError("SHENRON_ACTIVITY_PORT must be an integer between 0 and 65535");

  const clientId = snowflake(envString(env, "DISCORD_CLIENT_ID"));
  if (envString(env, "DISCORD_CLIENT_ID") && !clientId)
    warnings.push("DISCORD_CLIENT_ID is not a Discord snowflake: sign-in is disabled");
  const clientSecret = envString(env, "DISCORD_CLIENT_SECRET") ?? null;

  let activitySecret = envString(env, ACTIVITY_ENV.secret) ?? null;
  if (
    activitySecret !== null &&
    new TextEncoder().encode(activitySecret).length < MIN_SECRET_BYTES
  ) {
    warnings.push(
      `SHENRON_ACTIVITY_SECRET is shorter than ${MIN_SECRET_BYTES} bytes: settlement is disabled`,
    );
    activitySecret = null;
  }

  const publicRaw = envString(env, "SHENRON_ACTIVITY_PUBLIC_URL");
  const publicUrl = origin(publicRaw);
  if (publicRaw && !publicUrl) warnings.push("SHENRON_ACTIVITY_PUBLIC_URL is not an http(s) URL");

  const devAuth = envString(env, "SHENRON_ACTIVITY_DEV_AUTH") === "1";
  if (devAuth && production)
    throw new ConfigError("SHENRON_ACTIVITY_DEV_AUTH=1 is refused when NODE_ENV=production");
  if (devAuth && !LOOPBACK.has(host))
    throw new ConfigError("SHENRON_ACTIVITY_DEV_AUTH=1 requires a loopback SHENRON_ACTIVITY_HOST");

  const botApiUrl = (
    envString(env, "SHENRON_BOT_API_URL") ?? resolveBotApiInternalUrl(env)
  ).replace(/\/+$/, "");

  return {
    host,
    port: rawPort,
    publicUrl,
    clientId,
    clientSecret,
    activitySecret,
    botApiUrl,
    botApiToken: envString(env, ACTIVITY_ENV.token) ?? null,
    distDir: envString(env, "SHENRON_ACTIVITY_DIST") ?? join(APP_ROOT, "dist", "client"),
    devAuth,
    production,
    warnings,
  };
}
