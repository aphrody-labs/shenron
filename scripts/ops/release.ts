#!/usr/bin/env bun
// SPDX-License-Identifier: Apache-2.0
/**
 * Mise en production de Shenron de bout en bout, depuis un poste d'administration.
 *
 *   bun scripts/ops/release.ts              # build + assemblage (vps), activation, CDN, sondes
 *   bun scripts/ops/release.ts --cdn-only   # republie la release active sur le CDN
 *   bun scripts/ops/release.ts --no-deploy  # build et assemblage seulement
 *   bun scripts/ops/release.ts --build-host dbfr|vps|auto   # où tourne le gros du build
 *
 * `--build-host dbfr` (ou `auto` quand la charge du vps dépasse `VPS_BUSY_LOAD`) répartit le build :
 * le vps garde cargo (`shenron-mcp`, WASM : il a l'accès à GitHub et le cache), dbfr compile le bot
 * et le site (Turbopack) sous un cgroup borné (CPU, mémoire, disque en priorité basse) ; WSL ne fait
 * que relayer les fichiers (git push du commit, tar en flux), aucun calcul.
 *
 * 1. `release-host.ts build` tourne détaché sur le `vps` (~/shenron sur origin/main) : il
 *    survit à une coupure SSH ; ce script suit son journal jusqu'à la ligne de résultat.
 * 2. `aphrody-infra deploy --target vps --stack shenron --release … --apply` : sondes de santé
 *    et retour arrière automatique côté adaptateur.
 * 3. `release-host.ts cdn` : `public/` et `.next-build/static` sur cdn.dragonballfr.com.
 * 4. Sondes publiques (pages, API, plugin, MCP, WASM de l'éditeur Koharu) ; code de sortie non
 *    nul au premier échec.
 *
 * Le dépôt ne touche aucun hôte autrement que par `aphrody-infra` (ssh exec, deploy).
 */
import { join } from "node:path";

const HOST = "vps";
const HOST_SCRIPT = join(import.meta.dir, "release-host.ts");
const REMOTE = "$HOME/.shenron-release-host.ts";
const LOG = "$HOME/shenron-release.log";
const SITE = "https://dragonballfr.com";
const CDN = "https://cdn.dragonballfr.com";
const args = new Set(process.argv.slice(2));

function ssh(command: string, timeoutSecs = 300, host = HOST): { code: number; out: string } {
  const p = Bun.spawnSync(["aphrody-infra", "ssh", "exec", "--host", host, "-c", command], {
    env: { ...process.env, APHRODY_SSH_COMMAND_TIMEOUT_SECS: String(timeoutSecs) },
    stdout: "pipe",
    stderr: "pipe",
  });
  return { code: p.exitCode ?? 1, out: `${p.stdout}${p.stderr}` };
}

const mask = (text: string) => text.replace(/postgres(ql)?:\/\/\S+/g, "postgres://***");

async function upload(host = HOST): Promise<void> {
  const b64 = Buffer.from(await Bun.file(HOST_SCRIPT).text()).toString("base64");
  const r = ssh(`echo ${b64} | base64 -d > ${REMOTE}`, 300, host);
  if (r.code !== 0) throw new Error(`envoi du script hôte sur ${host} : ${r.out}`);
}

const VPS_BUSY_LOAD = 8;
const BUILD_REPO = "$HOME/shenron-build";
/** dbfr héberge PostgreSQL et Redis de production : le build y est borné et en priorité basse. */
const DBFR_CAGE =
  "sudo -n systemd-run --scope --quiet --uid=ubuntu --nice=10 --setenv=HOME=/home/ubuntu " +
  "-p MemoryMax=7G -p CPUQuota=450% -p IOWeight=20";

function pickBuildHost(): "vps" | "dbfr" {
  const asked = process.argv.find((a) => a.startsWith("--build-host="))?.split("=")[1];
  const flag = asked ?? process.argv[process.argv.indexOf("--build-host") + 1];
  if (flag === "vps" || flag === "dbfr") return flag;
  const load = (host: string) => Number(ssh("cat /proc/loadavg", 60, host).out.split(" ")[0]);
  const vps = load("vps");
  const busy = !Number.isFinite(vps) || vps > VPS_BUSY_LOAD;
  const dbfr = load("dbfr");
  console.log(`charge vps ${vps}, dbfr ${dbfr}`);
  // Next se compile dans l'image Node de l'usine (build-site-external.ts) : sans Docker ni image
  // en cache, dbfr ne peut pas construire le site.
  const factory = ssh("docker image inspect node:22-bookworm-slim > /dev/null 2>&1", 60, "dbfr");
  return busy && dbfr < 3 && factory.code === 0 ? "dbfr" : "vps";
}

/** Flux binaire d'un hôte à l'autre, par WSL : aucun calcul ici, seulement le relais. */
async function relay(from: string, fromCmd: string, to: string, toCmd: string): Promise<void> {
  const src = Bun.spawn(["ssh", from, fromCmd], { stdout: "pipe", stderr: "inherit" });
  const dst = Bun.spawn(["ssh", to, toCmd], { stdin: src.stdout, stderr: "inherit" });
  const [a, b] = await Promise.all([src.exited, dst.exited]);
  if (a !== 0 || b !== 0) throw new Error(`relais ${from} → ${to} en échec (${a}/${b})`);
}

/** Suit un journal détaché jusqu'à sa ligne de résultat `{"commit":…}` ; renvoie cette ligne. */
async function follow(host: string, log: string, minutes: number): Promise<string> {
  const deadline = Date.now() + minutes * 60_000;
  let shown = "";
  while (Date.now() < deadline) {
    await Bun.sleep(30_000);
    const tail = ssh(`grep -E '^== |^\\{' ${log} | tail -4`, 300, host).out.trim();
    if (tail !== shown) console.log(mask(tail));
    shown = tail;
    const exit = /== EXIT (\d+)/.exec(tail);
    if (!exit) continue;
    if (exit[1] !== "0")
      throw new Error(`${host} : build en échec :\n${mask(ssh(`tail -40 ${log}`, 300, host).out)}`);
    return ssh(`tail -5 ${log}`, 300, host).out;
  }
  throw new Error(`${host} : délai de ${minutes} minutes dépassé`);
}

async function detached(host: string, command: string, log: string): Promise<void> {
  const start = ssh(
    `(nohup ${command} > ${log} 2>&1; echo "== EXIT $?" >> ${log}) > /dev/null 2>&1 &`,
    300,
    host,
  );
  if (start.code !== 0) throw new Error(`lancement sur ${host} : ${start.out}`);
}

const git = (...args: string[]) =>
  Bun.spawnSync(["git", ...args], { stdout: "pipe", stderr: "pipe" });

/** Build réparti : cargo sur le vps, bot + site sur dbfr, relais par WSL, assemblage sur le vps. */
async function buildOnDbfr(): Promise<string> {
  await upload("vps");
  await upload("dbfr");
  git("fetch", "-q", "origin");
  const sha = git("rev-parse", "origin/main").stdout.toString().trim();
  if (!/^[0-9a-f]{40}$/.test(sha)) throw new Error("origin/main introuvable");
  console.log(`commit ${sha} : cargo sur le vps, bot et site sur dbfr`);

  // 1. le commit part vers dbfr (pas d'accès GitHub là-bas) pendant que le vps lance cargo.
  const push = Bun.spawnSync(
    ["git", "push", "-q", "ssh://dbfr/home/ubuntu/shenron-build", `${sha}:refs/heads/incoming`],
    { stdout: "pipe", stderr: "pipe" },
  );
  if (push.exitCode !== 0) throw new Error(`push vers dbfr : ${push.stderr}`);
  await detached(
    "vps",
    `$HOME/.bun/bin/bun ${REMOTE} cargo ${sha}`,
    "$HOME/shenron-release-cargo.log",
  );
  await follow("vps", "$HOME/shenron-release-cargo.log", 60);

  // 2. produits de cargo : vps → dbfr
  await relay(
    "vps",
    "tar -C ~/shenron -cf - target/release/shenron-mcp packages/koharu/src/wasm",
    "dbfr",
    `mkdir -p ${BUILD_REPO} && tar -C ${BUILD_REPO} -xf -`,
  );

  // 3. bot + site + emballage sur dbfr, sous cgroup borné
  await detached(
    "dbfr",
    `${DBFR_CAGE} env SHENRON_BUILD_REPO=${BUILD_REPO} $HOME/.bun/bin/bun ${REMOTE} bundle ${sha}`,
    "$HOME/shenron-release.log",
  );
  await follow("dbfr", "$HOME/shenron-release.log", 90);

  // 4. release scellée : dbfr → vps, puis assemblage sur le vps
  await relay(
    "dbfr",
    `tar -C ${BUILD_REPO}/artifacts/releases -cf - ${sha}`,
    "vps",
    "mkdir -p ~/shenron/artifacts/releases && tar -C ~/shenron/artifacts/releases -xf -",
  );
  // dbfr (PostgreSQL et Redis de production) ne garde ni dépendances ni release après le relais.
  ssh(`SHENRON_BUILD_REPO=${BUILD_REPO} $HOME/.bun/bin/bun ${REMOTE} clean`, 300, "dbfr");
  await detached(
    "vps",
    `$HOME/.bun/bin/bun ${REMOTE} assemble ${sha}`,
    "$HOME/shenron-release.log",
  );
  const out = await follow("vps", "$HOME/shenron-release.log", 15);
  const result = /\{"commit":"([0-9a-f]{40})","release":"([^"]+)"\}/.exec(out);
  if (!result) throw new Error("assemblage terminé sans ligne de résultat");
  return result[2]!;
}

async function build(): Promise<string> {
  const host = pickBuildHost();
  console.log(`hôte de build : ${host}`);
  if (host === "dbfr") return buildOnDbfr();
  await upload();
  const start = ssh(
    `(nohup $HOME/.bun/bin/bun ${REMOTE} build > ${LOG} 2>&1; echo "== EXIT $?" >> ${LOG}) > /dev/null 2>&1 &`,
  );
  if (start.code !== 0) throw new Error(`lancement du build : ${start.out}`);
  const deadline = Date.now() + 90 * 60_000;
  let shown = "";
  while (Date.now() < deadline) {
    await Bun.sleep(30_000);
    const tail = ssh(`grep -E '^== |^\\{' ${LOG} | tail -4`).out.trim();
    if (tail !== shown) console.log(mask(tail));
    shown = tail;
    const exit = /== EXIT (\d+)/.exec(tail);
    if (!exit) continue;
    if (exit[1] !== "0") throw new Error(`build en échec :\n${mask(ssh(`tail -40 ${LOG}`).out)}`);
    const result = /\{"commit":"([0-9a-f]{40})","release":"([^"]+)"\}/.exec(
      ssh(`tail -5 ${LOG}`).out,
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
      HOST,
      "--stack",
      "shenron",
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

async function cdn(): Promise<void> {
  await upload();
  const r = ssh(`$HOME/.bun/bin/bun ${REMOTE} cdn`, 900);
  console.log(r.out.trim().split("\n").slice(-3).join("\n"));
  if (r.code !== 0) throw new Error("publication CDN en échec");
}

async function probes(): Promise<void> {
  const failures: string[] = [];
  for (const path of [
    "/",
    "/jeux",
    "/wiki/personnages",
    "/llms.txt",
    "/plugin.json",
    "/api/public/plugin",
    "/.well-known/mcp.json",
  ]) {
    const res = await fetch(SITE + path, { redirect: "manual" }).catch(() => null);
    console.log(`${res?.status ?? "ERR"} ${path}`);
    if (res?.status !== 200) failures.push(path);
  }
  const font = await fetch(`${SITE}/`)
    .then((r) => r.text())
    .then((html) => /href="([^"]+\/fonts\/[^"]+\.woff2)"/.exec(html)?.[1]);
  if (font) {
    const res = await fetch(font.startsWith("http") ? font : SITE + font);
    console.log(`${res.status} police préchargée ${font}`);
    if (res.status !== 200) failures.push(font);
  }
  failures.push(...(await koharuWasmProbe()));
  if (failures.length) throw new Error(`sondes en échec : ${failures.join(", ")}`);
}

/**
 * Le viewport de l'éditeur (`/koharu`) compile son WASM en streaming : le fichier référencé par
 * les chunks de la page doit sortir en `application/wasm`, immuable, valide, depuis le site
 * (URL résolue par le navigateur) et depuis le CDN (miroir de `_next/static`, CORS ouvert).
 */
async function koharuWasmProbe(): Promise<string[]> {
  const html = await fetch(`${SITE}/koharu`)
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
    const js = await fetch(url.startsWith("http") ? url : SITE + url)
      .then((r) => (r.ok ? r.text() : ""))
      .catch(() => "");
    wasm = /\/_next\/static\/media\/koharu_canvas_bg\.[\w.-]+\.wasm/.exec(js)?.[0];
    for (const m of js.matchAll(/static\/chunks\/[\w.-]+\.js/g)) queue.push(`/_next/${m[0]}`);
  }
  if (!wasm) {
    console.log(`ERR WASM koharu : aucun chunk de /koharu ne le référence (${seen.size} lus)`);
    return ["/koharu (wasm)"];
  }
  const failures: string[] = [];
  for (const url of [SITE + wasm, CDN + wasm]) {
    const res = await fetch(url, { headers: { origin: SITE } }).catch(() => null);
    const type = res?.headers.get("content-type")?.split(";")[0]?.trim();
    const cache = res?.headers.get("cache-control") ?? "";
    const cors = url.startsWith(SITE) || res?.headers.get("access-control-allow-origin") != null;
    const valid = res?.ok ? WebAssembly.validate(await res.bytes()) : false;
    console.log(`${res?.status ?? "ERR"} ${type ?? "-"} ${cache || "-"} ${url}`);
    if (type !== "application/wasm" || !/immutable/.test(cache) || !cors || !valid)
      failures.push(url);
  }
  return failures;
}

if (args.has("--cdn-only")) {
  await cdn();
  await probes();
} else {
  const release = await build();
  console.log(`release prête : ${release}`);
  if (!args.has("--no-deploy")) {
    deploy(release);
    await cdn();
    await probes();
  }
}
