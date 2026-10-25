// SPDX-License-Identifier: Apache-2.0
import "server-only";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { wikiRevisions } from "@/db/schema";
import { CHARACTER_MERGES, validateCharacterMerge } from "@/lib/character-consolidation";
import {
  planVariantConsolidation,
  type ConsolidationVariant,
} from "@/lib/character-variant-consolidation";
import { wikiUpdateSnapshotHash } from "@/lib/wiki-update-precondition";
import type { RevisionActor } from "@/lib/wiki-revisions";

type Row = Record<string, unknown>;
type Relation = {
  name: string;
  parent: string;
  keys: string[];
  collision?: string[];
  entity?: boolean;
};
const RELATIONS: Relation[] = [
  {
    name: "db_assets",
    parent: "entity_id",
    keys: ["id"],
    collision: ["path", "role"],
    entity: true,
  },
  { name: "db_battles", parent: "winner_id", keys: ["id"] },
  {
    name: "db_character_arcs",
    parent: "character_id",
    keys: ["character_id", "arc_id"],
    collision: ["arc_id"],
  },
  {
    name: "db_character_techniques",
    parent: "character_id",
    keys: ["character_id", "technique_id"],
    collision: ["technique_id"],
  },
  { name: "db_character_variants", parent: "character_id", keys: ["id"] },
  {
    name: "db_game_characters",
    parent: "character_id",
    keys: ["game_id", "character_id"],
    collision: ["game_id"],
  },
  { name: "db_power_levels", parent: "character_id", keys: ["id"] },
  { name: "db_techniques", parent: "creator_id", keys: ["id"] },
  { name: "db_transformations", parent: "character_id", keys: ["id"] },
  { name: "db_wiki_sections", parent: "entity_id", keys: ["id"], collision: ["key"], entity: true },
  { name: "contributor_credits", parent: "character_id", keys: ["id"] },
  {
    name: "narrative_event_participants",
    parent: "character_id",
    keys: ["event_id", "character_id", "role"],
    collision: ["event_id", "role"],
  },
].toSorted((a, b) => a.name.localeCompare(b.name));
const tableSql = (name: string) => sql`${sql.identifier("bot")}.${sql.identifier(name)}`;
const empty = (value: unknown) =>
  value === null || value === undefined || (typeof value === "string" && value.trim() === "");
const jsonValue = (value: unknown) =>
  Array.isArray(value) ||
  (value !== null &&
    typeof value === "object" &&
    (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null));
const same = (a: unknown, b: unknown) => Bun.deepEquals(a, b);
const camel = (key: string) =>
  key.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase());
const camelRow = (row: Row) =>
  Object.fromEntries(Object.entries(row).map(([key, value]) => [camel(key), value]));

export type ConsolidationSnapshot = Record<string, Row[]>;
export type ConsolidationChange = { table: string; keys: string[]; before: Row; after: Row | null };
export type CharacterConsolidationPlan = {
  winnerId: number;
  duplicateId: number;
  changes: ConsolidationChange[];
  blockers: string[];
  differences: Array<{ table: string; field: string; canonical: unknown; duplicate: unknown }>;
  sha256: string;
};

/** Plan from complete administrative rows; public projections cannot authorize a merge. */
export function planCharacterConsolidation(
  winnerId: number,
  duplicateId: number,
  snapshot: ConsolidationSnapshot,
): CharacterConsolidationPlan {
  const changes: ConsolidationChange[] = [];
  const blockers: string[] = [];
  const differences: CharacterConsolidationPlan["differences"] = [];
  for (const foreignKey of snapshot.__character_foreign_keys ?? []) {
    if (
      !RELATIONS.some(
        (relation) =>
          foreignKey.schema_name === "bot" &&
          relation.name === foreignKey.table_name &&
          relation.parent === foreignKey.column_name,
      )
    ) {
      blockers.push(
        `unsupported character reference: ${foreignKey.schema_name}.${foreignKey.table_name}.${foreignKey.column_name}`,
      );
    }
  }
  const merge = CHARACTER_MERGES.find(
    (item) => item.winnerId === winnerId && item.duplicateId === duplicateId,
  );
  const roots = snapshot.db_characters ?? [];
  const winner = roots.find((row) => Number(row.id) === winnerId);
  const duplicate = roots.find((row) => Number(row.id) === duplicateId);
  const identity = (row: Row | undefined) =>
    row
      ? {
          id: Number(row.id),
          name: String(row.name),
          nameJa: row.name_ja as string | null,
          visible: row.visible === true,
        }
      : undefined;
  const invalid = merge
    ? validateCharacterMerge(merge, identity(winner), identity(duplicate))
    : "pair is outside reviewed identity allow-list";
  if (invalid) blockers.push(invalid);
  if (!winner || !duplicate || invalid) return finish();

  const canonical = { ...winner };
  for (const [field, value] of Object.entries(duplicate)) {
    if (["id", "visible", "name", "name_ja", "name_romaji"].includes(field) || empty(value))
      continue;
    if (field === "article_sources") {
      if (!Array.isArray(value) || (!empty(canonical[field]) && !Array.isArray(canonical[field]))) {
        blockers.push("article_sources: incompatible bibliography structure");
        continue;
      }
      const sources = [...((canonical[field] as Row[] | null) ?? [])];
      if (
        sources.some(
          (source) =>
            !source ||
            typeof source !== "object" ||
            !Number.isSafeInteger(source.n) ||
            typeof source.url !== "string",
        )
      ) {
        blockers.push("article_sources: malformed canonical source");
        continue;
      }
      for (const source of value) {
        if (
          !source ||
          typeof source !== "object" ||
          !Number.isSafeInteger(source.n) ||
          typeof source.url !== "string"
        ) {
          blockers.push("article_sources: malformed source");
          continue;
        }
        const existing = sources.find((item) => item.n === source.n);
        if (existing && !same(existing, source))
          blockers.push(`article_sources: citation number ${source.n} conflicts`);
        else if (!existing) sources.push(source);
      }
      canonical[field] = sources;
    } else if (empty(canonical[field])) canonical[field] = value;
    else if (!same(canonical[field], value)) {
      differences.push({
        table: "db_characters",
        field,
        canonical: canonical[field],
        duplicate: value,
      });
      blockers.push(`db_characters.${field}: distinct published values require editorial review`);
    }
  }
  if (!same(winner, canonical))
    changes.push({ table: "db_characters", keys: ["id"], before: winner, after: canonical });

  for (const relation of RELATIONS) {
    const rows = snapshot[relation.name] ?? [];
    const targets = rows.filter((row) => Number(row[relation.parent]) === winnerId);
    if (relation.name === "db_character_variants") {
      const identities = new Set<string>();
      for (const row of rows) {
        const key = `${row.character_id}:${row.saga_id}`;
        if (identities.has(key))
          blockers.push(`db_character_variants: duplicate parent/saga identity ${key}`);
        identities.add(key);
      }
      for (const source of rows.filter((row) => Number(row.character_id) === duplicateId)) {
        try {
          const target = targets.find((row) => Number(row.saga_id) === Number(source.saga_id));
          for (const change of planVariantConsolidation(
            winnerId,
            source as ConsolidationVariant,
            target as ConsolidationVariant | undefined,
          )) {
            changes.push({
              table: relation.name,
              keys: relation.keys,
              before: change.row,
              after: { ...change.row, ...change.after },
            });
          }
        } catch (error) {
          blockers.push(String(error instanceof Error ? error.message : error));
        }
      }
      continue;
    }
    if (relation.name === "db_battles") {
      for (const row of rows) {
        if (
          !Array.isArray(row.combatants) ||
          row.combatants.some(
            (fighter) => !fighter || typeof fighter !== "object" || Array.isArray(fighter),
          )
        ) {
          blockers.push(`db_battles#${row.id}: malformed combatants`);
          continue;
        }
        const after: Row = {
          ...row,
          combatants: row.combatants.map((fighter: Row) =>
            Number(fighter.characterId) === duplicateId
              ? { ...fighter, characterId: winnerId }
              : fighter,
          ),
        };
        if (Number(row.winner_id) === duplicateId) after.winner_id = winnerId;
        if (!same(row, after))
          changes.push({ table: relation.name, keys: relation.keys, before: row, after });
      }
      continue;
    }
    for (const source of rows.filter((row) => Number(row[relation.parent]) === duplicateId)) {
      const target = relation.collision
        ? targets.find((row) => relation.collision!.every((key) => same(row[key], source[key])))
        : undefined;
      if (!target) {
        const after = { ...source, [relation.parent]: winnerId };
        changes.push({
          table: relation.name,
          keys: relation.keys,
          before: source,
          after,
        });
        targets.push(after);
        continue;
      }
      const merged = { ...target };
      const ignored = new Set([relation.parent, "id"]);
      let conflicting = false;
      for (const [field, value] of Object.entries(source)) {
        if (ignored.has(field) || empty(value)) continue;
        if (field === "visible") {
          merged[field] = merged[field] === true || value === true;
          continue;
        }
        if (empty(merged[field])) merged[field] = value;
        else if (!same(merged[field], value)) {
          conflicting = true;
          differences.push({
            table: relation.name,
            field,
            canonical: merged[field],
            duplicate: value,
          });
          blockers.push(
            `${relation.name}#${source.id ?? relation.keys.map((key) => source[key]).join(":")}.${field}: conflicting relation`,
          );
        }
      }
      if (conflicting) continue;
      if (!same(target, merged))
        changes.push({ table: relation.name, keys: relation.keys, before: target, after: merged });
      const targetIndex = targets.indexOf(target);
      targets[targetIndex] = merged;
      if ("visible" in source)
        changes.push({
          table: relation.name,
          keys: relation.keys,
          before: source,
          after: { ...source, visible: false },
        });
      else if (relation.keys.length > 1)
        changes.push({ table: relation.name, keys: relation.keys, before: source, after: null });
      // Assets have immutable evidence: an identical canonical asset already exists.
    }
  }
  changes.push({
    table: "db_characters",
    keys: ["id"],
    before: duplicate,
    after: { ...duplicate, visible: false },
  });
  return finish();

  function finish(): CharacterConsolidationPlan {
    return {
      winnerId,
      duplicateId,
      changes,
      blockers,
      differences,
      sha256: wikiUpdateSnapshotHash({ winnerId, duplicateId, snapshot, changes, blockers }),
    };
  }
}

export class CharacterConsolidationConflict extends Error {
  constructor(
    readonly plan: CharacterConsolidationPlan,
    message = "character_consolidation_conflict",
  ) {
    super(message);
  }
}

/** No network or best-effort journaling inside the authoritative transaction. */
export async function consolidateWikiCharacters(input: {
  winnerId: number;
  duplicateId: number;
  dryRun: boolean;
  expectedPlanSha256?: string;
  actor: RevisionActor;
}): Promise<{ applied: boolean; plan: CharacterConsolidationPlan }> {
  return db.transaction(
    async (tx) => {
      await tx.execute(sql`SET LOCAL lock_timeout = '5s'`);
      await tx.execute(sql`SET LOCAL statement_timeout = '30s'`);
      const names = ["db_characters", ...RELATIONS.map((relation) => relation.name)].toSorted();
      // Some legacy joins have no FK. Table locks prevent new dependent rows from
      // appearing after validation, including writers which do not use our advisory lock.
      if (!input.dryRun)
        for (const name of names)
          await tx.execute(sql`LOCK TABLE ${tableSql(name)} IN SHARE ROW EXCLUSIVE MODE`);
      const ids = sql`${input.winnerId}, ${input.duplicateId}`;
      const snapshot: ConsolidationSnapshot = {};
      snapshot.__character_foreign_keys = [
        ...(await tx.execute(sql`
      SELECT ns.nspname AS schema_name, rel.relname AS table_name, att.attname AS column_name
      FROM pg_constraint con
      JOIN pg_class rel ON rel.oid = con.conrelid
      JOIN pg_namespace ns ON ns.oid = rel.relnamespace
      JOIN pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
      WHERE con.contype = 'f' AND con.confrelid = 'bot.db_characters'::regclass
      ORDER BY ns.nspname, rel.relname, att.attname`)),
      ];
      snapshot.db_characters = [
        ...(await tx.execute(
          sql`SELECT * FROM ${tableSql("db_characters")} WHERE id IN (${ids}) ORDER BY id`,
        )),
      ];
      for (const relation of RELATIONS) {
        const parent = sql.identifier(relation.parent);
        let condition = sql`${parent} IN (${ids})`;
        if (relation.entity) condition = sql`(${condition}) AND entity_type = 'character'`;
        if (relation.name === "db_battles")
          condition = sql`(${condition}) OR combatants @> ${JSON.stringify([{ characterId: input.duplicateId }])}::jsonb`;
        snapshot[relation.name] = [
          ...(await tx.execute(
            sql`SELECT * FROM ${tableSql(relation.name)} WHERE ${condition} ORDER BY ${sql.join(
              relation.keys.map((key) => sql.identifier(key)),
              sql`, `,
            )}`,
          )),
        ];
      }
      const plan = planCharacterConsolidation(input.winnerId, input.duplicateId, snapshot);
      if (input.dryRun) return { applied: false, plan };
      if (plan.blockers.length || input.expectedPlanSha256 !== plan.sha256)
        throw new CharacterConsolidationConflict(plan);
      for (const change of plan.changes) {
        const where = sql.join(
          change.keys.map((key) => sql`${sql.identifier(key)} = ${change.before[key]}`),
          sql` AND `,
        );
        if (change.after === null)
          await tx.execute(sql`DELETE FROM ${tableSql(change.table)} WHERE ${where}`);
        else {
          const fields = Object.entries(change.after).filter(
            ([key, value]) => !same(value, change.before[key]),
          );
          const assignments = fields.map(
            ([key, value]) =>
              sql`${sql.identifier(key)} = ${jsonValue(value) ? sql`${JSON.stringify(value)}::jsonb` : sql`${value}`}`,
          );
          if (fields.length)
            await tx.execute(
              sql`UPDATE ${tableSql(change.table)} SET ${sql.join(assignments, sql`, `)} WHERE ${where}`,
            );
        }
        // Complete camelCase snapshots preserve arrays, evidence and removed joins.
        // Unlike recordRevision(), a journal failure must roll back the whole merge.
        await tx.insert(wikiRevisions).values({
          tableName: change.table,
          rowId: change.keys.map((key) => String(change.before[key])).join(":"),
          action: change.after === null ? "delete" : "update",
          label: String(
            change.before.name ??
              change.before.label ??
              change.before.id ??
              "Character identity consolidation",
          ),
          before: camelRow(change.before),
          after: change.after ? camelRow(change.after) : null,
          editorId: input.actor?.id ?? null,
          editorName: input.actor?.name ?? null,
        });
      }
      return { applied: true, plan };
    },
    {
      isolationLevel: input.dryRun ? "repeatable read" : "serializable",
      accessMode: input.dryRun ? "read only" : "read write",
    },
  );
}
