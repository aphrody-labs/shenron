#!/usr/bin/env bun
// SPDX-License-Identifier: Apache-2.0
/**
 * sync-neon-to-sqlite.ts — reverse-sync PostgreSQL `bot.*` → réplica SQLite du bot.
 *
 * Rafraîchit les tables `WIKI_EDITORIAL` (`_wiki-editorial.ts`) du SQLite du bot
 * depuis PostgreSQL, source éditoriale : remplacement complet de chaque table
 * (lignes masquées comprises, `visible = 0`), intersection des colonnes des deux
 * côtés, une transaction courte par table. PostgreSQL n'est lu qu'en lecture seule.
 * Logique et contrat : `src/db/replica-sync.ts`. Seul script exempté de la garde
 * `src/db/wiki-write-guard.ts` (exemption nommée, sans ALLOW_SQLITE_WIKI_WRITE).
 *
 * Usage (depuis apps/bot, dépôt ou release) :
 *   bun scripts/sync-neon-to-sqlite.ts [--dry-run] [--tables a,b] [--allow-empty]
 * Environnement : DATABASE_URL (ou SHENRON_PG_ENV, ~/.shenron-neon.env) et
 * DATABASE_PATH (défaut : data/bot.db du bot). Rapport JSON sur stdout.
 */
// oxlint-disable-next-line import/no-unassigned-import -- garde à effet de bord, en tête
import "../src/db/wiki-write-guard";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { createBunSql } from "@aphrody/shenron-db/bun-sql";
import { resolveBotDatabaseUrl } from "../src/db/pg-url";
import {
  createPgReplicaSource,
  openReplica,
  parseSyncArgs,
  SYNC_USAGE,
  syncReplica,
} from "../src/db/replica-sync";
import { WIKI_VISIBILITY_TABLES } from "../src/db/wiki-visibility";
import { WIKI_EDITORIAL } from "./_wiki-editorial";

const APPLICATION_NAME = "shenron-replica-sync";

function emit(report: object): void {
  console.log(JSON.stringify(report, null, process.stdout.isTTY ? 2 : undefined));
}

/** Message d'erreur sans URL PostgreSQL (elle porte le mot de passe). */
function redact(message: string, url: string | null): string {
  const scrubbed = url ? message.split(url).join("<DATABASE_URL>") : message;
  return scrubbed.replace(/postgres(?:ql)?:\/\/\S+/gi, "<DATABASE_URL>");
}

const args = parseSyncArgs(process.argv.slice(2), WIKI_EDITORIAL);
if (args.kind === "help") {
  console.log(SYNC_USAGE);
  process.exit(0);
}
if (args.kind === "error") {
  console.error(`✗ ${args.message}\n\n${SYNC_USAGE}`);
  process.exit(2);
}

// La liste éditoriale doit couvrir toutes les tables dont PostgreSQL porte la visibilité.
const uncovered = WIKI_VISIBILITY_TABLES.filter(
  (t) => !(WIKI_EDITORIAL as readonly string[]).includes(t),
);
const replicaPath = Bun.env.DATABASE_PATH?.trim()
  ? resolve(Bun.env.DATABASE_PATH.trim())
  : join(import.meta.dir, "../data/bot.db");
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
  process.exit(1);
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
process.exit(exitCode);
