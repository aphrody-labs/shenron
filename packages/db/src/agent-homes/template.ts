// SPDX-License-Identifier: Apache-2.0
/**
 * The public agent home template of the repository (`templates/agent-home`), embedded as
 * `./template.generated.ts` (packages/db/scripts/agent-home-template.ts, `--check` in CI) and so
 * in the `bun build --compile` binaries (bot, `shenron-server`). The payload of
 * `shenron-server` also carries it as `home/` (scripts/build/server.ts), checked by the build's
 * private data guard. Runtime class: `bun`.
 */
import { TEMPLATE_DOCUMENTS } from "./template.generated";

export { templateProblems } from "./public-template";
import { AGENT_HOME_DOCUMENTS, type AgentHomeDocument, type AgentHomeTemplate } from "./types";

/** Revision of a set of documents: sha256 over the ordered names and contents. */
export function templateRevision(files: Record<AgentHomeDocument, string>): string {
  const hasher = new Bun.CryptoHasher("sha256");
  for (const name of AGENT_HOME_DOCUMENTS) {
    hasher.update(name);
    hasher.update("\0");
    hasher.update(files[name]);
    hasher.update("\0");
  }
  return hasher.digest("hex").slice(0, 16);
}

function template(files: Record<AgentHomeDocument, string>): AgentHomeTemplate {
  return { revision: templateRevision(files), files };
}

/** The embedded public template. */
export const SHENRON_AGENT_TEMPLATE: AgentHomeTemplate = template(TEMPLATE_DOCUMENTS);

/** A template read from a directory (the payload's `home/`); `null` when a document is missing. */
export async function readAgentTemplate(dir: string): Promise<AgentHomeTemplate | null> {
  const files = {} as Record<AgentHomeDocument, string>;
  for (const name of AGENT_HOME_DOCUMENTS) {
    const file = Bun.file(`${dir.replace(/[\\/]+$/, "")}/${name}`);
    if (!(await file.exists())) return null;
    files[name] = await file.text();
  }
  return template(files);
}
