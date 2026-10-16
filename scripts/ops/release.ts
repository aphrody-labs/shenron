#!/usr/bin/env bun
// SPDX-License-Identifier: Apache-2.0
/**
 * Mise en production de Shenron de bout en bout, depuis un poste d'administration.
 *
 *   bun scripts/ops/release.ts              # build + assemblage (vps), activation, CDN, sondes
 *   bun scripts/ops/release.ts --cdn-only   # republie la release active sur le CDN
 *   bun scripts/ops/release.ts --no-deploy  # build et assemblage seulement
 *
 * Tout build (cargo, bot, site, image) tourne sur le `vps` ; dbfr (production) ne reçoit que les
 * binaires et images scellés, jamais de compilation ni de cache de build.
 *
 * 1. `release-host.ts build` tourne détaché sur le `vps` (`~/shenron-release`, worktree dédié forcé sur
 *    origin/main ; Rust, WASM et bot dans l'image `aphrody-build`) : il
 *    survit à une coupure SSH ; ce script suit son journal jusqu'à la ligne de résultat.
 * 2. `release-host.ts cdn <release>` : `public/` et `.next-build/static` de la NOUVELLE release
 *    sur cdn.dragonballfr.com, AVANT la bascule : le site est construit avec le CDN comme préfixe
 *    des chunks, aucun ne doit manquer au moment où la release s'active.
 * 3. `aphrody-infra deploy --target vps --stack shenron --release … --apply` : sondes de santé
 *    et retour arrière automatique côté adaptateur.
 * 4. `release-host.ts cdn` sur la release active : rattrapage idempotent (rsync sans suppression).
 * 5. Sondes publiques (pages, API, plugin, MCP, WASM de l'éditeur Koharu) ; code de sortie non
 *    nul au premier échec.
 *
 * Le dépôt ne touche aucun hôte autrement que par `aphrody-infra` (ssh exec, deploy).
 */
import { join } from "node:path";

const HOST_SCRIPT = join(import.meta.dir, "release-host.ts");
const args = new Set(process.argv.slice(2));

export type ReleaseConfig = {
  host: string;
  serviceHome: string;
  servicePath: string;
  remoteScript: string;
  logPath: string;
  siteUrl: string;
  cdnUrl: string;
  botUrl: string;
  stack: string;
};

/** Runtime-owned release settings. Secrets stay in Infra stores; only endpoints and paths live here. */
export function releaseConfig(
  env: Record<string, string | undefined> = process.env,
): ReleaseConfig {
  const serviceHome = env.SHENRON_RELEASE_SERVICE_HOME ?? "/home/ubuntu";
  return {
    host: env.SHENRON_RELEASE_HOST ?? "vps",
    serviceHome,
    servicePath:
      env.SHENRON_RELEASE_SERVICE_PATH ??
      `${serviceHome}/.bun/bin:${serviceHome}/.cargo/bin:/usr/local/bin:/usr/bin:/bin`,
    remoteScript: env.SHENRON_RELEASE_REMOTE ?? "$HOME/.shenron-release-host.ts",
    logPath: env.SHENRON_RELEASE_LOG ?? "$HOME/shenron-release.log",
    siteUrl: env.SHENRON_SITE_URL ?? "https://dragonballfr.com",
    cdnUrl: env.SHENRON_CDN_URL ?? "https://cdn.dragonballfr.com",
    botUrl: env.SHENRON_BOT_URL ?? "https://bot.dragonballfr.com",
    stack: env.SHENRON_RELEASE_STACK ?? "shenron",
  };
}

export type ReleaseStep = "build" | "cdn:release" | "deploy" | "cdn:current" | "probes";

/** Ordre des étapes d'une mise en production selon les options de la ligne de commande. */
export function releasePlan(flags: ReadonlySet<string>): ReleaseStep[] {
  if (flags.has("--cdn-only")) return ["cdn:current", "probes"];
  if (flags.has("--no-deploy")) return ["build"];
  return ["build", "cdn:release", "deploy", "cdn:current", "probes"];
}

/** Run release commands as the cataloged service account, regardless of the SSH login user. */
export function asServiceUser(command: string): string {
  const config = releaseConfig();
  const escaped = command.replaceAll("'", "'\\''");
  const user = process.env.SHENRON_RELEASE_SERVICE_USER ?? "ubuntu";
  return `sudo -n -u ${user} env HOME=${config.serviceHome} PATH=${config.servicePath} bash -c '${escaped}'`;
}

function ssh(
  command: string,
  timeoutSecs = 300,
  host = releaseConfig().host,
): { code: number; out: string } {
  const p = Bun.spawnSync(
    ["aphrody-infra", "ssh", "exec", "--host", host, "-c", asServiceUser(command)],
    {
      env: { ...process.env, APHRODY_SSH_COMMAND_TIMEOUT_SECS: String(timeoutSecs) },
      stdout: "pipe",
      stderr: "pipe",
    },
  );
  return { code: p.exitCode ?? 1, out: `${p.stdout}${p.stderr}` };
}

const mask = (text: string) => text.replace(/postgres(ql)?:\/\/\S+/g, "postgres://***");

async function upload(host = releaseConfig().host): Promise<void> {
  const config = releaseConfig();
  const b64 = Buffer.from(await Bun.file(HOST_SCRIPT).text()).toString("base64");
  // `aphrody-infra ssh exec` truncates long commands (~8 KB): send the script in chunks.
  const parts = b64.match(/.{1,3000}/g) ?? [];
  for (const [i, part] of parts.entries()) {
    const r = ssh(`echo ${part} ${i === 0 ? ">" : ">>"} ${config.remoteScript}.b64`, 300, host);
    if (r.code !== 0) throw new Error(`envoi du script hôte sur ${host} : ${r.out}`);
  }
  const r = ssh(
    `base64 -d ${config.remoteScript}.b64 > ${config.remoteScript} && rm -f ${config.remoteScript}.b64`,
    300,
    host,
  );
  if (r.code !== 0) throw new Error(`envoi du script hôte sur ${host} : ${r.out}`);
}

async function build(): Promise<string> {
  const config = releaseConfig();
  await upload();
  const start = ssh(
    `(nohup $HOME/.bun/bin/bun ${config.remoteScript} build > ${config.logPath} 2>&1; echo "== EXIT $?" >> ${config.logPath}) > /dev/null 2>&1 &`,
  );
  if (start.code !== 0) throw new Error(`lancement du build : ${start.out}`);
  const deadline = Date.now() + 90 * 60_000;
  let shown = "";
  while (Date.now() < deadline) {
    await Bun.sleep(30_000);
    const tail = ssh(`grep -E '^== |^\\{' ${config.logPath} | tail -4`).out.trim();
    if (tail !== shown) console.log(mask(tail));
    shown = tail;
    const exit = /== EXIT (\d+)/.exec(tail);
    if (!exit) continue;
    if (exit[1] !== "0")
      throw new Error(`build en échec :\n${mask(ssh(`tail -40 ${config.logPath}`).out)}`);
    const result = /\{"commit":"([0-9a-f]{40})","release":"([^"]+)"\}/.exec(
      ssh(`tail -5 ${config.logPath}`).out,
    );
    if (!result) throw new Error("build terminé sans ligne de résultat");
    return result[2]!;
  }
  throw new Error("build : délai de 90 minutes dépassé");
}

function deploy(release: string): void {
  const p = Bun.spawnSync(
    [
      "aphrody-infra",
      "deploy",
      "--target",
      releaseConfig().host,
      "--stack",
      releaseConfig().stack,
      "--release",
      release,
      "--apply",
    ],
    {
      env: { ...process.env, APHRODY_SSH_COMMAND_TIMEOUT_SECS: "1500" },
      stdout: "pipe",
      stderr: "pipe",
    },
  );
  const out = `${p.stdout}${p.stderr}`;
  console.log(
    out
      .split("\n")
      .filter((l) => /activated|restored|error|fail/i.test(l))
      .join("\n"),
  );
  if (p.exitCode !== 0 || !/activated Shenron/.test(out))
    throw new Error(`activation : ${out.slice(-2000)}`);
}

/** Publie sur le CDN une release assemblée (`release`) ou, sans argument, la release active. */
async function cdn(release?: string): Promise<void> {
  const config = releaseConfig();
  await upload();
  const r = ssh(
    `$HOME/.bun/bin/bun ${config.remoteScript} cdn${release ? ` ${release}` : ""}`,
    900,
  );
  console.log(r.out.trim().split("\n").slice(-3).join("\n"));
  if (r.code !== 0) throw new Error("publication CDN en échec");
}

async function probes(): Promise<void> {
  const config = releaseConfig();
  const site = config.siteUrl;
  const failures: string[] = [];
  const unknownMangaPath = "/wiki/manga/__release-not-found-probe__";
  const unknownManga = await fetch(site + unknownMangaPath, { redirect: "manual" }).catch(
    () => null,
  );
  console.log(`${unknownManga?.status ?? "ERR"} ${unknownMangaPath} (expected 404)`);
  if (unknownManga?.status !== 404) failures.push(`${unknownMangaPath} (expected 404)`);

  for (const path of [
    "/",
    "/games",
    "/games/xenoverse-2",
    "/wiki/characters",
    "/studio",
    "/desktop",
    "/llms.txt",
    "/plugin.json",
    "/api/public/plugin",
    "/.well-known/mcp.json",
  ]) {
    const res = await fetch(site + path, { redirect: "manual" }).catch(() => null);
    console.log(`${res?.status ?? "ERR"} ${path}`);
    if (res?.status !== 200) failures.push(path);
  }
  const font = await fetch(`${site}/`)
    .then((r) => r.text())
    .then((html) => /href="([^"]+\/fonts\/[^"]+\.woff2)"/.exec(html)?.[1]);
  if (font) {
    const res = await fetch(font.startsWith("http") ? font : site + font);
    console.log(`${res.status} police préchargée ${font}`);
    if (res.status !== 200) failures.push(font);
  }
  failures.push(...(await koharuWasmProbe()));
  failures.push(...(await xenoverseWasmProbe()));
  failures.push(...(await ragProbe()));
  if (failures.length) throw new Error(`sondes en échec : ${failures.join(", ")}`);
}

/** Vérifie le WASM Xenoverse servi avec le type, le cache et CORS attendus. */
async function xenoverseWasmProbe(): Promise<string[]> {
  // oxlint-disable-next-line eslint/no-shadow -- intentional local name reuse
  const { siteUrl: site, cdnUrl: cdn } = releaseConfig();
  const html = await fetch(`${site}/games/xenoverse-2`)
    .then((response) => (response.ok ? response.text() : ""))
    .catch(() => "");
  const chunk = /["']((?:https?:\/\/[^"'/]+)?\/_next\/static\/chunks\/[\w.-]+\.js)/g;
  const queue = [...new Set([...html.matchAll(chunk)].map((match) => match[1]!))];
  const seen = new Set<string>();
  let filename: string | undefined;
  while (!filename && queue.length && seen.size < 200) {
    const path = queue.shift()!;
    if (seen.has(path)) continue;
    seen.add(path);
    const js = await fetch(path.startsWith("http") ? path : site + path)
      .then((response) => (response.ok ? response.text() : ""))
      .catch(() => "");
    filename = /shenron_re_bg\.[a-f0-9]{16}\.wasm/.exec(js)?.[0];
    for (const match of js.matchAll(/static\/chunks\/[\w.-]+\.js/g))
      queue.push(`/_next/${match[0]}`);
  }
  if (!filename) {
    console.log(
      `ERR WASM shenron-re : aucun chunk Xenoverse ne référence le binaire (${seen.size} lus)`,
    );
    return ["/games/xenoverse-2 (wasm)"];
  }

  const failures: string[] = [];
  for (const url of [`${site}/wasm/${filename}`, `${cdn}/wasm/${filename}`]) {
    const response = await fetch(url, { headers: { origin: site } }).catch(() => null);
    const type = response?.headers.get("content-type")?.split(";")[0]?.trim();
    const cache = response?.headers.get("cache-control") ?? "";
    const cors =
      url.startsWith(site) || response?.headers.get("access-control-allow-origin") != null;
    const valid = response?.ok ? WebAssembly.validate(await response.bytes()) : false;
    console.log(`${response?.status ?? "ERR"} ${type ?? "-"} ${cache || "-"} ${url}`);
    if (
      type !== "application/wasm" ||
      !/\bpublic\b/.test(cache) ||
      /\bno-store\b/.test(cache) ||
      !cors ||
      !valid
    )
      failures.push(url);
  }
  return failures;
}

/**
 * Le RAG de production : la recherche du bot passe par le calcul d'Aphrody (hôte de calcul,
 * tunnel inverse vers le vps). Une réponse sans résultat (`index_unavailable`) ou en erreur
 * signale un calcul injoignable ou une base RAG absente.
 */
async function ragProbe(): Promise<string[]> {
  const url = `${releaseConfig().botUrl}/api/public/rag/search?q=Kid%20Buu`;
  const res = await fetch(url, { signal: AbortSignal.timeout(60_000) }).catch(() => null);
  const body = (await res?.json().catch(() => null)) as {
    results?: unknown[];
    error?: string;
  } | null;
  const count = body?.results?.length ?? 0;
  console.log(
    `${res?.status ?? "ERR"} rag/search (${count} résultats${body?.error ? `, ${body.error}` : ""})`,
  );
  return res?.status === 200 && count > 0 ? [] : ["rag/search"];
}

/**
 * Le viewport de l'éditeur (`/studio`) compile son WASM en streaming : le fichier référencé par
 * les chunks de la page doit sortir en `application/wasm`, immuable, valide, depuis le site
 * (URL résolue par le navigateur) et depuis le CDN (miroir de `_next/static`, CORS ouvert).
 */
async function koharuWasmProbe(): Promise<string[]> {
  // oxlint-disable-next-line eslint/no-shadow -- intentional local name reuse
  const { siteUrl: site, cdnUrl: cdn } = releaseConfig();
  const html = await fetch(`${site}/studio`)
    .then((r) => (r.ok ? r.text() : ""))
    .catch(() => "");
  const chunk = /["']((?:https?:\/\/[^"'/]+)?\/_next\/static\/chunks\/[\w.-]+\.js)/g;
  const queue = [...new Set([...html.matchAll(chunk)].map((m) => m[1]!))];
  const seen = new Set<string>();
  let wasm: string | undefined;
  while (!wasm && queue.length && seen.size < 200) {
    const url = queue.shift()!;
    if (seen.has(url)) continue;
    seen.add(url);
    const js = await fetch(url.startsWith("http") ? url : site + url)
      .then((r) => (r.ok ? r.text() : ""))
      .catch(() => "");
    wasm = /\/_next\/static\/media\/koharu_canvas_bg\.[\w.-]+\.wasm/.exec(js)?.[0];
    for (const m of js.matchAll(/static\/chunks\/[\w.-]+\.js/g)) queue.push(`/_next/${m[0]}`);
  }
  if (!wasm) {
    console.log(`ERR WASM koharu : aucun chunk de /studio ne le référence (${seen.size} lus)`);
    return ["/studio (wasm)"];
  }
  const failures: string[] = [];
  for (const url of [site + wasm, cdn + wasm]) {
    const res = await fetch(url, { headers: { origin: site } }).catch(() => null);
    const type = res?.headers.get("content-type")?.split(";")[0]?.trim();
    const cache = res?.headers.get("cache-control") ?? "";
    const cors = url.startsWith(site) || res?.headers.get("access-control-allow-origin") != null;
    const valid = res?.ok ? WebAssembly.validate(await res.bytes()) : false;
    console.log(`${res?.status ?? "ERR"} ${type ?? "-"} ${cache || "-"} ${url}`);
    if (type !== "application/wasm" || !/immutable/.test(cache) || !cors || !valid)
      failures.push(url);
  }
  return failures;
}

if (import.meta.main && (args.has("--help") || args.has("-h"))) {
  console.log("bun scripts/ops/release.ts [--cdn-only | --no-deploy]");
} else if (import.meta.main) {
  let release = "";
  for (const step of releasePlan(args)) {
    if (step === "build") {
      release = await build();
      console.log(`release prête : ${release}`);
    } else if (step === "cdn:release") await cdn(release);
    else if (step === "deploy") deploy(release);
    else if (step === "cdn:current") await cdn();
    else await probes();
  }
}
