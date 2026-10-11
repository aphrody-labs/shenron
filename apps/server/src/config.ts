// SPDX-License-Identifier: Apache-2.0
/**
 * Paths, environment and secrets of the Shenron server, resolved the same way on every host.
 *
 * Home (`SHENRON_HOME`, else the platform data directory):
 *   config/shenron.env   secrets and overrides (dotenv; owner-only on Unix; values never printed)
 *   data/                bot SQLite, local RAG store, uploads
 *   cache/               extracted runtime payloads
 *   logs/
 *
 * Precedence, highest first: the process environment, `config/shenron.env`, the profile
 * defaults. Profiles: `production` (the operator supplies DATABASE_URL and the secrets),
 * `desktop` and `public` (public defaults: dragonballfr.com APIs, local data, no secret).
 */
import { chmodSync, existsSync, mkdirSync, readFileSync, statSync } from "node:fs";
import { homedir, platform } from "node:os";
import { dirname, join, resolve } from "node:path";

export type Profile = "production" | "desktop" | "public";

export interface ServerPaths {
  home: string;
  config: string;
  envFile: string;
  data: string;
  cache: string;
  logs: string;
  /** Directory of the running executable (or of this source in development). */
  exeDir: string;
}

/** Public, secret-free defaults shared by the desktop and public profiles. */
export const PUBLIC_DEFAULTS: Readonly<Record<string, string>> = {
  NEXT_PUBLIC_SITE_URL: "https://dragonballfr.com",
  SHENRON_SITE_URL: "https://dragonballfr.com",
  SHENRON_API_URL: "https://bot.dragonballfr.com",
  NEXT_PUBLIC_SHENRON_API_URL: "https://bot.dragonballfr.com",
  NEXT_TELEMETRY_DISABLED: "1",
};

/** Secrets the production profile expects; reported by name only. */
export const SECRET_NAMES = [
  "DATABASE_URL",
  "BETTER_AUTH_SECRET",
  "DISCORD_CLIENT_ID",
  "DISCORD_CLIENT_SECRET",
  "SHENRON_ADMIN_TOKEN",
  "SHENRON_USER_SECRET",
  "REDIS_URL",
  "DISCORD_TOKEN",
  "DISCORD_TOKEN_SHENRON",
] as const;

function platformHome(): string {
  const os = platform();
  if (os === "win32")
    return join(process.env.LOCALAPPDATA ?? join(homedir(), "AppData", "Local"), "Shenron");
  if (os === "darwin") return join(homedir(), "Library", "Application Support", "Shenron");
  return join(process.env.XDG_DATA_HOME ?? join(homedir(), ".local", "share"), "shenron");
}

export function executableDir(env: NodeJS.ProcessEnv = process.env): string {
  const serverBin = env.SHENRON_SERVER_BIN?.trim();
  if (serverBin) return dirname(resolve(serverBin));
  // A compiled Bun binary runs from a virtual root; its real location is process.execPath.
  const compiled =
    import.meta.path.startsWith("/$bunfs/") || /^[A-Z]:[\\/]~BUN[\\/]/i.test(import.meta.path);
  return compiled ? dirname(process.execPath) : resolve(import.meta.dir, "..");
}

export function resolvePaths(env: NodeJS.ProcessEnv = process.env): ServerPaths {
  const home = resolve(env.SHENRON_HOME?.trim() || platformHome());
  const config = join(home, "config");
  return {
    home,
    config,
    envFile: env.SHENRON_ENV_FILE?.trim()
      ? resolve(env.SHENRON_ENV_FILE.trim())
      : join(config, "shenron.env"),
    data: join(home, "data"),
    cache: join(home, "cache"),
    logs: join(home, "logs"),
    exeDir: executableDir(env),
  };
}

export function ensureDirectories(paths: ServerPaths): void {
  for (const dir of [paths.config, paths.data, paths.cache, paths.logs])
    mkdirSync(dir, { recursive: true });
}

/** `NAME=value` lines; the last active assignment wins; quotes and `export ` are accepted. */
export function parseDotenv(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const match = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (!match) continue;
    let value = match[2]!.trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    } else {
      value = value.replace(/\s+#.*$/, "");
    }
    out[match[1]!] = value;
  }
  return out;
}

/** Read the secrets file; on Unix it must not be readable by group or others. */
export function readEnvFile(path: string): Record<string, string> {
  if (!existsSync(path)) return {};
  if (platform() !== "win32") {
    const mode = statSync(path).mode & 0o077;
    if (mode !== 0) {
      throw new Error(`${path} is readable by others; run: chmod 600 ${path}`);
    }
  }
  return parseDotenv(readFileSync(path, "utf8"));
}

export function profileOf(env: NodeJS.ProcessEnv): Profile {
  const value = env.SHENRON_PROFILE?.trim().toLowerCase();
  if (value === "desktop" || value === "public" || value === "production") return value;
  return env.DATABASE_URL ? "production" : "public";
}

/**
 * Resolve the effective environment (mutates and returns `process.env`, which Next and the
 * bot read): process values win, then the secrets file, then the profile defaults.
 */
export function loadEnvironment(
  paths: ServerPaths,
  env: NodeJS.ProcessEnv = process.env,
): {
  profile: Profile;
  fromFile: string[];
} {
  const file = readEnvFile(paths.envFile);
  const fromFile: string[] = [];
  for (const [name, value] of Object.entries(file)) {
    if (env[name] === undefined) {
      env[name] = value;
      fromFile.push(name);
    }
  }
  const profile = profileOf(env);
  if (profile !== "production") {
    for (const [name, value] of Object.entries(PUBLIC_DEFAULTS)) env[name] ??= value;
    // Pages that need the editorial database report it themselves; the public pages, the
    // editor, the studio and the local APIs run without it.
    env.SKIP_ENV_VALIDATION ??= "1";
  }
  // The desktop app is one user on their own machine: the loopback is the staff workstation, so
  // the guarded pages (workshop tools, admin, rubriques still closed to the public) open in the
  // window. The front relay forwards the socket peer, never a caller-supplied address.
  if (profile === "desktop") env.SHENRON_ADMIN_IPS ??= "127.0.0.1,::1";
  env.SHENRON_PROFILE = profile;
  env.SHENRON_HOME = paths.home;
  env.DATABASE_PATH ??= join(paths.data, "bot.db");
  env.APHRODY_DRAGONBALL_RAG_DB ??= join(paths.data, "rag.sqlite");
  return { profile, fromFile };
}

/** Secret presence only (never values), for `shenron-server doctor`. */
export function secretPresence(env: NodeJS.ProcessEnv = process.env): Record<string, boolean> {
  return Object.fromEntries(SECRET_NAMES.map((name) => [name, Boolean(env[name]?.trim())]));
}

/** Create an empty owner-only secrets file with commented names (never overwrites). */
export function initEnvFile(paths: ServerPaths): boolean {
  if (existsSync(paths.envFile)) return false;
  mkdirSync(dirname(paths.envFile), { recursive: true });
  const lines = [
    "# Shenron server secrets and overrides (dotenv). Keep this file private.",
    "# SHENRON_PROFILE=production",
    ...SECRET_NAMES.map((name) => `# ${name}=`),
    "",
  ];
  Bun.write(paths.envFile, lines.join("\n"));
  if (platform() !== "win32") chmodSync(paths.envFile, 0o600);
  return true;
}
