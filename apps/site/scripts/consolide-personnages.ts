#!/usr/bin/env bun
/** Conservative character consolidation. Simulation is the default. */
import postgres from "postgres";
import {
  CHARACTER_MERGES,
  type CharacterIdentity,
  validateCharacterMerge,
} from "../src/lib/character-consolidation";
import {
  planVariantConsolidation,
  type ConsolidationVariant,
} from "../src/lib/character-variant-consolidation";

const APPLY = process.argv.includes("--appliquer");
const revisionId = () => crypto.randomUUID().replaceAll("-", "").slice(0, 24);
const JSON_FIELDS = new Set([
  "highlights",
  "transformation_ids",
  "technique_ids",
  "key_episodes",
  "evidence",
]);

async function databaseUrl(): Promise<string> {
  if (process.env.DATABASE_URL?.trim()) return process.env.DATABASE_URL.trim();
  const env = await Bun.file(`${import.meta.dir}/../.env`)
    .text()
    .catch(() => "");
  const value = env
    .split("\n")
    .findLast((line) => line.startsWith("DATABASE_URL="))
    ?.slice("DATABASE_URL=".length)
    .trim()
    .replace(/^["']|["']$/g, "");
  if (!value) throw new Error("DATABASE_URL introuvable");
  return value;
}

export async function consolidateCharacters(
  sql: ReturnType<typeof postgres>,
  apply = false,
  tables = {
    characters: "bot.db_characters",
    variants: "bot.db_character_variants",
    revisions: "public.wiki_revisions",
  },
): Promise<{ ready: number; changed: number; rejected: string[] }> {
  const characters = sql.unsafe(tables.characters);
  const variantsTable = sql.unsafe(tables.variants);
  const revisions = sql.unsafe(tables.revisions);
  const ids = [...new Set(CHARACTER_MERGES.flatMap((m) => [m.winnerId, m.duplicateId]))];
  const rows = await sql<{ id: string; name: string; name_ja: string | null; visible: boolean }[]>`
    select id, name, name_ja, visible from ${characters} where id in ${sql(ids)}`;
  const byId = new Map<number, CharacterIdentity>(
    rows.map((row) => [
      Number(row.id),
      { id: Number(row.id), name: row.name, nameJa: row.name_ja, visible: row.visible },
    ]),
  );
  const rejected: string[] = [];
  const ready = CHARACTER_MERGES.filter((merge) => {
    const reason = validateCharacterMerge(
      merge,
      byId.get(merge.winnerId),
      byId.get(merge.duplicateId),
    );
    if (reason) rejected.push(`${merge.duplicateId}->${merge.winnerId}: ${reason}`);
    return !reason;
  });
  if (!apply || rejected.length) return { ready: ready.length, changed: 0, rejected };

  let changed = 0;
  await sql.begin(async (tx) => {
    await tx`set local lock_timeout = '5s'`;
    await tx`set local statement_timeout = '30s'`;
    await tx`select pg_advisory_xact_lock(7274926001)`;
    const locked = await tx<
      { id: string; name: string; name_ja: string | null; visible: boolean }[]
    >`
      select id, name, name_ja, visible from ${characters} where id in ${tx(ids)} order by id for update`;
    const live = new Map(
      locked.map((row) => [
        Number(row.id),
        { id: Number(row.id), name: row.name, nameJa: row.name_ja, visible: row.visible },
      ]),
    );
    const variants = await tx<ConsolidationVariant[]>`
      select * from ${variantsTable} where character_id in ${tx(ids)} order by id for update`;
    // Plan the complete batch before the first write, including every collision.
    const planned = ready.map((merge) => {
      const drift = validateCharacterMerge(
        merge,
        live.get(merge.winnerId),
        live.get(merge.duplicateId),
      );
      if (drift) throw new Error(`${merge.duplicateId}->${merge.winnerId}: ${drift}`);
      const canonical = variants.filter((row) => Number(row.character_id) === merge.winnerId);
      return {
        merge,
        changes: variants
          .filter((row) => Number(row.character_id) === merge.duplicateId)
          .flatMap((row) =>
            planVariantConsolidation(
              merge.winnerId,
              row,
              canonical.find((candidate) => Number(candidate.saga_id) === Number(row.saga_id)),
            ),
          ),
      };
    });
    for (const { merge, changes } of planned) {
      for (const change of changes) {
        const values = Object.fromEntries(
          Object.entries(change.after).map(([key, value]) => [
            key,
            JSON_FIELDS.has(key) && value !== null ? tx.json(value as postgres.JSONValue) : value,
          ]),
        );
        await tx`update ${variantsTable} set ${tx(values)} where id = ${Number(change.row.id)}`;
        await tx`insert into ${revisions} ${tx({
          id: revisionId(),
          tableName: "db_character_variants",
          rowId: String(change.row.id),
          action: "update",
          label: change.row.slug,
          before: tx.json(change.before as postgres.JSONValue),
          after: tx.json(change.after as postgres.JSONValue),
          editorId: "agent",
          editorName: "Character identity consolidation (preserve published variants)",
        })}`;
      }
      if (live.get(merge.duplicateId)!.visible) {
        await tx`update ${characters} set visible = false where id = ${merge.duplicateId}`;
        await tx`insert into ${revisions} ${tx({
          id: revisionId(),
          tableName: "db_characters",
          rowId: String(merge.duplicateId),
          action: "visibility",
          label: merge.duplicateName,
          before: tx.json({ visible: true }),
          after: tx.json({ visible: false }),
          editorId: "agent",
          editorName: "Character identity consolidation (preserve published variants)",
        })}`;
      }
      changed++;
    }
  });
  return { ready: ready.length, changed, rejected };
}

if (import.meta.main) {
  const sql = postgres(await databaseUrl(), { max: 2, prepare: false });
  try {
    const result = await consolidateCharacters(sql, APPLY);
    console.log(
      JSON.stringify(
        {
          status: result.rejected.length ? "INCOMPLET" : "FAIT",
          mode: APPLY ? "apply" : "simulation",
          ...result,
        },
        null,
        2,
      ),
    );
  } finally {
    await sql.end();
  }
}
