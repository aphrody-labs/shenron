// SPDX-License-Identifier: Apache-2.0
/** Canonical wiki replica CLI shared by the source script and compiled bot. */
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { SQL } from "bun";
import { createBunSql } from "@aphrody/shenron-db/bun-sql";
import { resolveBotDatabaseUrl } from "./pg-url";
import {
  createPgReplicaSource,
  openReplica,
  parseSyncArgs,
  SYNC_USAGE,
  syncReplica,
} from "./replica-sync";
import { WIKI_VISIBILITY_TABLES } from "./wiki-visibility";
import { WIKI_EDITORIAL } from "../../scripts/_wiki-editorial";
import { readPublicMangaSnapshot, syncMangaSnapshot } from "./manga-search-replica";

const APPLICATION_NAME = "shenron-replica-sync";

function emit(report: object): void {
  console.log(JSON.stringify(report, null, process.stdout.isTTY ? 2 : undefined));
}

/** Message d'erreur sans URL PostgreSQL (elle porte le mot de passe). */
function redact(message: string, url: string | null): string {
  const scrubbed = url ? message.split(url).join("<DATABASE_URL>") : message;
  return scrubbed.replace(/postgres(?:ql)?:\/\/\S+/gi, "<DATABASE_URL>");
}

export async function runReplicaSync(argv: readonly string[]): Promise<number> {
  if (argv.includes("--manga-search")) return runMangaSearchReplica(argv);
  const args = parseSyncArgs(argv, WIKI_EDITORIAL);
  if (args.kind === "help") {
    console.log(SYNC_USAGE);
    return 0;
  }
  if (args.kind === "error") {
    console.error(`✗ ${args.message}\n\n${SYNC_USAGE}`);
    return 2;
  }

  // La liste éditoriale doit couvrir toutes les tables dont PostgreSQL porte la visibilité.
  const uncovered = WIKI_VISIBILITY_TABLES.filter(
    (t) => !(WIKI_EDITORIAL as readonly string[]).includes(t),
  );
  const replicaPath = Bun.env.DATABASE_PATH?.trim()
    ? resolve(Bun.env.DATABASE_PATH.trim())
    : join(import.meta.dir, "../../data/bot.db");
  const url = resolveBotDatabaseUrl(process.env);

  const failure = uncovered.length
    ? `WIKI_EDITORIAL ne couvre pas ${uncovered.join(", ")}`
    : !url
      ? "aucune URL PostgreSQL (DATABASE_URL, SHENRON_PG_ENV ou ~/.shenron-neon.env)"
      : !existsSync(replicaPath)
        ? `réplica introuvable : ${replicaPath} (DATABASE_PATH)`
        : null;
  if (failure) {
    emit({ ok: false, dryRun: args.dryRun, replica: replicaPath, error: failure });
    return 1;
  }

  const sql = createBunSql({ url: url!, applicationName: APPLICATION_NAME, max: 1 });
  let exitCode = 1;
  try {
    const sqlite = openReplica(replicaPath, { readonly: args.dryRun });
    try {
      const report = await syncReplica({
        sqlite,
        source: createPgReplicaSource(sql),
        tables: args.tables,
        dryRun: args.dryRun,
        allowEmpty: args.allowEmpty,
      });
      emit({ replica: replicaPath, ...report });
      exitCode = report.ok ? 0 : 1;
    } finally {
      sqlite.close();
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    emit({ ok: false, dryRun: args.dryRun, replica: replicaPath, error: redact(message, url) });
  } finally {
    await sql.close({ timeout: 5 }).catch(() => {});
  }
  return exitCode;
}

/** Specialized public-page owner: never route manga pages through generic DELETE/INSERT replication. */
async function runMangaSearchReplica(argv: readonly string[]): Promise<number> {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(
      "Usage: shenron-bot --replica-sync --manga-search [--dry-run | --apply]\nDefault: read-only. A complete public PostgreSQL snapshot determines atomic transcript/FTS deltas.",
    );
    return 0;
  }
  if (
    argv.some((arg) => !["--manga-search", "--dry-run", "--apply"].includes(arg)) ||
    (argv.includes("--dry-run") && argv.includes("--apply"))
  ) {
    emit({
      ok: false,
      error: "Manga search requires --manga-search with only --dry-run or --apply",
    });
    return 2;
  }
  const dryRun = !argv.includes("--apply");
  const replica = Bun.env.DATABASE_PATH?.trim()
    ? resolve(Bun.env.DATABASE_PATH.trim())
    : join(import.meta.dir, "../../data/bot.db");
  const url = resolveBotDatabaseUrl(process.env);
  if (!url || !existsSync(replica)) {
    emit({
      ok: false,
      dryRun,
      error: "Explicit PostgreSQL configuration and existing SQLite replica required",
    });
    return 1;
  }
  const sql = new SQL(url);
  try {
    const snapshot = await readPublicMangaSnapshot(sql);
    const sqlite = openReplica(replica, { readonly: dryRun });
    try {
      const result = dryRun
        ? { sourcePages: snapshot.expectedCount, completePublicSnapshot: true }
        : syncMangaSnapshot(sqlite, snapshot.rows, snapshot.expectedCount);
      emit({ ok: true, dryRun, replica, mangaSearch: result });
      return 0;
    } finally {
      sqlite.close();
    }
  } catch (error) {
    emit({
      ok: false,
      dryRun,
      error: redact(error instanceof Error ? error.message : String(error), url),
    });
    return 1;
  } finally {
    await sql.close().catch(() => {});
  }
}
