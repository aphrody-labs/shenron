// SPDX-License-Identifier: Apache-2.0
import { Database } from "bun:sqlite";

type CheckKind = "page" | "asset" | "embed";

/** One interrupted audit keeps its observations; failed checks are retried on resume. */
export function openReaderAuditCheckpoint(path: string, origin: string, resume: boolean) {
  const db = new Database(path, { create: true });
  try {
    db.exec(`
      PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS audit_runs (
        sequence INTEGER PRIMARY KEY, id TEXT NOT NULL UNIQUE,
        origin TEXT NOT NULL, started_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS audit_checks (
        run_id TEXT NOT NULL, kind TEXT NOT NULL, url TEXT NOT NULL,
        success INTEGER NOT NULL, checked_at TEXT NOT NULL,
        PRIMARY KEY (run_id, kind, url)
      );
    `);
    const previous = resume
      ? db
          .query<{ id: string; origin: string; started_at: string }, []>(
            "SELECT id, origin, started_at FROM audit_runs ORDER BY sequence DESC LIMIT 1",
          )
          .get()
      : null;
    if (resume && (!previous || previous.origin !== origin))
      throw new Error("No reader audit with this origin is available to resume");
    const runId = previous?.id ?? crypto.randomUUID();
    const startedAt = previous?.started_at ?? new Date().toISOString();
    if (!previous)
      db.query("INSERT INTO audit_runs(id, origin, started_at) VALUES (?, ?, ?)").run(
        runId,
        origin,
        startedAt,
      );
    const lookup = db.query<{ success: number }, [string, CheckKind, string]>(
      "SELECT success FROM audit_checks WHERE run_id = ? AND kind = ? AND url = ?",
    );
    const write = db.query(
      `INSERT INTO audit_checks(run_id, kind, url, success, checked_at) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(run_id, kind, url) DO UPDATE SET
         success = excluded.success, checked_at = excluded.checked_at`,
    );
    return {
      runId,
      startedAt,
      has(kind: CheckKind, url: string) {
        return lookup.get(runId, kind, url)?.success === 1;
      },
      record(kind: CheckKind, url: string, success: boolean) {
        write.run(runId, kind, url, Number(success), new Date().toISOString());
      },
      [Symbol.dispose]() {
        db.close();
      },
    };
  } catch (error) {
    db.close();
    throw error;
  }
}
