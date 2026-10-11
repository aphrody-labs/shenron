#!/usr/bin/env bun
// SPDX-License-Identifier: Apache-2.0
/**
 * Côté hôte de `scripts/ops/release.ts` : exécuté sur le `vps` (utilisateur de service,
 * `sudo -n` pour l'adaptateur et l'environnement), depuis n'importe quel dossier.
 *
 *   bun release-host.ts build   # main → artifacts/releases/<sha>, assemblé sous /srv/shenron/releases
 *   bun release-host.ts cdn [dir] # publie une release sur le CDN (défaut : la release active)
 *
 * Tout build tourne ici, sur le vps : dbfr ne compile rien et ne garde aucun cache de build.
 *
 * `build` : arbre de build dédié `~/shenron-release` (worktree détaché de `~/shenron`, remis
 * de force sur origin/main à chaque release : une édition en cours dans `~/shenron` ne bloque plus
 * la release), install figée, `shenron-mcp` et `shenron-ffi` (cargo), WASM des moteurs Koharu et
 * shenron-re et bot compilé dans l'image de build d'Aphrody (`aphrody-build:latest`, via
 * `scripts/build/container.ts` : caches partagés, CPU et mémoire bornés), puis site
 * (`build-site-external.ts`, déjà dans son conteneur Node borné ; base lue dans l'environnement du
 * site, jamais affichée), emballage et `aphrody-infra-deploy-shenron assemble`. Dernière ligne :
 * `{"commit": …, "release": …}`.
 *
 * Le site est construit avec `NEXT_PUBLIC_CDN_URL` de l'environnement du site : le préfixe des
 * chunks est gravé dans le runtime Turbopack et `next start` le reprend du build
 * (`withBun` de `@aphrody/next-bun`, `freezeBuildConfig`). Servis par l'origine, les chunks d'une release
 * disparaissaient à la suivante et un onglet ouvert avant la bascule tombait en ChunkLoadError ;
 * le CDN, lui, garde tous les anciens chunks.
 *
 * `cdn [dir]` : décharge Next de tout le statique. `apps/site/public/` (hors `wiki/`, déjà servi
 * par le CDN) et `.next-build/static/` de la release `dir` (défaut : la release active) vont dans le miroir source du CDN
 * (`/srv/shenron-cdn-src`) et, pour ce qui n'y est pas encore, directement dans l'arbre servi
 * (`/srv/shenron-cdn`) : disponibles tout de suite, ré-encodés ensuite par
 * `aphrody-cdn-optimize`. Jamais de suppression : une page en cache garde ses anciens fichiers.
 * Les WASM Koharu et shenron-re y partent avec des noms empreints ; nginx les sert en
 * `application/wasm`, immuables (sondes de `release.ts`).
 */
import { existsSync } from "node:fs";
import { join } from "node:path";

const HOME = process.env.HOME ?? "/home/ubuntu";
/** Checkout de travail (éditable) : seule sa base d'objets et ses remotes servent à la release. */
const SOURCE = process.env.SHENRON_SOURCE_REPO ?? join(HOME, "shenron");
/** Arbre de build dédié, jamais édité à la main : remis de force sur la référence publiée. */
const REPO = process.env.SHENRON_BUILD_REPO ?? join(HOME, "shenron-release");
const CURRENT = "/srv/shenron/current";
const CDN_SRC = "/srv/shenron-cdn-src";
const CDN_OUT = "/srv/shenron-cdn";
const ADAPTER = "/usr/local/sbin/aphrody-infra-deploy-shenron";
// `~/.local/bin` : `gh`, dont `scripts/build/container.ts` tire le jeton des dépendances Git privées.
const PATH = `${join(HOME, ".bun", "bin")}:${join(HOME, ".cargo", "bin")}:${join(HOME, ".local", "bin")}:/usr/local/bin:/usr/bin:/bin`;

function step(label: string, cmd: string[], env: Record<string, string> = {}, cwd = REPO): string {
  console.log(`== ${label}`);
  const p = Bun.spawnSync(cmd, {
    cwd,
    env: { ...process.env, PATH, ...env },
    stdout: "pipe",
    stderr: "inherit",
  });
  const out = p.stdout.toString();
  if (out.trim()) console.log(out.trimEnd().split("\n").slice(-20).join("\n"));
  if (p.exitCode !== 0) throw new Error(`${label} : code ${p.exitCode}`);
  return out;
}

/**
 * Arbre de build sur `ref` (défaut : origin/main). L'ancien build avançait `~/shenron` lui-même :
 * des modifications locales non commitées y faisaient échouer `merge --ff-only` (release du
 * 2026-10-07 : `== EXIT 1`). Le worktree détaché dédié est forcé sur `ref` et nettoyé des fichiers
 * non suivis (les ignorés — node_modules, target, caches — restent pour le build incrémental).
 */
export function syncCommands(source: string, repo: string, ref: string, exists: boolean) {
  return [
    ["git", "-C", source, "fetch", "-q", "origin"],
    ...(exists ? [] : [["git", "-C", source, "worktree", "add", "-q", "--detach", repo, ref]]),
    ["git", "-C", repo, "checkout", "-q", "-f", "--detach", ref],
    ["git", "-C", repo, "clean", "-ffdq"],
  ];
}

function syncOrigin(ref = "origin/main"): string {
  for (const cmd of syncCommands(SOURCE, REPO, ref, existsSync(join(REPO, ".git"))))
    step("git", cmd, {}, HOME);
  // Le chargeur natif SWC refuse un cache dont un parent est accessible en écriture au groupe.
  step("permissions", ["chmod", "755", REPO]);
  if (step("arbre propre", ["git", "status", "--porcelain", "--untracked-files=no"]).trim())
    throw new Error("arbre de build modifié : release refusée");
  return step("commit", ["git", "rev-parse", "HEAD"]).trim();
}

/** Une étape dans l'image de build d'Aphrody (`scripts/build/container.ts` du commit construit). */
function inBuildImage(label: string, cmd: string[]): string {
  // Bun consumes the first `--` while parsing its own CLI. Pass a second one so
  // container.ts receives its command separator in process.argv.
  return step(label, ["bun", "scripts/build/container.ts", "--", "--", ...cmd]);
}

/**
 * Produits de cargo : `shenron-mcp`, `libshenron_ffi.so` (mémoire du chat du bot, `SHENRON_FFI_LIB`)
 * et les moteurs WebAssembly Koharu et shenron-re.
 */
function cargoProducts(): void {
  inBuildImage("shenron-mcp", ["cargo", "build", "--release", "-p", "shenron-mcp"]);
  inBuildImage("shenron-ffi", ["cargo", "build", "--release", "-p", "shenron-ffi", "--lib"]);
  inBuildImage("koharu-canvas wasm", ["bun", "packages/koharu/scripts/build-wasm.ts"]);
  inBuildImage("shenron-re wasm", ["bun", "packages/pipeline/scripts/build-re-wasm.ts"]);
}

/** Une variable d'un fichier d'environnement (`NOM=valeur`, guillemets facultatifs). */
export function envValue(text: string, name: string): string | undefined {
  const match = new RegExp(`^${name}=["']?([^"'\\n]+)["']?$`, "m").exec(text);
  return match?.[1]?.trim() || undefined;
}

/**
 * L'environnement du build du site, tiré de celui du service : la base de lecture et le CDN.
 * Sans CDN déclaré, le build garde `/_next/` et l'origine sert les chunks.
 */
export function siteBuildEnv(envText: string): Record<string, string> {
  const database = envValue(envText, "DATABASE_URL");
  if (!database) throw new Error("DATABASE_URL introuvable dans l'environnement du site");
  const cdn = envValue(envText, "NEXT_PUBLIC_CDN_URL");
  return { SITE_BUILD_DATABASE_URL: database, ...(cdn ? { NEXT_PUBLIC_CDN_URL: cdn } : {}) };
}

/** Bot compilé, site (base lue dans l'environnement du site) et emballage : `artifacts/releases/<sha>`. */
function bundleSite(commit: string, systemdDir?: string): string {
  inBuildImage("bot", ["bun", "scripts/build/bot.ts", "--target", "linux-x64"]);
  const envFile = Bun.spawnSync(["sudo", "-n", "cat", "/etc/rose-griffon/shenron-site.env"]);
  const buildEnv = siteBuildEnv(envFile.stdout.toString());
  const release = join("artifacts", "releases", commit);
  step("site", ["rm", "-rf", release, `${release}.staging`]);
  step(
    "site + emballage",
    [
      "bun",
      "scripts/build/build-site-external.ts",
      "--release-dir",
      release,
      ...(systemdDir ? ["--systemd-dir", systemdDir] : []),
    ],
    buildEnv,
  );
  return release;
}

function assemble(release: string, commit: string): void {
  step("assemble", ["sudo", "-n", ADAPTER, "assemble", join(REPO, release)]);
  console.log(JSON.stringify({ commit, release: `/srv/shenron/releases/${commit}` }));
}

/** Tout sur le même hôte (le vps, qui a l'accès à GitHub et le cache cargo). */
function build(): void {
  const commit = syncOrigin();
  step("image de build", ["bun", "scripts/build/container.ts", "--check"]);
  inBuildImage("bun install", ["bun", "install", "--frozen-lockfile"]);
  cargoProducts();
  assemble(bundleSite(commit, join(CURRENT, "systemd")), commit);
}

/** Arbre publié par `cdn` : une release assemblée sous /srv/shenron/releases, sinon l'active. */
export function cdnSource(dir: string | undefined): string {
  if (!dir) return CURRENT;
  if (!/^\/srv\/shenron\/releases\/[0-9a-f]{40}$/.test(dir))
    throw new Error(`cdn : release inattendue ${dir}`);
  return dir;
}

async function cdn(dir?: string): Promise<void> {
  const tree = cdnSource(dir);
  const site = join(tree, "apps", "site");
  const rsync = (from: string, to: string, extra: string[] = []) => [
    "rsync",
    "-rlt",
    "--safe-links",
    "--chmod=D755,F644",
    "--exclude=wiki/",
    ...extra,
    `${from}/`,
    `${to}/`,
  ];
  step("cdn public → miroir", rsync(join(site, "public"), join(CDN_SRC, "site")), {}, "/");
  step(
    "cdn public → servi (nouveaux fichiers)",
    rsync(join(site, "public"), join(CDN_OUT, "site"), ["--ignore-existing"]),
    {},
    "/",
  );
  step(
    "cdn _next/static → miroir",
    rsync(join(site, ".next-build", "static"), join(CDN_SRC, "_next", "static")),
    {},
    "/",
  );
  step(
    "cdn _next/static → servi",
    rsync(join(site, ".next-build", "static"), join(CDN_OUT, "_next", "static"), [
      "--ignore-existing",
    ]),
    {},
    "/",
  );
  // Une release pas encore activée n'a pas forcément `RELEASE_SHA` : son dossier porte le sha.
  const shaFile = Bun.file(join(tree, "RELEASE_SHA"));
  const commit = (await shaFile.exists())
    ? (await shaFile.text()).trim()
    : (tree.split("/").pop() ?? "");
  console.log(JSON.stringify({ cdn: "published", commit }));
}

const [command, ref] = import.meta.main ? process.argv.slice(2) : [];
if (!import.meta.main) {
  // importé par les tests : aucune commande
} else if (command === "build") build();
else if (command === "assemble" && ref) assemble(join("artifacts", "releases", ref), ref);
else if (command === "cdn") await cdn(ref);
else throw new Error("usage: release-host.ts build | assemble <sha> | cdn [dir]");
