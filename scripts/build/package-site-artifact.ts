#!/usr/bin/env bun
// SPDX-License-Identifier: Apache-2.0
/**
 * Scelle le `.next-build` du site et, sur demande, la release Shenron consommée par
 * l'adaptateur Infra `aphrody-infra-deploy-shenron assemble` (Aphrody
 * `scripts/release/atomic-deploy-shenron.sh`).
 *
 *   bun scripts/build/package-site-artifact.ts [SORTIE] [--release-dir DOSSIER] [--target vps|dbfr]
 *
 * SORTIE (défaut `artifacts/site-build.tar.gz`) : `artifact-manifest.json` + `build/`.
 * `--release-dir` écrit, depuis le commit propre courant, le répertoire `shenron/` d'un bundle :
 * `source.tar.gz` (git archive + bot compilé en `apps/bot/dist/shenron` + serveur MCP en
 * `bin/shenron-mcp`, mémoire native en `bin/libshenron_ffi.so`), `site-build.tar.gz`, `systemd/shenron-{site,bot,mcp-http}.service` (copiés d'un
 * roster explicitement fourni ou rendus par le CLI hôte d'Aphrody), `nginx/shenron.conf`,
 * `release.json` (`repository: "shenron"`, `sourceLayout: "legacy"`) et `SHA256SUMS`.
 * Préalables : `bun scripts/build/bot.ts`, `cargo build --release -p shenron-mcp`, `-p shenron-ffi --lib` et le build
 * Next (`NEXT_DIST_DIR=.next-build`).
 * Aucun processus d'exécution, aucune migration ni base : l'emballage ne fait que copier.
 */
import { existsSync } from "node:fs";
import { mkdir, rename, rm } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

import { artifactPath, artifactStore } from "./site-artifact-paths.ts";
import { readInstalledReleaseUnits, RELEASE_SERVICES } from "./systemd-units.ts";

const USAGE =
  "usage: package-site-artifact.ts [SORTIE] [--release-dir DOSSIER] [--target vps|dbfr] [--systemd-dir DOSSIER]";
const TARGETS = ["vps", "dbfr"] as const;
// Ordre du roster du catalogue Infra (services shenron sous /srv/shenron/current).
const SERVICES = RELEASE_SERVICES;
// Vhosts installés par l'Infra depuis `config/host/nginx/shenron` (conf.d séparés).
const PUBLIC_HOSTS = [
  "dragonballfr.com",
  "www.dragonballfr.com",
  "bot.dragonballfr.com",
  "cdn.dragonballfr.com",
];

const repo = join(import.meta.dir, "..", "..");
const build = join(repo, "apps", "site", ".next-build");
const botBinary = join(repo, "dist", "bot", "linux-x64", "shenron-bot");
// `ExecStart` de shenron-mcp-http.service : `/srv/shenron/current/bin/shenron-mcp`.
const mcpBinary = join(
  process.env.CARGO_TARGET_DIR?.trim() || join(repo, "target"),
  "release",
  "shenron-mcp",
);
// Mémoire du chat du bot (`@aphrody/shenron-native`) : `SHENRON_FFI_LIB=/srv/shenron/current/bin/libshenron_ffi.so`.
const ffiLibrary = join(
  process.env.CARGO_TARGET_DIR?.trim() || join(repo, "target"),
  "release",
  "libshenron_ffi.so",
);

const args = process.argv.slice(2);
function option(name: string): string | undefined {
  const index = args.indexOf(name);
  if (index < 0) return undefined;
  const value = args[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${name} attend une valeur\n${USAGE}`);
  args.splice(index, 2);
  return value;
}
const releaseArg = option("--release-dir");
const systemdDir = option("--systemd-dir");
const target = option("--target") ?? "vps";
if (!(TARGETS as readonly string[]).includes(target))
  throw new Error(`--target vps|dbfr\n${USAGE}`);
if (args.length > 1 || args.some((arg) => arg.startsWith("--"))) throw new Error(USAGE);
const outputArg = args[0] ?? "artifacts/site-build.tar.gz";

function run(cmd: string[], cwd = repo): string {
  const result = Bun.spawnSync(cmd, { cwd, stdout: "pipe", stderr: "pipe" });
  if (result.exitCode !== 0) throw new Error(`${cmd[0]} : ${result.stderr.toString().trim()}`);
  return result.stdout.toString();
}

/** CLI hôte qui compose unités et fragments : `APHRODY_ROOT`, sinon `~/src/bun-os` ou yolo. */
function hostCli(): { root: string; cli: string } {
  const explicit = process.env.APHRODY_ROOT?.trim();
  const candidates = explicit
    ? [{ root: explicit, cli: join(explicit, "packages/engine/core/src/host/cli.ts") }]
    : [
        // Disposition à plat de bun-distribution (branche `os`), checkout de l'usine VPS.
        { root: join(homedir(), "src", "bun-os"), cli: "packages/yolo-core/src/host/cli.ts" },
        {
          root: process.env.YOLO_ROOT?.trim() || join(homedir(), "yolo"),
          cli: "packages/core/src/host/cli.ts",
        },
      ].map(({ root, cli }) => ({ root, cli: join(root, cli) }));
  const found = candidates.find(({ cli }) => existsSync(cli));
  if (!found)
    throw new Error(`CLI hôte introuvable (${candidates.map(({ cli }) => cli).join(", ")})`);
  return found;
}

function composeUnit(unit: string): string {
  const { root, cli } = hostCli();
  const result = Bun.spawnSync([process.execPath, cli, "compose-unit", unit], {
    cwd: repo,
    env: { ...process.env, YOLO_ROOT: root },
    stdout: "pipe",
    stderr: "pipe",
  });
  if (result.exitCode !== 0) throw new Error(`compose-unit ${unit} : ${result.stderr.toString()}`);
  const content = result.stdout.toString();
  if (!/^WorkingDirectory=\/srv\/shenron\/current(?:\/\S*)?$/m.test(content))
    throw new Error(`${unit} n'est pas une unité de release /srv/shenron/current`);
  return content;
}

for (const name of [
  "BUILD_ID",
  "prerender-manifest.json",
  "routes-manifest.json",
  "server/app-paths-manifest.json",
]) {
  if (!existsSync(join(build, name))) throw new Error(`build incomplet : ${name} absent`);
}
const commit = run(["git", "rev-parse", "HEAD"]).trim();
const store = await artifactStore(repo, process.env, commit);
const output = await artifactPath(store, outputArg);
const outputChecksum = await artifactPath(store, `${outputArg}.sha256`);
const stage = await artifactPath(store, ".site-artifact-stage");
const buildId = (await Bun.file(join(build, "BUILD_ID")).text()).trim();

await rm(stage, { recursive: true, force: true });
await mkdir(join(stage, "build"), { recursive: true });
try {
  run(["rsync", "-a", "-L", "--exclude", "cache/", `${build}/`, `${join(stage, "build")}/`]);
  await Bun.write(
    join(stage, "artifact-manifest.json"),
    `${JSON.stringify({ schema: "shenron-site-artifact/v1", commit, buildId }, null, 2)}\n`,
  );
  await mkdir(join(output, ".."), { recursive: true });
  run(["tar", "-czf", output, "-C", stage, "artifact-manifest.json", "build"]);
  const hash = run(["sha256sum", output]).trim().split(/\s+/)[0];
  await Bun.write(outputChecksum, `${hash}  ${outputArg}\n`);
  console.log(
    JSON.stringify({ status: "FAIT", artifact: outputArg, commit, buildId, sha256: hash }),
  );
} finally {
  await rm(stage, { recursive: true, force: true });
}

if (releaseArg !== undefined) {
  const releaseDir = await artifactPath(store, releaseArg);
  if (existsSync(releaseDir)) throw new Error("le répertoire de release existe déjà");
  if (run(["git", "status", "--porcelain", "--untracked-files=no"]).trim())
    throw new Error("la source de release doit être commitée et propre");
  if (!existsSync(botBinary))
    throw new Error("bot compilé absent : lancer `bun scripts/build/bot.ts` avant l'emballage");
  if (!existsSync(mcpBinary))
    throw new Error(
      "serveur MCP absent : lancer `cargo build --release -p shenron-mcp` avant l'emballage",
    );
  if (!existsSync(ffiLibrary))
    throw new Error(
      "bibliothèque native absente : lancer `cargo build --release -p shenron-ffi --lib` avant l'emballage",
    );
  const payload = await artifactPath(store, `${releaseArg}.staging`);
  if (existsSync(payload)) throw new Error("le répertoire de préparation de release existe déjà");
  // Le répertoire de release est le `shenron/` d'un bundle : `assemble DOSSIER`.
  const shenron = payload;
  const source = join(payload, ".source");
  await mkdir(join(shenron, "systemd"), { recursive: true });
  await mkdir(join(shenron, "nginx"), { recursive: true });
  await mkdir(join(source, "apps", "bot", "dist"), { recursive: true });
  await mkdir(join(source, "bin"), { recursive: true });
  try {
    const archive = join(payload, ".source.tar");
    run(["git", "archive", "--format=tar", "--output", archive, commit]);
    run(["tar", "-xf", archive, "-C", source]);
    await rm(archive);
    // Chemin attendu par `ExecStart` de shenron-bot.service.
    const bot = join(source, "apps", "bot", "dist", "shenron");
    await Bun.write(bot, Bun.file(botBinary));
    run(["chmod", "0755", bot]);
    const mcp = join(source, "bin", "shenron-mcp");
    await Bun.write(mcp, Bun.file(mcpBinary));
    run(["chmod", "0755", mcp]);
    const ffi = join(source, "bin", "libshenron_ffi.so");
    await Bun.write(ffi, Bun.file(ffiLibrary));
    run(["chmod", "0644", ffi]);
    run(["tar", "-czf", join(shenron, "source.tar.gz"), "-C", source, "."]);
    await rm(source, { recursive: true });
    await Bun.write(join(shenron, "site-build.tar.gz"), Bun.file(output));
    const installedUnits = systemdDir ? await readInstalledReleaseUnits(systemdDir) : undefined;
    for (const service of SERVICES) {
      await Bun.write(
        join(shenron, "systemd", `${service}.service`),
        installedUnits?.get(service) ?? composeUnit(`${service}.service`),
      );
    }
    // Les vhosts Shenron sont des fichiers conf.d installés par l'Infra (00-shenron.conf,
    // dragonballfr.com.conf, …) : la release n'ajoute aucune directive, sinon nginx -t
    // échoue sur des zones dupliquées. La ligne `server_name` en commentaire nomme les
    // hôtes que l'adaptateur vérifie contre nginx-routes.json.
    await Bun.write(
      join(shenron, "nginx", "shenron.conf"),
      `# Release Shenron ${commit} : aucune directive nginx propre.\n` +
        "# Vhosts installés par l'Infra depuis config/host/nginx/shenron (conf.d séparés),\n" +
        "# vers 127.0.0.1:5011 (site) et 127.0.0.1:5006 (bot).\n" +
        `# Hôtes couverts : server_name ${PUBLIC_HOSTS.join(" ")};\n`,
    );
    await Bun.write(
      join(shenron, "release.json"),
      `${JSON.stringify(
        {
          schemaVersion: 1,
          repository: "shenron",
          commit,
          sourceLayout: "legacy",
          target,
          builtAt: new Date().toISOString(),
          services: SERVICES,
          siteArtifact: { buildId },
        },
        null,
        2,
      )}\n`,
    );
    const files = [
      "source.tar.gz",
      "site-build.tar.gz",
      "release.json",
      ...SERVICES.map((service) => `systemd/${service}.service`),
      "nginx/shenron.conf",
    ];
    // sha256sum natif : les archives ne transitent pas par le tas JS.
    await Bun.write(join(shenron, "SHA256SUMS"), run(["sha256sum", ...files], shenron));
    await rename(payload, releaseDir);
    console.log(JSON.stringify({ release: releaseArg, commit, target, buildId }));
  } catch (error) {
    await rm(payload, { recursive: true, force: true });
    throw error;
  }
}
