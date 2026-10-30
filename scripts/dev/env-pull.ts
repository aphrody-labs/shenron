#!/usr/bin/env bun
// SPDX-License-Identifier: Apache-2.0
/**
 * Development environment files derived from the production secrets held by the Aphrody Infra.
 * The production unit env files (`/etc/rose-griffon/shenron-{site,bot}.env`) are read over
 * `aphrody-infra ssh exec`, kept verbatim in the private store (`~/.aphrody/private/shenron/env`,
 * outside Git) and checked against the Infra secrets contract, then rewritten for development:
 * localhost origins, no analytics, and no production Discord gateway token (a second session on
 * the production bot would answer twice). Values are never printed.
 *
 *   bun scripts/dev/env-pull.ts pull [--host vps|dbfr] [--local-services]
 *                                                        private copy + development env files
 *   bun scripts/dev/env-pull.ts remote [--host vps]      same dev files written into ~/shenron-dev on the host
 *   bun scripts/dev/env-pull.ts tunnel [--host vps]      forward PostgreSQL (15433) and the AI chat (8799)
 *   bun scripts/dev/env-pull.ts status                   key counts and missing contract keys, no values
 *
 * A development bot token comes from `SHENRON_BOT_DEV_TOKEN` (or `DISCORD_TOKEN_DEV` already in the
 * private store); without it the bot file is written without any gateway token.
 * See docs/operations/DEV-LOCAL.md.
 */
import { chmod, mkdir } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

const ROOT = resolve(import.meta.dir, "../..");
const STORE = join(homedir(), ".aphrody", "private", "shenron", "env");
const REMOTE_DIR = "/etc/rose-griffon";
const REMOTE_WORKSPACE = "shenron-dev";
const DEV_PORT = Number(process.env.SHENRON_DEV_PORT ?? 3000);
/** Production loopback services the dev env points at; the tunnel mirrors them on the same ports. */
export const FORWARDS = [15433, 8799] as const;

export type Service = "site" | "bot";
export const SERVICES: Record<Service, { unit: string; target: string }> = {
  site: { unit: "shenron-site", target: "apps/site/.env.local" },
  bot: { unit: "shenron-bot", target: "apps/bot/.env" },
};

export type EnvMap = Map<string, string>;

export interface LocalCredentials {
  authSecret: string;
  adminToken: string;
  userSecret: string;
}

export function parseEnv(text: string): EnvMap {
  const env: EnvMap = new Map();
  for (const line of text.split(/\r?\n/)) {
    const match = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(line);
    if (match) env.set(match[1]!, match[2]!);
  }
  return env;
}

export function serializeEnv(env: EnvMap, header: string): string {
  const lines = [`# ${header}`];
  for (const [key, value] of env) lines.push(`${key}=${value}`);
  return `${lines.join("\n")}\n`;
}

const ANALYTICS = /^NEXT_PUBLIC_(GTM_ID|GA_ID|ADSENSE_.*)$/;
const GATEWAY_TOKEN = /^(DISCORD_TOKEN(_[A-Z_]+)?|APPLICATION_ID_[A-Z_]+)$/;

/** Rewrites a production env map for development; pure, so it is unit tested. */
export function deriveDev(
  service: Service,
  prod: EnvMap,
  devToken?: string,
  localServices = false,
  localCredentials?: LocalCredentials,
): EnvMap {
  const origin = `http://localhost:${DEV_PORT}`;
  const env: EnvMap = new Map();
  for (const [key, value] of prod) {
    if (service === "site" && ANALYTICS.test(key)) continue;
    if (service === "bot" && GATEWAY_TOKEN.test(key)) continue;
    env.set(key, value);
  }
  env.set("NODE_ENV", "development");
  if (service === "site") {
    env.set("BETTER_AUTH_URL", origin);
    env.set("NEXT_PUBLIC_SITE_URL", origin);
  } else {
    env.set("SHENRON_RUNTIME", "dev");
    env.set("API_HOST", "127.0.0.1");
    const token = devToken ?? prod.get("DISCORD_TOKEN_DEV");
    if (token) env.set("DISCORD_TOKEN_SHENRON", token);
  }

  if (localServices) {
    if (!localCredentials) throw new Error("local credentials are required for local services");
    const databaseUrl = "postgresql://shenron:shenron_local_only@127.0.0.1:5432/shenron_site_local";
    if (service === "site") {
      env.set("DATABASE_URL", databaseUrl);
      if (env.has("SITE_BUILD_DATABASE_URL")) env.set("SITE_BUILD_DATABASE_URL", databaseUrl);
      env.set("REDIS_URL", "redis://127.0.0.1:6379/0");
      if (env.has("VALKEY_URL")) env.set("VALKEY_URL", "redis://127.0.0.1:6379/0");
      env.set("BETTER_AUTH_SECRET", localCredentials.authSecret);
      env.set("SHENRON_ADMIN_TOKEN", localCredentials.adminToken);
      env.set("SHENRON_USER_SECRET", localCredentials.userSecret);
      env.set("SHENRON_API_URL", "http://127.0.0.1:5006");
      if (env.has("SHENRON_PUBLIC_API_URL"))
        env.set("SHENRON_PUBLIC_API_URL", "http://localhost:5006");
      env.set("NEXT_PUBLIC_SHENRON_API_URL", "http://localhost:5006");
      env.set("NEXT_PUBLIC_CDN_URL", "http://localhost:8080");
      env.set("NEXT_PUBLIC_SHENRON_ASSETS_URL", "http://localhost:8080");
      env.set("SHENRON_PUBLIC_ASSETS_URL", "http://localhost:8080");
      env.set("SHENRON_LOCAL_POSTGRES_PASSWORD", "shenron_local_only");
      env.set("SHENRON_LOCAL_STACK", "1");
    } else {
      env.set("DATABASE_URL", databaseUrl);
      env.set("REDIS_URL", "redis://127.0.0.1:6379/0");
      env.set("API_ADMIN_TOKEN", localCredentials.adminToken);
      env.set("SHENRON_ADMIN_TOKEN", localCredentials.adminToken);
      env.set("API_USER_SECRET", localCredentials.userSecret);
      env.set("SHENRON_USER_SECRET", localCredentials.userSecret);
      env.set("SESSION_SECRET", localCredentials.authSecret);
      env.set("API_HOST", "127.0.0.1");
      env.set("API_PORT", "5006");
      env.set("SHENRON_LOCAL_STACK", "1");
    }
  }
  return env;
}

function option(args: string[], name: string, fallback: string): string {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? args[index + 1]! : fallback;
}

async function run(cmd: string[], stdin?: string): Promise<string> {
  const proc = Bun.spawn(cmd, {
    stdin: stdin === undefined ? "ignore" : new TextEncoder().encode(stdin),
    stdout: "pipe",
    stderr: "pipe",
  });
  const [out, err, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  if (code !== 0) throw new Error(`${cmd.slice(0, 4).join(" ")} failed (${code}): ${err.trim()}`);
  return out;
}

async function readRemote(host: string, unit: string): Promise<string> {
  // `ssh` directly: aphrody-infra ssh exec prefixes its own diagnostics on stdout.
  return run(["ssh", host, `sudo -n cat ${REMOTE_DIR}/${unit}.env`]);
}

async function writePrivate(path: string, text: string): Promise<void> {
  await Bun.write(path, text);
  if (process.platform !== "win32") await chmod(path, 0o600);
}

async function contractCheck(service: Service, path: string): Promise<string> {
  const proc = Bun.spawn(
    ["aphrody-infra", "secrets", "check", "--service", SERVICES[service].unit, "--env-file", path],
    // aphrody-infra resolves its own checkout; APHRODY_INFRA_ROOT, when set, passes through.
    { stdout: "pipe", stderr: "pipe" },
  );
  const [out, err, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  const text = `${out}${err}`.trim().split(/\r?\n/).at(-1) ?? "";
  return code === 0 ? `contract ok` : `contract: ${text}`;
}

async function pull(host: string): Promise<Map<Service, EnvMap>> {
  await mkdir(STORE, { recursive: true });
  const result = new Map<Service, EnvMap>();
  for (const service of Object.keys(SERVICES) as Service[]) {
    const { unit } = SERVICES[service];
    const text = await readRemote(host, unit);
    const path = join(STORE, `${unit}.env`);
    await writePrivate(path, text);
    const env = parseEnv(text);
    result.set(service, env);
    console.log(`${unit}: ${env.size} keys -> ${path} (${await contractCheck(service, path)})`);
  }
  return result;
}

async function writeDev(
  prod: Map<Service, EnvMap>,
  remoteHost?: string,
  localServices = false,
): Promise<void> {
  const devToken = process.env.SHENRON_BOT_DEV_TOKEN;
  const localCredentials = localServices
    ? {
        authSecret: randomSecret(),
        adminToken: randomSecret(),
        userSecret: randomSecret(),
      }
    : undefined;
  for (const [service, env] of prod) {
    const dev = deriveDev(service, env, devToken, localServices, localCredentials);
    const text = serializeEnv(
      dev,
      `generated by scripts/dev/env-pull.ts from ${SERVICES[service].unit}.env; private, never commit`,
    );
    const target = SERVICES[service].target;
    if (remoteHost) {
      const path = `~/${REMOTE_WORKSPACE}/${target}`;
      await run(["ssh", remoteHost, `umask 077 && cat > ${path}`], text);
      console.log(`${remoteHost}:${path}: ${dev.size} keys`);
    } else {
      await writePrivate(join(ROOT, target), text);
      console.log(`${target}: ${dev.size} keys`);
    }
    if (service === "bot" && !dev.has("DISCORD_TOKEN_SHENRON"))
      console.log("  bot: no development token (set SHENRON_BOT_DEV_TOKEN), gateway disabled");
  }
}

function randomSecret(): string {
  return randomBytes(32).toString("hex");
}

async function loadStore(): Promise<Map<Service, EnvMap>> {
  const result = new Map<Service, EnvMap>();
  for (const service of Object.keys(SERVICES) as Service[]) {
    const file = Bun.file(join(STORE, `${SERVICES[service].unit}.env`));
    if (!(await file.exists())) throw new Error(`${file.name} absent: run \`pull\` first`);
    result.set(service, parseEnv(await file.text()));
  }
  return result;
}

async function main(): Promise<void> {
  const [command = "pull", ...args] = process.argv.slice(2);
  const host = option(args, "--host", process.env.SHENRON_DEV_HOST ?? "vps");
  switch (command) {
    case "pull":
      await writeDev(await pull(host), undefined, args.includes("--local-services"));
      return;
    case "remote":
      await writeDev(await pull(host), host);
      return;
    case "tunnel": {
      const forwards = FORWARDS.flatMap((port) => ["-L", `${port}:127.0.0.1:${port}`]);
      console.log(`forwarding ${FORWARDS.join(", ")} from ${host} (Ctrl+C to stop)`);
      const proc = Bun.spawn(["ssh", "-N", "-o", "ExitOnForwardFailure=yes", ...forwards, host], {
        stdio: ["inherit", "inherit", "inherit"],
      });
      process.exit(await proc.exited);
    }
    case "status":
      for (const [service, env] of await loadStore()) {
        const path = join(STORE, `${SERVICES[service].unit}.env`);
        console.log(
          `${SERVICES[service].unit}: ${env.size} keys (${await contractCheck(service, path)})`,
        );
      }
      return;
    default:
      throw new Error(`unknown command ${command}: pull | remote | tunnel | status`);
  }
}

if (import.meta.main) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
