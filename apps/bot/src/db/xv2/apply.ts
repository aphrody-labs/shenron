/**
 * Adapters of the XV2 content plan (`./content.ts`): read a snapshot of the wiki
 * tables and write a plan, in one transaction.
 *
 * - PostgreSQL `bot.*` is the editorial source of truth: every created or updated
 *   row gets a reversible `public.wiki_revisions` entry. The reverse-sync then
 *   carries the rows down to the bot's SQLite replica within 15 minutes.
 * - SQLite is for a local replica, a copy, or tests. Writing a production
 *   replica directly is pointless: the next reverse-sync replaces these tables.
 */
import type { Database } from "bun:sqlite";
import type { Sql } from "postgres";
import type { Xv2Plan, Xv2Snapshot } from "./content";

const bool = (v: unknown) => v === true || v === 1 || v === "1" || v === "t";

// ── SQLite ──────────────────────────────────────────────────────────────────

const hasColumn = (sqlite: Database, table: string, column: string) =>
  sqlite
    .query<{ name: string }, [string]>("SELECT name FROM pragma_table_info(?)")
    .all(table)
    .some((c) => c.name === column);

export function readXv2SnapshotSqlite(sqlite: Database): Xv2Snapshot {
  const vis = (table: string) => (hasColumn(sqlite, table, "visible") ? "visible" : "1");
  type Row = Record<string, unknown>;
  const characters = sqlite
    .query<Row, []>(
      `SELECT id, name, race, gender, description, portrait_xv2, ${vis("db_characters")} AS visible FROM db_characters`,
    )
    .all()
    .map((r) => ({
      id: Number(r.id),
      name: String(r.name),
      race: (r.race as string | null) ?? null,
      gender: (r.gender as string | null) ?? null,
      description: (r.description as string | null) ?? null,
      portraitXv2: (r.portrait_xv2 as string | null) ?? null,
      visible: bool(r.visible),
    }));
  const techniques = sqlite
    .query<Row, []>(
      `SELECT id, name, slug, type, description, ${vis("db_techniques")} AS visible FROM db_techniques`,
    )
    .all()
    .map((r) => ({
      id: Number(r.id),
      name: String(r.name),
      slug: String(r.slug),
      type: (r.type as string | null) ?? null,
      description: (r.description as string | null) ?? null,
      visible: bool(r.visible),
    }));
  const transformations = sqlite
    .query<Row, []>("SELECT id, name, character_id FROM db_transformations")
    .all()
    .map((r) => ({
      id: Number(r.id),
      name: String(r.name),
      characterId: r.character_id == null ? null : Number(r.character_id),
    }));
  const links = sqlite
    .query<Row, []>("SELECT character_id, technique_id FROM db_character_techniques")
    .all()
    .map((r) => ({ characterId: Number(r.character_id), techniqueId: Number(r.technique_id) }));
  return { characters, techniques, transformations, links };
}

export function applyXv2PlanSqlite(sqlite: Database, plan: Xv2Plan): void {
  sqlite.transaction(() => {
    const tech = sqlite.prepare(
      "INSERT INTO db_techniques (id, slug, name, type, description) VALUES (?, ?, ?, ?, ?)",
    );
    for (const t of plan.techniques) tech.run(t.id, t.slug, t.name, t.type, t.description);
    const desc = sqlite.prepare("UPDATE db_techniques SET description = ? WHERE id = ?");
    for (const d of plan.techniqueDescriptions) desc.run(d.description, d.id);
    const char = sqlite.prepare(
      "INSERT INTO db_characters (id, name, image, portrait_xv2, description) VALUES (?, ?, ?, ?, ?)",
    );
    for (const c of plan.characters) char.run(c.id, c.name, c.image, c.portraitXv2, c.description);
    const meta = sqlite.prepare("UPDATE db_characters SET race = ?, gender = ? WHERE id = ?");
    for (const m of plan.meta) meta.run(m.race, m.gender, m.id);
    const portrait = sqlite.prepare("UPDATE db_characters SET portrait_xv2 = ? WHERE id = ?");
    for (const p of plan.portraits) portrait.run(p.portraitXv2, p.id);
    const form = sqlite.prepare(
      "INSERT INTO db_transformations (id, name, image, character_id) VALUES (?, ?, ?, ?)",
    );
    for (const t of plan.transformations) form.run(t.id, t.name, t.image, t.characterId);
    const link = sqlite.prepare(
      "INSERT INTO db_character_techniques (character_id, technique_id) VALUES (?, ?)",
    );
    for (const l of plan.links) link.run(l.characterId, l.techniqueId);
  })();
}

// ── PostgreSQL (`bot.*` + `public.wiki_revisions`) ──────────────────────────

export const XV2_REVISION_EDITOR = "xv2-content";
const EDITOR_NAME = "Import Dragon Ball Xenoverse 2 (catalogue du jeu)";
const revisionId = () =>
  Array.from(
    { length: 24 },
    () => "abcdefghijklmnopqrstuvwxyz0123456789"[Math.floor(Math.random() * 36)],
  ).join("");

export async function readXv2SnapshotPg(sql: Sql): Promise<Xv2Snapshot> {
  const characters = await sql<
    {
      id: number;
      name: string;
      race: string | null;
      gender: string | null;
      description: string | null;
      portrait_xv2: string | null;
      visible: boolean;
    }[]
  >`SELECT id::int AS id, name, race, gender, description, portrait_xv2, visible FROM bot.db_characters`;
  const techniques = await sql<
    {
      id: number;
      name: string;
      slug: string;
      type: string | null;
      description: string | null;
      visible: boolean;
    }[]
  >`SELECT id::int AS id, name, slug, type, description, visible FROM bot.db_techniques`;
  const transformations = await sql<
    { id: number; name: string; character_id: number | null }[]
  >`SELECT id::int AS id, name, character_id::int AS character_id FROM bot.db_transformations`;
  const links = await sql<
    { character_id: number; technique_id: number }[]
  >`SELECT character_id::int AS character_id, technique_id::int AS technique_id FROM bot.db_character_techniques`;
  return {
    characters: characters.map((r) => ({
      id: r.id,
      name: r.name,
      race: r.race,
      gender: r.gender,
      description: r.description,
      portraitXv2: r.portrait_xv2,
      visible: bool(r.visible),
    })),
    techniques: techniques.map((r) => ({
      id: r.id,
      name: r.name,
      slug: r.slug,
      type: r.type,
      description: r.description,
      visible: bool(r.visible),
    })),
    transformations: transformations.map((r) => ({
      id: r.id,
      name: r.name,
      characterId: r.character_id,
    })),
    links: links.map((r) => ({ characterId: r.character_id, techniqueId: r.technique_id })),
  };
}

type Revision = {
  tableName: string;
  rowId: string;
  action: "create" | "update";
  label: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown>;
};

/** Revisions of a plan, one per created or updated row. */
export function xv2Revisions(plan: Xv2Plan): Revision[] {
  const out: Revision[] = [];
  const create = (tableName: string, rowId: string, label: string, after: object) =>
    out.push({ tableName, rowId, action: "create", label, before: null, after: { ...after } });
  for (const t of plan.techniques) create("db_techniques", String(t.id), t.name, t);
  for (const d of plan.techniqueDescriptions)
    out.push({
      tableName: "db_techniques",
      rowId: String(d.id),
      action: "update",
      label: "description: XV2",
      before: { description: d.before },
      after: { description: d.description },
    });
  for (const c of plan.characters) create("db_characters", String(c.id), c.name, c);
  for (const m of plan.meta)
    out.push({
      tableName: "db_characters",
      rowId: String(m.id),
      action: "update",
      label: "race/gender: XV2",
      before: m.before,
      after: { race: m.race, gender: m.gender },
    });
  for (const p of plan.portraits)
    out.push({
      tableName: "db_characters",
      rowId: String(p.id),
      action: "update",
      label: `portrait_xv2: ${p.code}`,
      before: { portrait_xv2: p.before },
      after: { portrait_xv2: p.portraitXv2 },
    });
  for (const t of plan.transformations) create("db_transformations", String(t.id), t.name, t);
  for (const l of plan.links)
    create("db_character_techniques", `${l.characterId}:${l.techniqueId}`, "XV2 loadout", l);
  return out;
}

const BATCH = 500;
const chunks = <T>(rows: T[]) =>
  Array.from({ length: Math.ceil(rows.length / BATCH) }, (_, i) =>
    rows.slice(i * BATCH, (i + 1) * BATCH),
  );

/**
 * Plans and writes in one PostgreSQL transaction: the four tables are locked
 * against concurrent writes (reads stay open), the snapshot is read under the
 * lock, so ids allocated after the maximum cannot collide with a site edit.
 */
export async function applyXv2Pg(
  sql: Sql,
  makePlan: (snapshot: Xv2Snapshot) => Xv2Plan,
): Promise<{ plan: Xv2Plan; revisions: number }> {
  return sql.begin(async (tx) => {
    await tx`LOCK TABLE bot.db_characters, bot.db_techniques, bot.db_transformations, bot.db_character_techniques IN SHARE ROW EXCLUSIVE MODE`;
    const plan = makePlan(await readXv2SnapshotPg(tx as unknown as Sql));
    const revisions = xv2Revisions(plan);
    for (const rows of chunks(plan.techniques))
      await tx`INSERT INTO bot.db_techniques ${tx(
        rows.map((t) => ({
          id: t.id,
          slug: t.slug,
          name: t.name,
          type: t.type,
          description: t.description,
        })),
      )}`;
    for (const d of plan.techniqueDescriptions)
      await tx`UPDATE bot.db_techniques SET description = ${d.description} WHERE id = ${d.id}`;
    for (const rows of chunks(plan.characters))
      await tx`INSERT INTO bot.db_characters ${tx(
        rows.map((c) => ({
          id: c.id,
          name: c.name,
          image: c.image,
          portrait_xv2: c.portraitXv2,
          description: c.description,
        })),
      )}`;
    for (const m of plan.meta)
      await tx`UPDATE bot.db_characters SET race = ${m.race}, gender = ${m.gender} WHERE id = ${m.id}`;
    for (const p of plan.portraits)
      await tx`UPDATE bot.db_characters SET portrait_xv2 = ${p.portraitXv2} WHERE id = ${p.id}`;
    for (const rows of chunks(plan.transformations))
      await tx`INSERT INTO bot.db_transformations ${tx(
        rows.map((t) => ({ id: t.id, name: t.name, image: t.image, character_id: t.characterId })),
      )}`;
    for (const rows of chunks(plan.links))
      await tx`INSERT INTO bot.db_character_techniques ${tx(
        rows.map((l) => ({ character_id: l.characterId, technique_id: l.techniqueId })),
      )}`;
    for (const rows of chunks(revisions))
      await tx`INSERT INTO public.wiki_revisions ${tx(
        rows.map((r) => ({
          id: revisionId(),
          tableName: r.tableName,
          rowId: r.rowId,
          action: r.action,
          label: r.label,
          before: r.before === null ? null : tx.json(r.before as never),
          after: tx.json(r.after as never),
          editorId: XV2_REVISION_EDITOR,
          editorName: EDITOR_NAME,
        })),
      )}`;
    return { plan, revisions: revisions.length };
  });
}
