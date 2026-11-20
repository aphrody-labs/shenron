/* oxlint-disable unicorn/no-array-sort -- behavior-preserving legacy pattern, reviewed */
// SPDX-License-Identifier: Apache-2.0
/** Bun-native support for the orchestrator: content fingerprints (Bun.Glob + CryptoHasher) and run history (bun:sqlite). */
import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type { PipelineState, Stage } from "./orchestrator";

/** Hash of every file matching the stage's input globs (path + content), stable across runs. */
export async function stageFingerprint(stage: Stage, cwd: string): Promise<string | null> {
  if (!stage.inputs || stage.inputs.length === 0) return null;
  const paths = new Set<string>();
  for (const pattern of stage.inputs)
    for await (const path of new Bun.Glob(pattern).scan({ cwd, onlyFiles: true }))
      paths.add(path.replaceAll("\\", "/"));
  const hasher = new Bun.CryptoHasher("sha256");
  hasher.update(JSON.stringify(stage.argv));
  for (const path of [...paths].sort()) {
    hasher.update(path);
    hasher.update(await Bun.file(`${cwd}/${path}`).bytes());
  }
  return hasher.digest("hex");
}

export interface HistoryRow {
  run_id: string;
  stage: string;
  status: string;
  attempts: number;
  duration_ms: number;
  fingerprint: string | null;
  recorded_at: string;
}

export function openHistory(file: string): Database {
  mkdirSync(dirname(file), { recursive: true });
  const db = new Database(file, { create: true });
  db.run(`CREATE TABLE IF NOT EXISTS stage_runs (
    run_id TEXT NOT NULL, stage TEXT NOT NULL, status TEXT NOT NULL, attempts INTEGER NOT NULL,
    duration_ms INTEGER NOT NULL, fingerprint TEXT, recorded_at TEXT NOT NULL,
    PRIMARY KEY (run_id, stage))`);
  return db;
}

export function recordRun(file: string, state: PipelineState): void {
  const db = openHistory(file);
  try {
    const insert = db.prepare(
      "INSERT OR REPLACE INTO stage_runs VALUES ($run, $stage, $status, $attempts, $duration, $fingerprint, $at)",
    );
    db.transaction(() => {
      for (const [stage, record] of Object.entries(state.stages))
        insert.run({
          $run: state.runId,
          $stage: stage,
          $status: record.status,
          $attempts: record.attempts,
          $duration: record.durationMs,
          $fingerprint: record.fingerprint ?? null,
          $at: record.startedAt ?? new Date().toISOString(),
        });
    })();
  } finally {
    db.close(true);
  }
}

/** Fingerprint of the latest successful run of a stage, for cache hits across runs. */
export function lastOkFingerprint(file: string, stage: string): string | null {
  const db = openHistory(file);
  try {
    const row = db
      .query<{ fingerprint: string | null }, [string]>(
        "SELECT fingerprint FROM stage_runs WHERE stage = ? AND status IN ('ok','cached') ORDER BY recorded_at DESC LIMIT 1",
      )
      .get(stage);
    return row?.fingerprint ?? null;
  } finally {
    db.close(true);
  }
}

export function recentRuns(file: string, limit = 20): HistoryRow[] {
  const db = openHistory(file);
  try {
    return db
      .query<HistoryRow, [number]>("SELECT * FROM stage_runs ORDER BY recorded_at DESC LIMIT ?")
      .all(limit);
  } finally {
    db.close(true);
  }
}
