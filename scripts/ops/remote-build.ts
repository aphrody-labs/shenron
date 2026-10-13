#!/usr/bin/env bun
// SPDX-License-Identifier: Apache-2.0
/**
 * Developer entrypoint for the local -> VPS -> DBFR release path.
 *
 *   bun scripts/ops/remote-build.ts doctor
 *   bun scripts/ops/remote-build.ts build
 *   bun scripts/ops/remote-build.ts release
 *   bun scripts/ops/remote-build.ts cdn
 *
 * The actual build/deploy contract remains in release.ts; this command only
 * performs local preflight and selects the bounded release plan.
 */

type Mode = "doctor" | "build" | "release" | "cdn";

const mode = (process.argv[2] ?? "release") as Mode;
if (!["doctor", "build", "release", "cdn"].includes(mode)) {
  console.error("usage: bun scripts/ops/remote-build.ts [doctor|build|release|cdn]");
  process.exit(2);
}

async function run(command: string, args: string[], inherit = true): Promise<number> {
  const child = Bun.spawn([command, ...args], {
    cwd: process.cwd(),
    stdout: inherit ? "inherit" : "pipe",
    stderr: inherit ? "inherit" : "pipe",
    env: { ...process.env, DOCKER_BUILDKIT: "1", NEXT_TELEMETRY_DISABLED: "1" },
  });
  return await child.exited;
}

async function preflight(): Promise<void> {
  const bun = Bun.spawnSync([process.execPath, "--version"], { stdout: "pipe", stderr: "pipe" });
  if (bun.exitCode !== 0) throw new Error("Bun local indisponible");
  console.log(`bun local: ${bun.stdout.toString().trim()}`);

  const git = Bun.spawnSync(["git", "rev-parse", "--show-toplevel"], {
    stdout: "pipe",
    stderr: "pipe",
  });
  if (git.exitCode !== 0) throw new Error("checkout Git local introuvable");
  console.log(`checkout: ${git.stdout.toString().trim()}`);

  const status = Bun.spawnSync(["git", "status", "--short"], { stdout: "pipe", stderr: "pipe" });
  if (status.stdout.toString().trim())
    console.warn("arbre local modifié : le build distant utilise origin/main publié");
  console.log("cible: build VPS -> artefact scellé -> DBFR via Aphrody Infra");
}

await preflight();
if (mode === "doctor") process.exit(0);

const releaseArgs = mode === "build" ? ["--no-deploy"] : mode === "cdn" ? ["--cdn-only"] : [];
const code = await run(process.execPath, ["scripts/ops/release.ts", ...releaseArgs]);
process.exit(code);
