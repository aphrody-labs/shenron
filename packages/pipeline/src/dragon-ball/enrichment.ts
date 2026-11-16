// SPDX-License-Identifier: Apache-2.0
/** Shenron owns editorial deposits; Aphrody owns acquisition and parsing. */
import { rename } from "node:fs/promises";
import { join, resolve } from "node:path";
import postgres from "postgres";
import { createDatabooksFreezeGate } from "@shenron/db/guards";
import { enrichCatalogue, validateCatalogue, type DragonBallCatalogue } from "./catalogue";
import { DATABOOK_ISBNS } from "./edition-metadata";

export interface CatalogueDepositOptions {
  cataloguePath: string;
  /** Explicit derivative output; native crawl evidence is left intact. */
  outputPath?: string;
  assetsIndexPath?: string;
  sqlitePath?: string;
  databaseUrl?: string;
  apply?: boolean;
  freezeFile?: string;
  production?: boolean;
  /** Domain persistence port, including the existing edition ISBN updates. */
  deposit?: (catalogue: DragonBallCatalogue) => Promise<number>;
}

export interface CatalogueDepositResult {
  status: "planned" | "deposited";
  catalogue: DragonBallCatalogue;
  updated: number;
}

async function writeJson(path: string, value: unknown): Promise<void> {
  const temporary = `${path}.${crypto.randomUUID()}.tmp`;
  await Bun.write(temporary, `${JSON.stringify(value, null, 2)}\n`);
  await rename(temporary, path);
}

async function depositPostgres(
  catalogue: DragonBallCatalogue,
  databaseUrl: string,
): Promise<number> {
  const sql = postgres(databaseUrl, { max: 2 });
  try {
    return await sql.begin(async (transaction) => {
      for (const [id, isbn] of DATABOOK_ISBNS) {
        // eslint-disable-next-line no-await-in-loop -- one transaction preserves the editorial batch.
        await transaction`UPDATE bot.db_databooks SET isbn=${isbn} WHERE id=${id}`;
      }
      let updated = 0;
      for (const collection of catalogue.collections) {
        for (const volume of collection.ouvrages) {
          // eslint-disable-next-line no-await-in-loop -- each result contributes to this transaction's evidence.
          const result = await transaction`
            UPDATE bot.dragonballcn_volumes
            SET cover_url=COALESCE(${volume.couverture ?? null},cover_url),
                isbn=COALESCE(${volume.isbn ?? null},isbn),
                date=COALESCE(${volume.parution ?? volume.date_affichee ?? null},date),
                updated_at=${Math.floor(Date.now() / 1000)}
            WHERE did=${volume.did}`;
          updated += result.count;
        }
      }
      return updated;
    });
  } finally {
    await sql.end();
  }
}

/** Dry runs inspect the proposed catalogue without connecting to editorial databases. */
export async function enrichDragonBallCatalogue(
  options: CatalogueDepositOptions,
): Promise<CatalogueDepositResult> {
  const catalogue = enrichCatalogue(await Bun.file(options.cataloguePath).json());
  if (!options.apply) return { status: "planned", catalogue, updated: 0 };
  const production = options.production ?? process.env.NODE_ENV === "production";
  createDatabooksFreezeGate({
    freezeFile:
      options.freezeFile ??
      process.env.DATABOOKS_FREEZE_FILE ??
      (production ? null : join(import.meta.dir, "../../../..", ".coord/FREEZE-databooks.json")),
    production,
  }).assertWritable();
  if (!options.outputPath)
    throw new Error("Editorial deposition requires an explicit derivative output path");
  if (resolve(options.outputPath) === resolve(options.cataloguePath))
    throw new Error("Editorial output must preserve the native source snapshot");
  const databaseUrl = options.databaseUrl ?? process.env.DATABASE_URL?.trim();
  if (!options.deposit && !databaseUrl)
    throw new Error("DATABASE_URL is required for editorial deposition");
  const updated = await (options.deposit ?? ((value) => depositPostgres(value, databaseUrl!)))(
    catalogue,
  );
  await writeJson(options.outputPath, catalogue);
  if (options.assetsIndexPath) {
    const index = validateCatalogue(await Bun.file(options.assetsIndexPath).json());
    for (const collection of index.collections) {
      const source = catalogue.collections.find((item) => item.slug === collection.slug);
      for (const volume of collection.ouvrages) {
        const metadata = source?.ouvrages.find((item) => item.did === volume.did);
        if (metadata) {
          volume.couverture ??= metadata.couverture;
          volume.isbn ??= metadata.isbn;
          volume.premiere_edition ??= metadata.parution;
        }
      }
    }
    index.totaux = catalogue.totaux;
    await writeJson(options.assetsIndexPath, index);
  }
  if (options.sqlitePath) {
    const { Database } = await import("bun:sqlite");
    using replica = new Database(options.sqlitePath, { create: false });
    const update = replica.prepare(
      "UPDATE dragonballcn_volumes SET cover_url=COALESCE(?,cover_url),isbn=COALESCE(?,isbn),date=COALESCE(?,date) WHERE did=?",
    );
    replica.transaction(() => {
      for (const collection of catalogue.collections)
        for (const volume of collection.ouvrages)
          update.run(
            volume.couverture ?? null,
            volume.isbn ?? null,
            volume.parution ?? volume.date_affichee ?? null,
            volume.did,
          );
    })();
  }
  return { status: "deposited", catalogue, updated };
}
