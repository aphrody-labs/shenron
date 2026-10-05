// SPDX-License-Identifier: Apache-2.0
/**
 * Agent home of the chat (domain `dbfr`): the persona tone/brevity/vibe keys of SOUL.md and
 * IDENTITY.md (the only instructions a profile may add, `@shenron/pipeline/ai/prompts`
 * doctrine) and the display identity. Read from the VFS (`/home/*`, embedded binaries) or
 * from the live agent home directory (`~/.aphrody/workspaces/dbfr`). Its memory and
 * knowledge files reach the chat as retrieval sources (VFS corpus `home`), never as
 * instructions. Runtime class: `bun`.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parseFrontmatter } from "@shenron/pipeline/agent-home";
import type { HomePersona } from "@shenron/pipeline/ai/prompts";

export interface AgentHome {
  persona: HomePersona | null;
  name: string;
  emoji: string | null;
  source: "vfs" | "dir" | "none";
}

interface TextReader {
  exists(path: string): boolean;
  readTextSync(path: string): string;
}

function fromTexts(
  soul: string | null,
  identity: string | null,
  source: AgentHome["source"],
): AgentHome {
  const s = soul ? parseFrontmatter(soul) : {};
  const i = identity ? parseFrontmatter(identity) : {};
  const persona: HomePersona = { tone: s.tone, brevity: s.brevity, vibe: i.vibe };
  const has = [persona.tone, persona.brevity, persona.vibe].some((v) => v?.trim());
  return {
    persona: has ? persona : null,
    name: i.name?.trim() || s.identity?.trim() || "Shenron",
    emoji: i.emoji?.trim() || null,
    source: soul || identity ? source : "none",
  };
}

/** Agent home from a VFS (`/home/SOUL.md`, `/home/IDENTITY.md`). */
export function agentHomeFromVfs(vfs: TextReader): AgentHome {
  const read = (path: string) => (vfs.exists(path) ? vfs.readTextSync(path) : null);
  return fromTexts(read("/home/SOUL.md"), read("/home/IDENTITY.md"), "vfs");
}

/** Agent home from a directory (live agent home). */
export function agentHomeFromDir(dir: string): AgentHome {
  const read = (name: string) => {
    const path = join(dir, name);
    return existsSync(path) ? readFileSync(path, "utf8") : null;
  };
  return fromTexts(read("SOUL.md"), read("IDENTITY.md"), "dir");
}
