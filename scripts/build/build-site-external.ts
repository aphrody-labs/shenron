#!/usr/bin/env bun
/**
 * build-site-external.ts — `bun scripts/build/build-site-external.ts` : construit le site Shenron
 * hors VPS de production (Next `--turbopack`, `NEXT_DIST_DIR=.next-build`) puis
 * scelle l'artefact via `package-site-artifact.ts` (tar.gz + manifeste + SHA-256).
 * L'étape release du pipeline `aphrody-infra` consomme cet artefact ; la bascule,
 * les unités et les sondes restent côté infra (aucun SSH ni déploiement ici).
 */
import { existsSync } from "node:fs";
import { mkdir, realpath, rm } from "node:fs/promises";
import { connect } from "node:net";
import { join, relative } from "node:path";
import { createRequire } from "node:module";

import { emittedKoharuWasm, ensureKoharuWasm } from "./koharu-wasm.ts";
import { artifactStore, artifactPath } from "./site-artifact-paths.ts";

const releaseArgs = process.argv.slice(2);
if (releaseArgs.length && (releaseArgs.length !== 2 || releaseArgs[0] !== "--release-dir")) {
  throw new Error("usage: build-site-external.ts [--release-dir RELATIVE_DIRECTORY]");
}

const repo = join(import.meta.dir, "..", "..");
const siteDir = join(repo, "apps", "site");
const buildDir = join(siteDir, ".next-build");
// Bun's isolated linker owns Next at the site dependency boundary, not a hoisted root.
let nextBin: string;
try {
  nextBin = createRequire(join(siteDir, "package.json")).resolve("next/dist/bin/next");
} catch {
  console.error("✗ Site-owned Next dependency is missing; run the frozen workspace install.");
  process.exit(1);
}

if (!existsSync(nextBin)) {
  console.error(`✗ Binaire Next introuvable : ${nextBin}`);
  process.exit(1);
}

// Base de lecture du build : `SITE_BUILD_DATABASE_URL` (pipeline de release
// aphrody-infra / CI), sinon `REMOTE_DATABASE_URL` de `.env.remote-db`
// (tunnel SSH d'un poste de build). Jamais journalisée.
let databaseUrl = process.env.SITE_BUILD_DATABASE_URL?.trim() ?? "";
if (!databaseUrl) {
  const remoteEnvPath = join(repo, ".env.remote-db");
  if (!existsSync(remoteEnvPath)) {
    console.error(`✗ SITE_BUILD_DATABASE_URL absente et fichier ${remoteEnvPath} introuvable.`);
    process.exit(1);
  }
  const remoteEnv = await Bun.file(remoteEnvPath).text();
  for (const line of remoteEnv.split("\n")) {
    if (line.startsWith("REMOTE_DATABASE_URL=")) {
      databaseUrl = line.slice("REMOTE_DATABASE_URL=".length).trim();
      break;
    }
  }
}

if (!databaseUrl) {
  console.error("✗ Ni SITE_BUILD_DATABASE_URL ni REMOTE_DATABASE_URL (.env.remote-db) définie");
  process.exit(1);
}

const dbUrlObj = new URL(databaseUrl);
const dbPort = Number(dbUrlObj.port || 5432);
const dbHost = dbUrlObj.hostname || "127.0.0.1";

// Vérifier que le port de la DB est ouvert (tunnel SSH)
await new Promise<void>((resolve, reject) => {
  const sock = connect(dbPort, dbHost, () => {
    sock.end();
    resolve();
  });
  sock.setTimeout(3000, () => {
    sock.destroy();
    reject(new Error(`Timeout de connexion vers ${dbHost}:${dbPort}`));
  });
  sock.on("error", (err) => reject(err));
}).catch((err) => {
  console.error(`✗ Impossible de joindre la base sur ${dbHost}:${dbPort} : ${err.message}`);
  process.exit(1);
});

console.log(`✓ Base de build joignable sur ${dbHost}:${dbPort}`);

const shaProc = Bun.spawnSync(["git", "rev-parse", "HEAD"], { cwd: repo });
if (shaProc.exitCode !== 0) {
  console.error("✗ Impossible d'obtenir le SHA git");
  process.exit(1);
}
const sha = shaProc.stdout.toString().trim();
const store = await artifactStore(repo, process.env, sha);
const outputArg = "artifacts/site-build.tar.gz";
const output = await artifactPath(store, outputArg);
if (releaseArgs.length) await artifactPath(store, releaseArgs[1]!);
console.log(`▶ Démarrage du build Next.js Turbopack pour commit ${sha}...`);

// Nettoyage à froid
await rm(buildDir, { recursive: true, force: true });

// Côté hôte, avant le conteneur de Next : celui-ci ne voit que le dépôt monté, sans Rust.
ensureKoharuWasm();

const prebuild = Bun.spawnSync([process.execPath, "run", "prebuild"], {
  cwd: siteDir,
  stdout: "inherit",
  stderr: "inherit",
});
if (prebuild.exitCode !== 0) process.exit(prebuild.exitCode);

const startedAt = Date.now();
const buildEnv = { ...process.env };
delete buildEnv.http_proxy;
delete buildEnv.HTTP_PROXY;
delete buildEnv.https_proxy;
delete buildEnv.HTTPS_PROXY;
delete buildEnv.all_proxy;
delete buildEnv.ALL_PROXY;

// Match the existing immutable RG compiler boundary: Node 22 compiles Next;
// Bun owns installs, package preparation, packaging and the final site runtime.
// Usine de build déclarée par l'Infra (config/build-factory.json, absente hors usine) : défauts sinon.
const factoryPath = join(repo, "config/build-factory.json");
const factory = existsSync(factoryPath) ? await Bun.file(factoryPath).json() : {};
const nodeImage = factory.next?.image ?? "node:22-bookworm-slim";
const memoryMiB = factory.next?.maxOldSpaceSizeMiB ?? 8192;
const containerMemoryMiB = factory.next?.memoryMiB ?? 16384;
const cpus = factory.next?.cpus ?? 6;
if (typeof nodeImage !== "string" || !/^[a-z0-9][a-zA-Z0-9._/:@-]*$/.test(nodeImage))
  throw new Error("Invalid factory Next compiler image");
if (!Number.isSafeInteger(memoryMiB) || memoryMiB < 512 || memoryMiB > 65536)
  throw new Error("Invalid factory Next compiler memory limit");
if (
  !Number.isSafeInteger(containerMemoryMiB) ||
  containerMemoryMiB < 1024 ||
  containerMemoryMiB > 32768 ||
  memoryMiB >= containerMemoryMiB
)
  throw new Error("Invalid factory Next container memory limit");
if (!Number.isSafeInteger(cpus) || cpus < 1 || cpus > 6)
  throw new Error("Invalid factory Next compiler CPU limit");
if (factory.next?.pull && factory.next.pull !== "never")
  throw new Error("Next compiler requires an already cached immutable image");
const inspect = Bun.spawnSync(["docker", "image", "inspect", "--format", "{{.Id}}", nodeImage], {
  cwd: repo,
  stdout: "pipe",
  stderr: "pipe",
});
if (inspect.exitCode !== 0) throw new Error("Cached Node 22 compiler image is unavailable");
const imageId = inspect.stdout.toString().trim();
if (!/^sha256:[a-f0-9]{64}$/.test(imageId))
  throw new Error("Invalid cached Node compiler image ID");
const resolvedNext = await realpath(nextBin);
const compilerPath = relative(repo, resolvedNext);
if (compilerPath === ".." || compilerPath.startsWith("../"))
  throw new Error("Site-owned Next compiler must remain inside the repository bind mount");
const home = join(repo, ".cache", "next-build", "home");
const temporary = join(repo, ".cache", "next-build", "tmp");
await mkdir(home, { recursive: true, mode: 0o700 });
await mkdir(temporary, { recursive: true, mode: 0o700 });
// Compilateur de Next : `node22` (défaut, image Node 22) ou `bun` (le binaire Bun de l'hôte
// monté en lecture seule dans la même image bornée, `bun --bun next build`), choisi par
// `SHENRON_NEXT_RUNTIME` ou `next.runtime` de l'usine. Mesure avant d'en changer le défaut
// (var/reports/turbopack-swc-bun-2026-10-05.md, §8).
const runtime = (process.env.SHENRON_NEXT_RUNTIME ?? factory.next?.runtime ?? "node22") as string;
if (runtime !== "node22" && runtime !== "bun")
  throw new Error("SHENRON_NEXT_RUNTIME : node22 | bun");
const compilerEnvironment = {
  ...buildEnv,
  NODE_ENV: "production",
  NEXT_TELEMETRY_DISABLED: "1",
  NEXT_DEPLOYMENT_ID: sha,
  NEXT_DIST_DIR: ".next-build",
  DATABASE_URL: databaseUrl,
  TURBOPACK: "1",
  // Sous Node seulement : Bun n'a pas de tas V8 à borner (la limite reste celle du conteneur).
  ...(runtime === "node22" ? { NODE_OPTIONS: `--max-old-space-size=${memoryMiB}` } : {}),
  // Le chargeur natif SWC refuse un cache dont un parent est accessible en écriture au groupe.
  SWC_NATIVE_BINDING_CACHE: join(temporary, "swc-native"),
  HOME: home,
  TMPDIR: temporary,
  BUILD_CPUS: process.env.BUILD_CPUS ?? "4",
  BUILD_STATIC_CONCURRENCY: process.env.BUILD_STATIC_CONCURRENCY ?? "6",
};
const dockerEnvironment = Object.keys(compilerEnvironment).flatMap((name) =>
  /^[A-Za-z_][A-Za-z0-9_]*$/.test(name) && name !== "PATH" ? ["--env", name] : [],
);
const uid = process.getuid?.();
const gid = process.getgid?.();
if (uid === undefined || gid === undefined)
  throw new Error("Next factory compiler requires a Linux owner");
console.log(`▶ Cached Next compiler: ${nodeImage} ${imageId} (${runtime})`);
const buildProc = Bun.spawn(
  [
    "docker",
    "run",
    "--rm",
    "--pull=never",
    "--network",
    "host",
    "--cpus",
    String(cpus),
    "--memory",
    `${containerMemoryMiB}m`,
    "--user",
    `${uid}:${gid}`,
    "--volume",
    `${repo}:${repo}`,
    "--workdir",
    siteDir,
    ...(runtime === "bun" ? ["--volume", `${process.execPath}:/usr/local/bin/bun:ro`] : []),
    ...dockerEnvironment,
    imageId,
    ...(runtime === "bun" ? ["/usr/local/bin/bun", "--bun"] : ["node"]),
    resolvedNext,
    "build",
    "--turbopack",
  ],
  {
    cwd: siteDir,
    // --env receives names only. Secret values stay in the child's memory, never argv/files.
    env: compilerEnvironment,
    stdout: "inherit",
    stderr: "inherit",
  },
);

const exitCode = await buildProc.exited;
if (exitCode !== 0) {
  console.error(`✗ Build Next.js échoué avec le code ${exitCode}`);
  process.exit(exitCode);
}

const elapsed = Math.round((Date.now() - startedAt) / 1000);
console.log(`✓ Build Next.js terminé en ${elapsed}s`);
await Bun.write(
  join(buildDir, "compiler-provenance.json"),
  `${JSON.stringify(
    {
      schema: "aphrody-next-compiler/v1",
      sourceRevision: sha,
      image: nodeImage,
      imageId,
      runtime: runtime === "bun" ? `bun-${Bun.version}+${Bun.revision}` : "node22",
      bundler: "turbopack",
      limits: { cpus, memoryMiB: containerMemoryMiB, maxOldSpaceSizeMiB: memoryMiB },
    },
    null,
    2,
  )}\n`,
);

// Vérifier la présence des artefacts obligatoires
for (const req of ["BUILD_ID", "prerender-manifest.json", "routes-manifest.json"]) {
  if (!existsSync(join(buildDir, req))) {
    console.error(`✗ Fichier obligatoire manquant dans .next-build : ${req}`);
    process.exit(1);
  }
}
// Viewport de l'éditeur Koharu : Turbopack doit émettre le WASM (CDN : _next/static/media).
const koharuWasm = emittedKoharuWasm(buildDir);
if (koharuWasm.length === 0) {
  console.error("✗ Aucun koharu_canvas_bg.*.wasm émis sous .next-build/static/media");
  process.exit(1);
}
for (const file of koharuWasm) console.log(`✓ WASM émis : ${relative(siteDir, file)}`);

// Emballage de l'artefact
console.log("▶ Emballage de l'artefact via package-site-artifact.ts...");
const pkgProc = Bun.spawnSync(
  [process.execPath, join(import.meta.dir, "package-site-artifact.ts"), outputArg, ...releaseArgs],
  { cwd: repo, stdout: "inherit", stderr: "inherit" },
);

if (pkgProc.exitCode !== 0) {
  console.error("✗ Emballage de l'artefact échoué");
  process.exit(pkgProc.exitCode);
}

// Vérification de la somme de contrôle
const checkProc = Bun.spawnSync(["sha256sum", "--check", `${output}.sha256`], {
  cwd: store,
  stdout: "inherit",
  stderr: "inherit",
});

if (checkProc.exitCode !== 0) {
  console.error("✗ Somme de contrôle SHA256 invalide");
  process.exit(1);
}

console.log(`✓ Artefact prêt et vérifié : ${output}`);
