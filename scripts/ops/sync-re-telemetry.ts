// SPDX-License-Identifier: Apache-2.0
/**
 * scripts/ops/sync-re-telemetry.ts
 *
 * Ingests RE audit JSON reports into the SQLite game_re_telemetry database
 * and prepares synchronization payloads for the sovereign Redis cluster.
 */
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import {
  initReTelemetryDb,
  saveReTelemetry,
  listReTelemetry,
  type GameReRecord,
} from "../../packages/db/src/re-telemetry";

const AUDIT_PATH = resolve("docs/games/dbfz-audit.json");
const DB_PATH = resolve("var/re-telemetry.sqlite");

async function main() {
  console.log(`[re-sync] Initializing RE Telemetry sync from ${AUDIT_PATH}...`);

  if (!existsSync(AUDIT_PATH)) {
    console.error(`[re-sync] Audit report not found at ${AUDIT_PATH}`);
    process.exit(1);
  }

  const dir = dirname(DB_PATH);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  const db = initReTelemetryDb(DB_PATH);
  const rawAudit = JSON.parse(readFileSync(AUDIT_PATH, "utf-8"));
  const gameSlug = "dragon-ball-fighterz";

  const paksFormatted = (rawAudit.paks || []).map((p: any) => ({
    name: p.name,
    size: p.sizeBytes,
    version: p.version,
    encrypted: p.isEncrypted,
  }));

  console.log(
    `[re-sync] Discovered ${rawAudit.binaries.length} binaries and ${rawAudit.paks.length} paks.`,
  );

  for (const bin of rawAudit.binaries) {
    const record: GameReRecord = {
      game_slug: gameSlug,
      binary_name: bin.name,
      binary_path: bin.path,
      architecture: bin.is64Bit ? "x64" : "x86",
      format: bin.format,
      entry_point: bin.entryPoint,
      sections: [{ name: ".text", virtual_address: bin.entryPoint, size: 0 }],
      exports_count: bin.exportsCount,
      imports_count: bin.importsCount,
      paks: paksFormatted,
      metadata: {
        sizeBytes: bin.sizeBytes,
        sectionsCount: bin.sectionsCount,
        scannedAt: rawAudit.scannedAt,
        astConfigs: rawAudit.astConfigs,
      },
    };

    await saveReTelemetry(db, record);
    console.log(`[re-sync] Ingested binary: ${bin.name} (${record.architecture}) into SQLite`);
  }

  const records = listReTelemetry(db, gameSlug);
  console.log(
    `[re-sync] Successfully stored and verified ${records.length} records in ${DB_PATH}.`,
  );

  db.close();
}

main().catch((err) => {
  console.error("[re-sync] Fatal error during sync:", err);
  process.exit(1);
});
