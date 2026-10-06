// SPDX-License-Identifier: Apache-2.0
/**
 * The public agent home template (`templates/agent-home`, embedded by
 * packages/db/scripts/agent-home-template.ts) and the guard that keeps a private or filled-in
 * home out of any public artifact (`shenron-server` payload, plugin archive). No hashing, no
 * file system: readable from any runtime. Runtime class: `pure`.
 */
import { TEMPLATE_DOCUMENTS } from "./template.generated";
import { AGENT_HOME_DOCUMENTS, type AgentHomeDocument } from "./types";

/** The seven documents of the public template, `USER.md` with every user field empty. */
export const PUBLIC_TEMPLATE_DOCUMENTS: Readonly<Record<AgentHomeDocument, string>> =
  TEMPLATE_DOCUMENTS;

/**
 * Problems that keep a template out of a public artifact: a missing document, a private file
 * (`MEMORY.md`, `memory/`, a database), or a filled-in `USER.md` (a template carries no user).
 */
export function templateProblems(
  files: Partial<Record<string, string>>,
  extraEntries: readonly string[] = [],
): string[] {
  const problems: string[] = [];
  for (const name of AGENT_HOME_DOCUMENTS)
    if (!files[name]?.trim()) problems.push(`missing ${name}`);
  for (const entry of extraEntries)
    if (/(?:^|\/)(?:MEMORY\.md|memory|\.aphrody)(?:\/|$)|\.(?:sqlite|db|env)$/i.test(entry))
      problems.push(`private entry ${entry}`);
  const userMd = files["USER.md"] ?? "";
  for (const key of [
    "agent_id",
    "address_as",
    "timezone",
    "avatar",
    "updated_at",
    "template_revision",
  ]) {
    const value = new RegExp(`^${key}:\\s*(.*)$`, "m").exec(userMd)?.[1]?.trim() ?? "";
    if (value && value !== '""' && value !== "''") problems.push(`USER.md ${key} is filled in`);
  }
  if (/^preferences:\s*(?:\n\s+- |\[\s*[^\]\s])/m.test(userMd))
    problems.push("USER.md preferences are filled in");
  return problems;
}
