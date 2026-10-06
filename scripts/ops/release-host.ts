#!/usr/bin/env bun
// SPDX-License-Identifier: Apache-2.0
/**
 * Côté hôte de `scripts/ops/release.ts` : exécuté sur le `vps` (utilisateur de service,
 * `sudo -n` pour l'adaptateur et l'environnement), depuis n'importe quel dossier.
 *
 *   bun release-host.ts build   # main → artifacts/releases/<sha>, assemblé sous /srv/shenron/releases
 *   bun release-host.ts cdn [dir] # publie une release sur le CDN (défaut : la release active)
 *
 * Build réparti (`release.ts --build-host dbfr`) : `cargo [ref]` (vps : shenron-mcp et WASM),
 * `bundle <sha>` (dbfr : bot, site, emballage), puis `assemble <sha>` (vps) sur la release relayée.
 *
 * `build` : avance rapide de `~/shenron` sur origin/main (arbre propre exigé), install figée,
 * `shenron-mcp` (cargo), bot compilé, WASM du viewport Koharu (`packages/koharu/scripts/
 * build-wasm.ts` : cible wasm32 et CLI wasm-bindgen verrouillé installés au premier passage,
 * rien à refaire si son tampon est à jour), site (`build-site-external.ts`, base lue dans
 * l'environnement du site, jamais affichée), emballage puis `aphrody-infra-deploy-shenron
 * assemble`. Dernière ligne : `{"commit": …, "release": …}`.
 *
 * Le site est construit avec `NEXT_PUBLIC_CDN_URL` de l'environnement du site : le préfixe des
 * chunks est gravé dans le runtime Turbopack et `next start` le reprend du build
 * (`apps/site/src/lib/build-frozen-config.ts`). Servis par l'origine, les chunks d'une release
 * disparaissaient à la suivante et un onglet ouvert avant la bascule tombait en ChunkLoadError ;
 * le CDN, lui, garde tous les anciens chunks.
 *
 * `cdn [dir]` : décharge Next de tout le statique. `apps/site/public/` (hors `wiki/`, déjà servi
 * par le CDN) et `.next-build/static/` de la release `dir` (défaut : la release active) vont dans le miroir source du CDN
 * (`/srv/shenron-cdn-src`) et, pour ce qui n'y est pas encore, directement dans l'arbre servi
 * (`/srv/shenron-cdn`) : disponibles tout de suite, ré-encodés ensuite par
 * `aphrody-cdn-optimize`. Jamais de suppression : une page en cache garde ses anciens fichiers.
 * Le WASM de Koharu y part avec les médias (`static/media/koharu_canvas_bg.<hash>.wasm`) ; nginx
 * le sert en `application/wasm`, immuable (sonde de `release.ts`).
 */
import { join } from "node:path";

const HOME = process.env.HOME ?? "/home/ubuntu";
// `bundle` tourne sur dbfr, dans un dépôt dédié que `release.ts` alimente par `git push` (dbfr n'a
// aucun accès à GitHub) ; `SHENRON_BUILD_REPO` le désigne.
const REPO = process.env.SHENRON_BUILD_REPO ?? join(HOME, "shenron");
const CURRENT = "/srv/shenron/current";
const CDN_SRC = "/srv/shenron-cdn-src";
const CDN_OUT = "/srv/shenron-cdn";
const ADAPTER = "/usr/local/sbin/aphrody-infra-deploy-shenron";
const PATH = `${join(HOME, ".bun", "bin")}:${join(HOME, ".cargo", "bin")}:/usr/local/bin:/usr/bin:/bin`;

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

/** Avance rapide de `~/shenron` sur `ref` (défaut : origin/main), arbre propre exigé. */
function syncOrigin(ref = "origin/main"): string {
  // Le chargeur natif SWC refuse un cache dont un parent est accessible en écriture au groupe.
  step("permissions", ["chmod", "755", REPO]);
  step("git", ["git", "fetch", "-q", "origin"]);
  step("git", ["git", "checkout", "-q", "main"]);
  step("git", ["git", "merge", "-q", "--ff-only", ref]);
  if (step("arbre propre", ["git", "status", "--porcelain", "--untracked-files=no"]).trim())
    throw new Error("arbre de build modifié : release refusée");
  return step("commit", ["git", "rev-parse", "HEAD"]).trim();
}

/**
 * Produits de cargo : `shenron-mcp`, `libshenron_ffi.so` (mémoire du chat du bot, `SHENRON_FFI_LIB`)
 * et le WASM du viewport Koharu.
 */
function cargoProducts(): void {
  step("shenron-mcp", ["cargo", "build", "--release", "-p", "shenron-mcp"]);
  step("shenron-ffi", ["cargo", "build", "--release", "-p", "shenron-ffi", "--lib"]);
  step("koharu-canvas wasm", ["bun", "packages/koharu/scripts/build-wasm.ts"]);
}

/** Bot compilé, site (base lue dans l'environnement du site) et emballage : `artifacts/releases/<sha>`. */
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

function bundleSite(commit: string): string {
  step("bot", ["bun", "scripts/build/bot.ts", "--target", "linux-x64"]);
  const envFile = Bun.spawnSync(["sudo", "-n", "cat", "/etc/rose-griffon/shenron-site.env"]);
  const buildEnv = siteBuildEnv(envFile.stdout.toString());
  const release = join("artifacts", "releases", commit);
  step("site", ["rm", "-rf", release, `${release}.staging`]);
  step(
    "site + emballage",
    ["bun", "scripts/build/build-site-external.ts", "--release-dir", release],
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
  step("bun install", ["bun", "install", "--frozen-lockfile"]);
  cargoProducts();
  assemble(bundleSite(commit), commit);
}

/** Étape cargo seule, sur le vps : la sortie est relayée vers dbfr par `release.ts`. */
function cargo(ref: string): void {
  const commit = syncOrigin(ref);
  step("bun install", ["bun", "install", "--frozen-lockfile"]);
  cargoProducts();
  console.log(JSON.stringify({ commit }));
}

/**
 * Étape bot + site + emballage, sur dbfr : le dépôt de build reçoit `ref` par push, les produits
 * de cargo y arrivent déjà posés (`target/release/shenron-mcp`, `packages/koharu/src/wasm`).
 */
function bundle(ref: string): void {
  step("git", ["git", "checkout", "-q", "-f", "--detach", ref]);
  const commit = step("commit", ["git", "rev-parse", "HEAD"]).trim();
  step("bun install", ["bun", "install", "--frozen-lockfile"]);
  const release = bundleSite(commit);
  console.log(JSON.stringify({ commit, release: join(REPO, release) }));
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

/** dbfr ne garde rien entre deux builds : seul le dépôt de build (sources) reste. */
function clean(): void {
  step("nettoyage", [
    "rm",
    "-rf",
    "node_modules",
    "artifacts",
    "target",
    "dist",
    ".cache",
    join(HOME, ".bun", "install"),
  ]);
}

const [command, ref] = import.meta.main ? process.argv.slice(2) : [];
if (!import.meta.main) {
  // importé par les tests : aucune commande
} else if (command === "build") build();
else if (command === "cargo") cargo(ref ?? "origin/main");
else if (command === "bundle" && ref) bundle(ref);
else if (command === "assemble" && ref) assemble(join("artifacts", "releases", ref), ref);
else if (command === "clean") clean();
else if (command === "cdn") await cdn(ref);
else
  throw new Error(
    "usage: release-host.ts build | cargo [ref] | bundle <sha> | assemble <sha> | clean | cdn [dir]",
  );
