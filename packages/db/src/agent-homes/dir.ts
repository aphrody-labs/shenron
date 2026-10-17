// SPDX-License-Identifier: Apache-2.0
/**
 * Agent homes as directories, the native layout of `aphrody-agent-home` (what `aphrody home`
 * and its `AgentHome::open` read): `<root>/<dir>/` holds the seven documents, `memory/`,
 * `skills/` and `.aphrody/workspace-state.json` (schema v1; `setup_completed_at` set, since the
 * instance is personalised at creation and needs no BOOTSTRAP ritual). `<dir>` is the
 * sanitised id (`discord-<user_id>`, `local`). The user's fields, `updated_at` and the
 * template revision live in the `USER.md` frontmatter. Writes go through a temporary file and
 * a rename. Runtime class: `bun`.
 */
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";

import {
  AGENT_HOME_DOCUMENTS,
  type AgentHomeDocument,
  type AgentHomePutResult,
  type AgentHomeSnapshot,
  type AgentHomeStore,
  agentHomeDirName,
  checkAgentHome,
  isAgentHomeId,
  newerHome,
  parseFrontmatterBlock,
  readUpdatedAt,
  readUserProfile,
  splitFrontmatter,
} from "./types";

/** `aphrody-agent-home` WORKSPACE_STATE_DIRNAME / WORKSPACE_STATE_FILENAME / version. */
export const WORKSPACE_STATE = { dir: ".aphrody", file: "workspace-state.json", version: 1 };

export class DirAgentHomeStore implements AgentHomeStore {
  constructor(readonly root: string) {}

  /** Directory of one home (whether or not it exists). */
  dirOf(agentId: string): string {
    if (!isAgentHomeId(agentId)) throw new Error(`invalid agent home id: ${agentId}`);
    return join(this.root, agentHomeDirName(agentId));
  }

  readSync(agentId: string): AgentHomeSnapshot | null {
    const dir = this.dirOf(agentId);
    const files = {} as Record<AgentHomeDocument, string>;
    for (const name of AGENT_HOME_DOCUMENTS) {
      const path = join(dir, name);
      if (!existsSync(path)) return null;
      files[name] = readFileSync(path, "utf8");
    }
    const { fm } = splitFrontmatter(files["USER.md"]);
    const revision = fm ? parseFrontmatterBlock(fm).get("template_revision") : undefined;
    let createdAt: string | undefined;
    try {
      const state = JSON.parse(
        readFileSync(join(dir, WORKSPACE_STATE.dir, WORKSPACE_STATE.file), "utf8"),
      ) as { setup_completed_at?: string };
      createdAt = state.setup_completed_at;
    } catch {
      // a home edited by hand may lack its state file
    }
    const updatedAt =
      readUpdatedAt(files["USER.md"]) ?? statSync(join(dir, "USER.md")).mtime.toISOString();
    return {
      agentId,
      profile: readUserProfile(files["USER.md"], agentId),
      files,
      templateRevision: typeof revision === "string" ? revision : "",
      createdAt: createdAt ?? updatedAt,
      updatedAt,
    };
  }

  async get(agentId: string): Promise<AgentHomeSnapshot | null> {
    return this.readSync(agentId);
  }

  writeSync(home: AgentHomeSnapshot): AgentHomePutResult {
    checkAgentHome(home);
    const current = this.readSync(home.agentId);
    if (current && !newerHome(home, current)) return "stale";
    const dir = this.dirOf(home.agentId);
    for (const sub of ["memory", "skills", WORKSPACE_STATE.dir])
      mkdirSync(join(dir, sub), { recursive: true });
    for (const name of AGENT_HOME_DOCUMENTS) writeAtomicSync(join(dir, name), home.files[name]);
    const statePath = join(dir, WORKSPACE_STATE.dir, WORKSPACE_STATE.file);
    let state: Record<string, unknown> = { version: WORKSPACE_STATE.version, cache: [] };
    try {
      state = { ...state, ...JSON.parse(readFileSync(statePath, "utf8")) };
    } catch {
      // new home
    }
    state.setup_completed_at ??= home.createdAt;
    writeAtomicSync(statePath, `${JSON.stringify(state, null, 2)}\n`);
    return "accepted";
  }

  async put(home: AgentHomeSnapshot): Promise<AgentHomePutResult> {
    return this.writeSync(home);
  }

  /**
   * Move a home to another id (the `local` → `discord:<user_id>` conversion): the directory
   * moves with its memory, skills and state when the target does not exist yet.
   * Returns `false` when the target exists (the caller converges the two snapshots).
   */
  moveSync(from: string, to: string): boolean {
    const source = this.dirOf(from);
    const target = this.dirOf(to);
    if (!existsSync(source) || existsSync(target)) return false;
    mkdirSync(this.root, { recursive: true });
    renameWithRetry(source, target);
    return true;
  }

  removeSync(agentId: string): void {
    rmSync(this.dirOf(agentId), { recursive: true, force: true });
  }
}

/** Rename, retrying the transient EPERM/EBUSY/EACCES a Windows scanner or indexer causes on a fresh directory. */
function renameWithRetry(from: string, to: string): void {
  for (let attempt = 0; ; attempt++) {
    try {
      renameSync(from, to);
      return;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (attempt >= 20 || (code !== "EPERM" && code !== "EBUSY" && code !== "EACCES")) throw error;
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 25 * (attempt + 1));
    }
  }
}

/** Write through a temporary file and a rename (no half-written document on a crash). */
export function writeAtomicSync(path: string, text: string): void {
  const tmp = `${path}.${process.pid}.tmp`;
  writeFileSync(tmp, text);
  renameWithRetry(tmp, path);
}
