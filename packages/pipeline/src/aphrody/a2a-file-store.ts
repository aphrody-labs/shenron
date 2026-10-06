// SPDX-License-Identifier: Apache-2.0
/**
 * Durable A2A store of the Shenron hub on the local file system, used when Aphrody's coord API
 * (`APHRODY_A2A_COORD_API`, see `a2a-remote.ts`) is not configured.
 *
 * Directory: `SHENRON_A2A_STORE_DIR`, else, in production, `<A2A_COORD_DIR>/shenron-dragonball`
 * (the site and the bot share `A2A_COORD_DIR`). Otherwise the store is off and the hub stays in
 * memory: development and tests write no file unless they name the directory.
 *
 * Layout: one `tasks/<id>.json` per task (written to a temporary file then renamed, so a reader
 * never sees half a task) and `envelopes.jsonl` (one envelope per appended line). Several processes
 * may share the directory: the newest `updatedAt` of a task wins.
 */

import { appendFile, mkdir, readdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import type { A2AEnvelope, A2ATarget, A2ATask } from "./a2a";

const AGENT = "shenron-dragonball";
const TASK_ID = /^[A-Za-z0-9._-]{1,128}$/;
/** Tasks read by a listing, newest files first. */
const MAX_LISTED_TASKS = 500;

/** The store directory, or `null` when the file store is off. Read per call. */
export function fileStoreDir(source?: NodeJS.ProcessEnv): string | null {
  const env = source ?? process.env;
  const explicit = env.SHENRON_A2A_STORE_DIR?.trim();
  if (explicit) return explicit;
  const coord = env.NODE_ENV === "production" ? env.A2A_COORD_DIR?.trim() : undefined;
  return coord ? path.join(coord, AGENT) : null;
}

export function fileStoreEnabled(): boolean {
  return fileStoreDir() !== null;
}

function requireDir(): string {
  const dir = fileStoreDir();
  if (!dir)
    throw new Error("SHENRON_A2A_STORE_DIR or A2A_COORD_DIR is required for the file store");
  return dir;
}

function taskPath(dir: string, id: string): string {
  if (!TASK_ID.test(id)) throw new Error(`invalid A2A task id: ${JSON.stringify(id)}`);
  return path.join(dir, "tasks", `${id}.json`);
}

function isTask(value: unknown): value is A2ATask {
  return (
    !!value &&
    typeof value === "object" &&
    typeof (value as A2ATask).id === "string" &&
    typeof (value as A2ATask).updatedAt === "string"
  );
}

async function readTask(file: string): Promise<A2ATask | undefined> {
  try {
    const parsed: unknown = JSON.parse(await readFile(file, "utf8"));
    return isTask(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

export async function putFileTask(task: A2ATask): Promise<void> {
  const dir = requireDir();
  const file = taskPath(dir, task.id);
  const current = await readTask(file);
  if (current && current.updatedAt > task.updatedAt) return;
  await mkdir(path.dirname(file), { recursive: true });
  const temp = `${file}.${process.pid}.${Date.now().toString(36)}.tmp`;
  await writeFile(temp, JSON.stringify(task), { mode: 0o640 });
  await rename(temp, file);
}

export async function getFileTask(taskId: string): Promise<A2ATask | undefined> {
  if (!TASK_ID.test(taskId)) return undefined;
  return readTask(taskPath(requireDir(), taskId));
}

export async function listFileTasks(target?: A2ATarget): Promise<A2ATask[]> {
  const dir = path.join(requireDir(), "tasks");
  let names: string[];
  try {
    names = (await readdir(dir)).filter((name) => name.endsWith(".json"));
  } catch {
    return [];
  }
  // Ids start with `task-<epoch ms>`: a reverse sort reads the newest first.
  const ordered = names.toSorted().reverse();
  const tasks: A2ATask[] = [];
  for (const name of ordered.slice(0, MAX_LISTED_TASKS)) {
    const task = await readTask(path.join(dir, name));
    if (task && (!target || task.target === target)) tasks.push(task);
  }
  return tasks.toSorted((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function appendFileEnvelope(envelope: A2AEnvelope): Promise<void> {
  const dir = requireDir();
  await mkdir(dir, { recursive: true });
  await appendFile(path.join(dir, "envelopes.jsonl"), `${JSON.stringify(envelope)}\n`, {
    mode: 0o640,
  });
}

export async function listFileEnvelopes(limit = 100): Promise<A2AEnvelope[]> {
  const safeLimit = Math.max(1, Math.min(5000, Math.trunc(limit)));
  let text: string;
  try {
    text = await readFile(path.join(requireDir(), "envelopes.jsonl"), "utf8");
  } catch {
    return [];
  }
  const envelopes: A2AEnvelope[] = [];
  const lines = text.split("\n");
  for (let i = lines.length - 1; i >= 0 && envelopes.length < safeLimit; i--) {
    const line = lines[i]!.trim();
    if (!line) continue;
    try {
      const parsed = JSON.parse(line) as A2AEnvelope;
      if (parsed && typeof parsed.id === "string") envelopes.push(parsed);
    } catch {
      // A torn or foreign line is skipped, never fatal.
    }
  }
  return envelopes;
}
