#!/usr/bin/env bun
// SPDX-License-Identifier: Apache-2.0
/**
 * Côté hôte de `scripts/ops/release.ts` : exécuté sur le `vps` (utilisateur de service,
 * `sudo -n` pour l'adaptateur et l'environnement), depuis n'importe quel dossier.
 *
 *   bun release-host.ts build   # main → artifacts/releases/<sha>, assemblé sous /srv/shenron/releases
 *   bun release-host.ts cdn     # publie la release active sur le CDN
 *
 * `build` : avance rapide de `~/shenron` sur origin/main (arbre propre exigé), install figée,
 * `shenron-mcp` (cargo), bot compilé, WASM du viewport Koharu (`packages/koharu/scripts/
 * build-wasm.ts` : cible wasm32 et CLI wasm-bindgen verrouillé installés au premier passage,
 * rien à refaire si son tampon est à jour), site (`build-site-external.ts`, base lue dans
 * l'environnement du site, jamais affichée), emballage puis `aphrody-infra-deploy-shenron
 * assemble`. Dernière ligne : `{"commit": …, "release": …}`.
 *
 * `cdn` : décharge Next de tout le statique. `apps/site/public/` (hors `wiki/`, déjà servi par
 * le CDN) et `.next-build/static/` de la release active vont dans le miroir source du CDN
 * (`/srv/shenron-cdn-src`) et, pour ce qui n'y est pas encore, directement dans l'arbre servi
 * (`/srv/shenron-cdn`) : disponibles tout de suite, ré-encodés ensuite par
 * `aphrody-cdn-optimize`. Jamais de suppression : une page en cache garde ses anciens fichiers.
 * Le WASM de Koharu y part avec les médias (`static/media/koharu_canvas_bg.<hash>.wasm`) ; nginx
 * le sert en `application/wasm`, immuable (sonde de `release.ts`).
 */
import { join } from "node:path";

const HOME = process.env.HOME ?? "/home/ubuntu";
const REPO = join(HOME, "shenron");
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

function build(): void {
  // Le chargeur natif SWC refuse un cache dont un parent est accessible en écriture au groupe.
  step("permissions", ["chmod", "755", REPO]);
  step("git", ["git", "fetch", "-q", "origin"]);
  step("git", ["git", "checkout", "-q", "main"]);
  step("git", ["git", "merge", "-q", "--ff-only", "origin/main"]);
  if (step("arbre propre", ["git", "status", "--porcelain", "--untracked-files=no"]).trim())
    throw new Error("arbre de build modifié : release refusée");
  const commit = step("commit", ["git", "rev-parse", "HEAD"]).trim();
  step("bun install", ["bun", "install", "--frozen-lockfile"]);
  step("shenron-mcp", ["cargo", "build", "--release", "-p", "shenron-mcp"]);
  step("bot", ["bun", "scripts/build/bot.ts", "--target", "linux-x64"]);
  step("koharu-canvas wasm", ["bun", "packages/koharu/scripts/build-wasm.ts"]);
  const envFile = Bun.spawnSync(["sudo", "-n", "cat", "/etc/rose-griffon/shenron-site.env"]);
  const database = /^DATABASE_URL=["']?([^"'\n]+)["']?$/m.exec(envFile.stdout.toString())?.[1];
  if (!database) throw new Error("DATABASE_URL introuvable dans l'environnement du site");
  const release = join("artifacts", "releases", commit);
  step("site", ["rm", "-rf", release, `${release}.staging`]);
  step(
    "site + emballage",
    ["bun", "scripts/build/build-site-external.ts", "--release-dir", release],
    {
      SITE_BUILD_DATABASE_URL: database,
    },
  );
  step("assemble", ["sudo", "-n", ADAPTER, "assemble", join(REPO, release)]);
  console.log(JSON.stringify({ commit, release: `/srv/shenron/releases/${commit}` }));
}

async function cdn(): Promise<void> {
  const site = join(CURRENT, "apps", "site");
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
  const commit = (await Bun.file(join(CURRENT, "RELEASE_SHA")).text()).trim();
  console.log(JSON.stringify({ cdn: "published", commit }));
}

const command = process.argv[2];
if (command === "build") build();
else if (command === "cdn") await cdn();
else throw new Error("usage: release-host.ts build | cdn");
