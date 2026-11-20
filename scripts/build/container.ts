#!/usr/bin/env bun
// SPDX-License-Identifier: Apache-2.0
/**
 * Build Shenron inside Shenron's VPS build image (`shenron-build:latest`, owned by Shenron:
 * tools/config/container/build/Dockerfile, built by scripts/build/container/shenron-build.ts image).
 *
 *   bun scripts/build/container.ts [--env NAME]… [--host-network] [--no-lock] -- CMD…
 *   bun scripts/build/container.ts --check     # the build image is present
 *
 * Same contract as Shenron's `shenron-build.ts run`: the checkout is mounted at its own absolute path,
 * the caller's uid plus the shared build group (1500), named cache volumes
 * shenron-build-{bun,xdg}, bounded CPU/memory (SHENRON_BUILD_CPUS ≤ 6, default 6;
 * SHENRON_BUILD_MEMORY, default 16g, no swap) so the llama-server services keep their memory, and the
 * optional build lock named by SHENRON_BUILD_LOCK. Secrets pass by environment NAME only, never as values.
 *
 * Dépendances Git privées (aphrody-labs/shenron épinglé par révision) : l'aide d'identification Git
 * de l'image répond pour github.com avec `SHENRON_GIT_TOKEN`, résolu ici depuis l'appelant
 * (SHENRON_GIT_TOKEN, GH_TOKEN, GITHUB_TOKEN, sinon `gh auth token`) et passé par son nom seulement.
 */
import { existsSync } from "node:fs";
import { resolve } from "node:path";

export const IMAGE = "shenron-build";
export const BUILD_GID = 1500;
/** Optional build lock shared with other heavy jobs (SHENRON_BUILD_LOCK, an existing file); none by default. */
export function buildLock(
  env: Record<string, string | undefined> = process.env,
): string | undefined {
  const lock = env.SHENRON_BUILD_LOCK?.trim();
  return lock && existsSync(lock) ? lock : undefined;
}
const CACHES = ["xdg"] as const;
const ROOT = resolve(import.meta.dir, "../..");

export type ContainerOptions = {
  repo: string;
  command: string[];
  uid: number;
  gid: number;
  env?: string[];
  hostNetwork?: boolean;
  lock?: boolean;
  cpus?: string;
  memory?: string;
};

/** The `docker run` invocation (prefixed by `flock` on SHENRON_BUILD_LOCK when set, unless disabled). */
export function containerArgs(o: ContainerOptions): string[] {
  if (!o.repo.startsWith("/")) throw new Error("checkout : chemin absolu requis");
  if (o.command.length === 0) throw new Error("commande manquante après --");
  const cpus = o.cpus || "6";
  const memory = o.memory || "16g";
  if (!/^\d+(\.\d+)?$/.test(cpus) || Number(cpus) > 6) throw new Error("SHENRON_BUILD_CPUS ≤ 6");
  if (!/^\d+[mg]$/.test(memory)) throw new Error("SHENRON_BUILD_MEMORY : <n>m ou <n>g");
  for (const name of o.env ?? [])
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) throw new Error(`--env ${name} invalide`);
  const docker = [
    "docker",
    "run",
    "--rm",
    "--init",
    "--pull=never",
    "--user",
    `${o.uid}:${o.gid}`,
    "--group-add",
    String(BUILD_GID),
    "--cpus",
    cpus,
    "--cpu-shares",
    "512",
    "--memory",
    memory,
    "--memory-swap",
    memory,
    "--pids-limit",
    "8192",
    "--oom-score-adj",
    "500",
    "--security-opt",
    "no-new-privileges:true",
    "--cap-drop",
    "ALL",
    ...(o.hostNetwork ? ["--network", "host"] : []),
    "--volume",
    `${o.repo}:${o.repo}`,
    "--workdir",
    o.repo,
    // Bun's install temp path must use the writable cache volume inside Docker.
    "--env",
    "BUN_TMPDIR=/cache/bun",
    ...CACHES.flatMap((name) => ["--volume", `${IMAGE}-${name}:/cache/${name}`]),
    // Keep Shenron's install cache out of the legacy shared volume with stale UID ownership.
    "--volume",
    `${IMAGE}-bun-shenron:/cache/bun`,
    ...(o.env ?? []).flatMap((name) => ["--env", name]),
    `${IMAGE}:latest`,
    ...o.command,
  ];
  const lock = o.lock === false ? undefined : buildLock();
  return lock ? ["flock", "--close", lock, ...docker] : docker;
}

/** Jeton pour l'aide d'identification github.com de l'image (environnement de l'appelant, sinon `gh`). */
export function gitToken(
  env: Record<string, string | undefined>,
  gh: () => string | undefined,
): string | undefined {
  return env.SHENRON_GIT_TOKEN || env.GH_TOKEN || env.GITHUB_TOKEN || gh() || undefined;
}

function ghToken(): string | undefined {
  if (!Bun.which("gh")) return undefined;
  const p = Bun.spawnSync(["gh", "auth", "token"], { stdout: "pipe", stderr: "ignore" });
  return p.exitCode === 0 ? p.stdout.toString().trim() : undefined;
}

/** Vérifie que l'image de build est présente ; lève avec la marche à suivre sinon. */
export function checkImage(): void {
  const inspect = Bun.spawnSync(
    ["docker", "image", "inspect", "--format", "{{json .Config.Labels}}", `${IMAGE}:latest`],
    { stdout: "pipe", stderr: "pipe" },
  );
  if (inspect.exitCode !== 0)
    throw new Error(
      `${IMAGE}:latest absente : bun scripts/build/container/shenron-build.ts image (dépôt Shenron)`,
    );
}

if (import.meta.main) {
  const argv = process.argv.slice(2);
  if (argv[0] === "--check") {
    checkImage();
    console.log(`${IMAGE}:latest présente`);
    process.exit(0);
  }
  const split = argv.indexOf("--");
  if (split < 0) {
    console.error(
      "usage: container.ts [--env NAME]… [--host-network] [--no-lock] -- CMD… | --check",
    );
    process.exit(64);
  }
  const flags = argv.slice(0, split);
  const env = flags.flatMap((flag, index) => (flag === "--env" ? [flags[index + 1] ?? ""] : []));
  const token = gitToken(process.env, ghToken);
  if (token && !env.includes("SHENRON_GIT_TOKEN")) env.push("SHENRON_GIT_TOKEN");
  const args = containerArgs({
    repo: ROOT,
    command: argv.slice(split + 1),
    uid: process.getuid?.() ?? 1000,
    gid: process.getgid?.() ?? 1000,
    env,
    hostNetwork: flags.includes("--host-network"),
    lock: !flags.includes("--no-lock"),
    cpus: process.env.SHENRON_BUILD_CPUS,
    memory: process.env.SHENRON_BUILD_MEMORY,
  });
  const child = Bun.spawnSync(args, {
    env: token ? { ...process.env, SHENRON_GIT_TOKEN: token } : process.env,
    stdio: ["inherit", "inherit", "inherit"],
  });
  process.exit(child.exitCode ?? 1);
}
