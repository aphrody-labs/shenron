#!/usr/bin/env bun
// SPDX-License-Identifier: Apache-2.0
/**
 * Drift gate and emitters of the single environment definition (deploy/environment.json).
 *
 *   bun scripts/deploy/environment.ts --check            every consumer agrees with the definition
 *   bun scripts/deploy/environment.ts --verify-host      this host's toolchain matches it (factory)
 *   bun scripts/deploy/environment.ts --emit shell       cache and toolchain exports for a build
 *   bun scripts/deploy/environment.ts --emit runtime-env runtime ENV as KEY=value lines
 *   bun scripts/deploy/environment.ts --emit activation  services, health URLs and order read by
 *                                                       deploy/activation/activate.sh
 *
 * The native and the Docker path read the same pins: --check compares rust-toolchain.toml,
 * package.json#packageManager, Dockerfile.build and deploy/docker/Dockerfile to the definition, so
 * a pin changed in one place only fails here instead of building a different environment.
 */
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const ROOT = resolve(import.meta.dir, "../..");

export type Definition = {
  toolchain: {
    rust: string;
    bun: string;
    bunLinuxSha256: string;
    sccache: string;
    baseImage: string;
  };
  caches: Record<string, string | number>;
  runtime: { packages: string[]; env: Record<string, string>; files: string[] };
  services: Record<
    string,
    { container: string; health: string; healthHost?: string; waitSeconds: number }
  >;
  activation: { order: string[]; keepImages: number; keepReleases: number };
};

export const loadDefinition = (root = ROOT): Definition =>
  JSON.parse(readFileSync(join(root, "deploy/environment.json"), "utf8"));

const read = (root: string, path: string) => readFileSync(join(root, path), "utf8");

/** Value of `ARG <name>=<value>` in a Dockerfile. */
function arg(dockerfile: string, name: string) {
  return dockerfile.match(new RegExp(`^ARG ${name}=(.+)$`, "m"))?.[1]?.trim();
}

/** The text of one stage: from its FROM line to the next FROM. */
function stage(dockerfile: string, name?: string) {
  const lines = dockerfile.split(/\r?\n/);
  const start = name
    ? lines.findIndex((line) => new RegExp(`^FROM .+ AS ${name}$`).test(line))
    : lines.findIndex((line) => line.startsWith("FROM "));
  if (start < 0) return "";
  const end = lines.findIndex((line, index) => index > start && line.startsWith("FROM "));
  return lines.slice(start, end < 0 ? undefined : end).join("\n");
}

/** KEY=value pairs of the first multi-line ENV instruction of a stage. */
function envOf(text: string): Record<string, string> {
  const block = text.match(/^ENV ((?:.*\\\r?\n)*.*)$/m)?.[1] ?? "";
  const pairs = block
    .replace(/\\\r?\n/g, " ")
    .trim()
    .split(/\s+/);
  return Object.fromEntries(
    pairs.filter(Boolean).map((pair) => {
      const index = pair.indexOf("=");
      return [pair.slice(0, index), pair.slice(index + 1)];
    }),
  );
}

function packagesOf(text: string): string[] {
  const line = text.match(/apt-get install -y --no-install-recommends ([^\\&\r\n]+)/)?.[1] ?? "";
  return line.trim().split(/\s+/).filter(Boolean);
}

/** Destinations of the COPY instructions of a stage, in order. */
function copiesOf(text: string): string[] {
  return [...text.matchAll(/^COPY .* (\/\S+)$/gm)].map((match) => match[1]!);
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

export function driftProblems(root = ROOT, definition = loadDefinition(root)): string[] {
  const problems: string[] = [];
  const expect = (label: string, actual: unknown, wanted: unknown) => {
    if (!same(actual, wanted))
      problems.push(
        `${label}: found ${JSON.stringify(actual)}, the definition says ${JSON.stringify(wanted)}`,
      );
  };
  const { toolchain, runtime } = definition;
  expect(
    "rust-toolchain.toml channel",
    read(root, "rust-toolchain.toml").match(/^channel = "(.+)"$/m)?.[1],
    toolchain.rust,
  );
  expect(
    "package.json#packageManager",
    JSON.parse(read(root, "package.json")).packageManager,
    `bun@${toolchain.bun}`,
  );
  const build = read(root, "Dockerfile.build");
  expect("Dockerfile.build BASE_IMAGE", arg(build, "BASE_IMAGE"), toolchain.baseImage);
  expect("Dockerfile.build RUST_VERSION", arg(build, "RUST_VERSION"), toolchain.rust);
  expect("Dockerfile.build BUN_VERSION", arg(build, "BUN_VERSION"), toolchain.bun);
  expect(
    "Dockerfile.build BUN_LINUX_SHA256",
    arg(build, "BUN_LINUX_SHA256"),
    toolchain.bunLinuxSha256,
  );
  expect("Dockerfile.build SCCACHE_VERSION", arg(build, "SCCACHE_VERSION"), toolchain.sccache);
  const factory = read(root, "deploy/docker/Dockerfile");
  expect("deploy/docker/Dockerfile base", factory.match(/^FROM (\S+)/m)?.[1], toolchain.baseImage);
  const images = [
    ["deploy/docker/Dockerfile", stage(factory)],
    ["Dockerfile.build release-linux", stage(build, "release-linux")],
  ] as const;
  for (const [label, text] of images) {
    expect(`${label} ENV`, envOf(text), runtime.env);
    expect(`${label} packages`, packagesOf(text), runtime.packages);
    expect(`${label} files`, copiesOf(text), runtime.files);
  }
  return problems;
}

function versionProblems(definition: Definition): string[] {
  const output = (command: string[]) => {
    const run = Bun.spawnSync(command, { stdout: "pipe", stderr: "pipe" });
    return run.exitCode === 0 ? run.stdout.toString().trim() : "";
  };
  const problems: string[] = [];
  const rustc = output(["rustc", "-V"]);
  if (!rustc.startsWith(`rustc ${definition.toolchain.rust} `))
    problems.push(`rustc: found "${rustc}", wanted ${definition.toolchain.rust}`);
  const compile = process.env.SHENRON_COMPILE_BUN ?? "bun";
  const bun = output([compile, "--version"]);
  if (bun !== definition.toolchain.bun)
    problems.push(`bun: found "${bun}", wanted ${definition.toolchain.bun}`);
  return problems;
}

/** Exports for a native build, with $HOME left to the shell. */
export function shellExports(definition: Definition): string {
  const { caches } = definition;
  return [
    `export BUN_INSTALL_CACHE_DIR="\${BUN_INSTALL_CACHE_DIR:-${caches.bun}}"`,
    `export SCCACHE_DIR="\${SCCACHE_DIR:-${caches.sccache}}"`,
    `export SCCACHE_CACHE_SIZE="\${SCCACHE_CACHE_SIZE:-${caches.sccacheSize}}"`,
    `export SHENRON_ARTIFACT_STORE="\${SHENRON_ARTIFACT_STORE:-${caches.artifacts}}"`,
    `export SHENRON_ARTIFACT_KEEP="\${SHENRON_ARTIFACT_KEEP:-${caches.artifactsKeepPerLane}}"`,
    "export CARGO_INCREMENTAL=0",
    "",
  ].join("\n");
}

const quote = (value: string | number) => `'${String(value).replaceAll("'", `'\\''`)}'`;

/** Shell assignments read by deploy/activation/activate.sh (it sources them, nothing else). */
export function activationEnv(definition: Definition): string {
  const lines = [
    `ACTIVATION_ORDER=${quote(definition.activation.order.join(" "))}`,
    `KEEP_IMAGES=${quote(definition.activation.keepImages)}`,
    `KEEP_RELEASES=${quote(definition.activation.keepReleases)}`,
  ];
  for (const [name, service] of Object.entries(definition.services)) {
    const upper = name.toUpperCase();
    lines.push(`CONTAINER_${upper}=${quote(service.container)}`);
    lines.push(`HEALTH_${upper}=${quote(service.health)}`);
    lines.push(`HEALTH_HOST_${upper}=${quote(service.healthHost ?? "")}`);
    lines.push(`WAIT_${upper}=${quote(service.waitSeconds)}`);
  }
  return `${lines.join("\n")}\n`;
}

function main(argv: string[]) {
  const definition = loadDefinition();
  if (argv.includes("--check")) {
    const problems = driftProblems();
    for (const problem of problems) console.error(problem);
    if (problems.length > 0) process.exit(1);
    console.log("environment: every consumer matches deploy/environment.json");
    return;
  }
  if (argv.includes("--verify-host")) {
    const problems = versionProblems(definition);
    for (const problem of problems) console.error(problem);
    if (problems.length > 0) process.exit(1);
    console.log("environment: this host matches deploy/environment.json");
    return;
  }
  const emit = argv[argv.indexOf("--emit") + 1];
  if (argv.includes("--emit") && emit === "shell") process.stdout.write(shellExports(definition));
  else if (argv.includes("--emit") && emit === "activation")
    process.stdout.write(activationEnv(definition));
  else if (argv.includes("--emit") && emit === "runtime-env")
    for (const [name, value] of Object.entries(definition.runtime.env))
      console.log(`${name}=${value}`);
  else {
    console.error(
      "usage: environment.ts --check | --verify-host | --emit shell|runtime-env|activation",
    );
    process.exit(64);
  }
}

if (import.meta.main) main(process.argv.slice(2));
