/**
 * Cross-check of the committed XV2 catalog against the private DBXV2 index
 * (`dbxv2_msg`, built from the owner's CPK by `scripts/data/build-dbxv2-db.ts`).
 * Skipped unless `DBXV2_DB_PATH` points to that SQLite (never in Git, never in CI).
 *
 *   DBXV2_DB_PATH=../../var/dbxv2/dbxv2.sqlite bun test --isolate tests/xv2-catalog-source.test.ts
 */
import { describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { loadXv2Source, type Xv2SkillType } from "../src/db/xv2/content";

const dbPath = Bun.env.DBXV2_DB_PATH;
const enabled = !!dbPath && existsSync(dbPath);

/** MSG base of each catalog category (French proper nouns). */
const MSG_BASE: Record<Xv2SkillType, string> = {
  super: "proper_noun_skill_spa_name",
  ultimate: "proper_noun_skill_ult_name",
  evasive: "proper_noun_skill_esc_name",
  awoken: "proper_noun_skill_met_name",
};
const decode = (s: string) =>
  s
    .replaceAll("&apos;", "'")
    .replaceAll("&quot;", '"')
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&amp;", "&")
    .trim();

describe.if(enabled)("XV2 catalog = game MSG (private index)", () => {
  const source = loadXv2Source(join(import.meta.dir, "../assets/dbz"));
  const db = enabled ? new Database(dbPath!, { readonly: true }) : null;
  const text = (base: string, id: string) =>
    db!
      .query<{ text: string }, [string, string]>(
        "SELECT text FROM dbxv2_msg WHERE lang = 'fr' AND base = ? AND name_id = ?",
      )
      .get(base, id)?.text;

  test("every character name is chara_<CODE>_000 of proper_noun_character_name", () => {
    const mismatches = Object.entries(source.catalog.characters).filter(
      ([code, name]) =>
        decode(text("proper_noun_character_name", `chara_${code}_000`) ?? "") !== name,
    );
    expect(mismatches).toEqual([]);
  });

  test("every skill name is the same id in its proper_noun_skill_*_name base", () => {
    for (const [type, base] of Object.entries(MSG_BASE) as [Xv2SkillType, string][]) {
      const mismatches = Object.entries(source.catalog.skills[type]).filter(
        ([id, skill]) => decode(text(base, id) ?? "") !== skill.name,
      );
      expect({ type, mismatches }).toEqual({ type, mismatches: [] });
    }
  });

  test("every loadout code is a character of char_model_spec.cms", () => {
    const cms = new Set(
      db!
        .query<{ short_name: string }, []>("SELECT DISTINCT short_name FROM dbxv2_characters")
        .all()
        .map((r) => r.short_name),
    );
    expect(Object.keys(source.skillsets).filter((code) => !cms.has(code))).toEqual([]);
  });
});
