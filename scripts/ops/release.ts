#!/usr/bin/env bun
// SPDX-License-Identifier: Apache-2.0
/**
 * Mise en production de Shenron de bout en bout, depuis un poste d'administration.
 *
 *   bun scripts/ops/release.ts              # build + assemblage (vps), activation, CDN, sondes
 *   bun scripts/ops/release.ts --cdn-only   # republie la release active sur le CDN
 *   bun scripts/ops/release.ts --no-deploy  # build et assemblage seulement
 *
 * 1. `release-host.ts build` tourne détaché sur le `vps` (~/shenron sur origin/main) : il
 *    survit à une coupure SSH ; ce script suit son journal jusqu'à la ligne de résultat.
 * 2. `aphrody-infra deploy --target vps --stack shenron --release … --apply` : sondes de santé
 *    et retour arrière automatique côté adaptateur.
 * 3. `release-host.ts cdn` : `public/` et `.next-build/static` sur cdn.dragonballfr.com.
 * 4. Sondes publiques (pages, API, plugin, MCP) ; code de sortie non nul au premier échec.
 *
 * Le dépôt ne touche aucun hôte autrement que par `aphrody-infra` (ssh exec, deploy).
 */
import { join } from "node:path";

const HOST = "vps";
const HOST_SCRIPT = join(import.meta.dir, "release-host.ts");
const REMOTE = "$HOME/.shenron-release-host.ts";
const LOG = "$HOME/shenron-release.log";
const SITE = "https://dragonballfr.com";
const args = new Set(process.argv.slice(2));

function ssh(command: string, timeoutSecs = 300): { code: number; out: string } {
  const p = Bun.spawnSync(["aphrody-infra", "ssh", "exec", "--host", HOST, "-c", command], {
    env: { ...process.env, APHRODY_SSH_COMMAND_TIMEOUT_SECS: String(timeoutSecs) },
    stdout: "pipe",
    stderr: "pipe",
  });
  return { code: p.exitCode ?? 1, out: `${p.stdout}${p.stderr}` };
}

const mask = (text: string) => text.replace(/postgres(ql)?:\/\/\S+/g, "postgres://***");

async function upload(): Promise<void> {
  const b64 = Buffer.from(await Bun.file(HOST_SCRIPT).text()).toString("base64");
  const r = ssh(`echo ${b64} | base64 -d > ${REMOTE}`);
  if (r.code !== 0) throw new Error(`envoi du script hôte : ${r.out}`);
}

async function build(): Promise<string> {
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
  if (failures.length) throw new Error(`sondes en échec : ${failures.join(", ")}`);
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
