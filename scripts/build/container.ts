#!/usr/bin/env bun
// SPDX-License-Identifier: Apache-2.0
/**
 * Build Shenron inside Aphrody's VPS build image (`aphrody-build:latest`, owned by Aphrody:
 * tools/config/container/build/Dockerfile, built by scripts/build/container/aphrody-build.ts image).
 *
 *   bun scripts/build/container.ts [--target-volume NAME] [--env NAME]… [--host-network] [--no-lock] -- CMD…
 *   bun scripts/build/container.ts --check     # image present, Rust and wasm-bindgen match this checkout
 *
 * Same contract as Aphrody's `aphrody-build.ts run`: the checkout is mounted at its own absolute path,
 * the caller's uid plus the shared build group (1500), named cache volumes
 * aphrody-build-{cargo,sccache,bun,xwin,xdg}, bounded CPU/memory (APHRODY_BUILD_CPUS ≤ 6, default 6;
 * APHRODY_BUILD_MEMORY, default 16g, no swap) so the llama-server services keep their memory, and the
 * factory heavy lock when the host has one. Secrets pass by environment NAME only, never as values.
 *
 * Dépendances Git privées (aphrody-labs/aphrody épinglé par révision) : l'aide d'identification Git
 * de l'image répond pour github.com avec `APHRODY_GIT_TOKEN`, résolu ici depuis l'appelant
 * (APHRODY_GIT_TOKEN, GH_TOKEN, GITHUB_TOKEN, sinon `gh auth token`) et passé par son nom seulement.
 */
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";

export const IMAGE = "aphrody-build";
export const BUILD_GID = 1500;
export const HEAVY_LOCK = "/srv/aphrody-build/locks/heavy.lock";
const CACHES = ["cargo", "sccache", "xwin", "xdg"] as const;
const ROOT = resolve(import.meta.dir, "../..");

export type ContainerOptions = {
  repo: string;
  command: string[];
  uid: number;
  gid: number;
  targetVolume?: string;
  env?: string[];
  hostNetwork?: boolean;
  lock?: boolean;
  cpus?: string;
  memory?: string;
};

/** The `docker run` invocation (prefixed by `flock` on the factory heavy lock unless disabled). */
export function containerArgs(o: ContainerOptions): string[] {
  if (!o.repo.startsWith("/")) throw new Error("checkout : chemin absolu requis");
  if (o.command.length === 0) throw new Error("commande manquante après --");
  if (o.targetVolume && !/^[a-z0-9][a-z0-9_.-]*$/.test(o.targetVolume))
    throw new Error("--target-volume : nom de volume invalide");
  const cpus = o.cpus || "6";
  const memory = o.memory || "16g";
  if (!/^\d+(\.\d+)?$/.test(cpus) || Number(cpus) > 6) throw new Error("APHRODY_BUILD_CPUS ≤ 6");
  if (!/^\d+[mg]$/.test(memory)) throw new Error("APHRODY_BUILD_MEMORY : <n>m ou <n>g");
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
    ...(o.targetVolume
      ? [
          "--volume",
          `${IMAGE}-target-${o.targetVolume}:/cache/target`,
          "--env",
          "CARGO_TARGET_DIR=/cache/target",
        ]
      : []),
    ...(o.env ?? []).flatMap((name) => ["--env", name]),
    `${IMAGE}:latest`,
    ...o.command,
  ];
  return o.lock === false || !existsSync(HEAVY_LOCK)
    ? docker
    : ["flock", "--close", HEAVY_LOCK, ...docker];
}

/** Jeton pour l'aide d'identification github.com de l'image (environnement de l'appelant, sinon `gh`). */
export function gitToken(
  env: Record<string, string | undefined>,
  gh: () => string | undefined,
): string | undefined {
  return env.APHRODY_GIT_TOKEN || env.GH_TOKEN || env.GITHUB_TOKEN || gh() || undefined;
}

function ghToken(): string | undefined {
  if (!Bun.which("gh")) return undefined;
  const p = Bun.spawnSync(["gh", "auth", "token"], { stdout: "pipe", stderr: "ignore" });
  return p.exitCode === 0 ? p.stdout.toString().trim() : undefined;
}

/** Écarts entre l'image et le checkout (toolchain Rust, CLI wasm-bindgen) ; vide si conforme. */
export function imageProblems(
  labels: Record<string, string>,
  toolchain: string,
  cargoLock: string,
): string[] {
  const problems: string[] = [];
  const channel = /^channel\s*=\s*"([^"]+)"/m.exec(toolchain)?.[1];
  const bindgen = /\[\[package\]\]\r?\nname = "wasm-bindgen"\r?\nversion = "([^"]+)"/.exec(
    cargoLock,
  )?.[1];
  if (channel && labels["dev.aphrody.rust"] !== channel)
    problems.push(`Rust ${labels["dev.aphrody.rust"] ?? "?"} ≠ rust-toolchain.toml ${channel}`);
  if (bindgen && labels["dev.aphrody.wasm-bindgen"] !== bindgen)
    problems.push(
      `wasm-bindgen ${labels["dev.aphrody.wasm-bindgen"] ?? "?"} ≠ Cargo.lock ${bindgen}`,
    );
  return problems;
}

/** Vérifie l'image locale contre ce checkout ; lève avec la marche à suivre sinon. */
export async function checkImage(repo = ROOT): Promise<void> {
  const inspect = Bun.spawnSync(
    ["docker", "image", "inspect", "--format", "{{json .Config.Labels}}", `${IMAGE}:latest`],
    { stdout: "pipe", stderr: "pipe" },
  );
  if (inspect.exitCode !== 0)
    throw new Error(
      `${IMAGE}:latest absente : bun scripts/build/container/aphrody-build.ts image (dépôt Aphrody)`,
    );
  const labels = JSON.parse(inspect.stdout.toString()) as Record<string, string>;
  const problems = imageProblems(
    labels,
    await Bun.file(join(repo, "rust-toolchain.toml")).text(),
    await Bun.file(join(repo, "Cargo.lock")).text(),
  );
  if (problems.length)
    throw new Error(`${IMAGE}:latest à reconstruire (Aphrody) : ${problems.join("; ")}`);
}

if (import.meta.main) {
  const argv = process.argv.slice(2);
  if (argv[0] === "--check") {
    await checkImage();
    console.log(`${IMAGE}:latest conforme`);
    process.exit(0);
  }
  const split = argv.indexOf("--");
  if (split < 0) {
    console.error(
      "usage: container.ts [--target-volume NAME] [--env NAME]… [--host-network] [--no-lock] -- CMD… | --check",
    );
    process.exit(64);
  }
  const flags = argv.slice(0, split);
  const value = (name: string) => {
    const index = flags.indexOf(name);
    return index >= 0 ? flags[index + 1] : undefined;
  };
  const env = flags.flatMap((flag, index) => (flag === "--env" ? [flags[index + 1] ?? ""] : []));
  const token = gitToken(process.env, ghToken);
  if (token && !env.includes("APHRODY_GIT_TOKEN")) env.push("APHRODY_GIT_TOKEN");
  const args = containerArgs({
    repo: ROOT,
    command: argv.slice(split + 1),
    uid: process.getuid?.() ?? 1000,
    gid: process.getgid?.() ?? 1000,
    targetVolume: value("--target-volume"),
    env,
    hostNetwork: flags.includes("--host-network"),
    lock: !flags.includes("--no-lock"),
    cpus: process.env.APHRODY_BUILD_CPUS,
    memory: process.env.APHRODY_BUILD_MEMORY,
  });
  const child = Bun.spawnSync(args, {
    env: token ? { ...process.env, APHRODY_GIT_TOKEN: token } : process.env,
    stdio: ["inherit", "inherit", "inherit"],
  });
  process.exit(child.exitCode ?? 1);
}
