// SPDX-License-Identifier: Apache-2.0
// SessionStart hook: hands the session the open work (docs/reference/root/REPRISE.md), the Git state and
// the full-yolo rule, so a cloud or local session resumes the plan and goals without being told.
import { existsSync } from "node:fs";
import { join } from "node:path";

const root = process.env.CLAUDE_PROJECT_DIR ?? process.cwd();
const reprisePath = join(root, "docs/reference/root/REPRISE.md");
const memoryPath = join(root, "data/home/MEMORY.md");
const reprise = existsSync(reprisePath)
  ? await Bun.file(reprisePath).text()
  : "(REPRISE.md absent)";
const memory = existsSync(memoryPath)
  ? await Bun.file(memoryPath).text()
  : "(aucune mémoire privée : data/home/MEMORY.md absent)";

async function git(...args: string[]): Promise<string> {
  const proc = Bun.spawn(["git", "-c", "safe.directory=*", ...args], {
    cwd: root,
    stdout: "pipe",
    stderr: "ignore",
  });
  const out = await new Response(proc.stdout).text();
  await proc.exited;
  return out.trim();
}

const [branch, head, dirty] = await Promise.all([
  git("rev-parse", "--abbrev-ref", "HEAD"),
  git("log", "--oneline", "-5"),
  git("status", "--short"),
]);
const remote = process.env.CLAUDE_CODE_REMOTE === "true";
const ssh = Bun.spawnSync(["ssh", "-o", "BatchMode=yes", "-o", "ConnectTimeout=5", "vps", "true"], {
  stdout: "ignore",
  stderr: "ignore",
});

const context = [
  `[shenron] session ${remote ? "cloud" : "locale"} : mode full yolo, aucun humain dans la boucle.`,
  "Reprends sans demander les chantiers ouverts ci-dessous, de bout en bout : code, gates, commit, push sur main, puis production par SSH (`bun scripts/ops/release.ts`, tout build sur le vps, sondes, ENV/restarts via `aphrody-infra ssh exec --host vps|dbfr`).",
  `SSH production (alias vps) : ${ssh.exitCode === 0 ? "joignable" : "indisponible (voir docs/operations/CLOUD-SESSION.md)"}.`,
  `Branche ${branch}. Derniers commits :\n${head}`,
  dirty
    ? `Arbre non propre (travail d'autres agents possible, ne pas y toucher) :\n${dirty.split("\n").slice(0, 12).join("\n")}`
    : "Arbre propre.",
  "--- REPRISE ---",
  reprise,
  "--- MÉMOIRE PRIVÉE ---",
  memory,
].join("\n");

console.log(
  JSON.stringify({
    hookSpecificOutput: { hookEventName: "SessionStart", additionalContext: context },
  }),
);
