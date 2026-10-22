/**
 * Dragon Ball Xenoverse 2 content for the wiki tables (characters, techniques,
 * transformations, character↔technique links, race/gender, portraits).
 *
 * Source: the derived, committed catalog `assets/dbz/xv2-catalog.json` (FR names
 * from the game's `proper_noun_*_name_fr.msg`, DBXV2 v1.25.02), the loadouts
 * `assets/dbz/xv2-skillsets.json` (CMS→CUS→MSG chain) and the portraits
 * `assets/dbz/xv2-portraits/<CODE>.png`. No raw game file is read here.
 *
 * This module is pure: {@link planXv2Content} turns a snapshot of the existing
 * rows into an additive plan. It never deletes (editorial deletion is logical,
 * `visible = false`), never resurrects a hidden row (a hidden name still counts
 * as present) and never edits a hidden row. Ids of new rows are allocated after
 * the current maximum so links can reference rows created in the same plan.
 * The adapters in `./apply.ts` read the snapshot and write the plan, to
 * PostgreSQL `bot.*` (source of truth) or to a local SQLite replica.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/** Path stored in `portrait_xv2` / `image`, relative to the bot's cwd (`/app` in production). */
export const XV2_PORTRAIT_DIR = "./assets/dbz/xv2-portraits";
/** Description of a character the XV2 catalog adds (also marks rows this seed owns). */
export const XV2_CHARACTER_DESCRIPTION = "Personnage jouable de Dragon Ball Xenoverse 2.";
/** XV2 skill categories, stored in `db_techniques.type`. */
export const XV2_SKILL_TYPES = ["super", "ultimate", "awoken", "evasive"] as const;
export type Xv2SkillType = (typeof XV2_SKILL_TYPES)[number];

export const XV2_STEPS = [
  "techniques",
  "characters",
  "char-meta",
  "portraits",
  "transformations",
  "char-techniques",
] as const;
export type Xv2Step = (typeof XV2_STEPS)[number];

export interface Xv2Catalog {
  source: string;
  /** XV2 code (CMS short name) → French game name. */
  characters: Record<string, string>;
  skills: Record<Xv2SkillType, Record<string, { name: string; desc: string }>>;
}
/** XV2 code → category → skill names (union of the character's presets). */
export type Xv2Skillsets = Record<string, Partial<Record<Xv2SkillType, string[]>>>;

export interface Xv2Source {
  catalog: Xv2Catalog;
  skillsets: Xv2Skillsets;
  /** Codes with a portrait file. */
  portraitCodes: Set<string>;
}

export function loadXv2Source(assetsDir = "./assets/dbz"): Xv2Source {
  const read = <T>(file: string): T => JSON.parse(readFileSync(join(assetsDir, file), "utf-8"));
  return {
    catalog: read<Xv2Catalog>("xv2-catalog.json"),
    skillsets: read<Xv2Skillsets>("xv2-skillsets.json"),
    portraitCodes: new Set(
      readdirSync(join(assetsDir, "xv2-portraits"))
        .filter((f) => /^[A-Z0-9]{3}\.png$/.test(f))
        .map((f) => f.slice(0, 3)),
    ),
  };
}

// ── Name matching ───────────────────────────────────────────────────────────

/** Synonyms → canonical token shared by the wiki names and the game names. */
const SYN: Record<string, string> = {
  songoku: "goku",
  songohan: "gohan",
  songoten: "goten",
  krilin: "krillin",
  bills: "beerus",
  celula: "cell",
  majinbuu: "buu",
  boo: "buu",
  vegeto: "vegetto",
  msatan: "mrsatan",
  satan: "mrsatan",
  doria: "dodoria",
  vermoud: "vermoudh",
  songokublack: "gokublack",
};

const fold = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");

/** Canonical character key: drops the subtitle (« (Super Saiyen 4) », « , dieu… »). */
export function canonCharacter(name: string): string {
  const n = fold(name.split(/[,(]/)[0]!.trim())
    .replace(/^c-?(\d+)/, "android$1")
    .replace(/[^a-z0-9]/g, "");
  return SYN[n] ?? n;
}

/** Normalized technique key (case, accents and punctuation ignored). */
export function normTechnique(name: string): string {
  return fold(name).replace(/[^a-z0-9]/g, "");
}

export function slugify(name: string): string {
  return fold(name)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Catalog noise: great apes, technical variants, NPC/robots, "all". */
const BLOCK = /gorille géant|variante|robot|réception|éclairé|^tous$/i;
const isAvatarCode = (code: string) => /^XA[A-Z]$/.test(code);
/** Age or period variants: not transformations. */
const NOT_A_FORM =
  /^(petit|ado|adulte|enfant|jeune|bébé|\d+\s*ans|du futur|gt|base|jeunesse|db super|dbs.*|xeno|mini|retenu|.*absorbé)$/i;

/** Form key: spelling (Saiyen/Saiyan), « divin » = God, « SS » = Super Saiyan, « MMI » = Ultra Instinct. */
export function formKey(form: string): string {
  return normTechnique(form)
    .replace(/saiyen/g, "saiyan")
    .replace(/divin/g, "god")
    .replace(/^ss(?=[a-z])/, "supersaiyan")
    .replace(/^mmi$/, "ultrainstinct");
}

/**
 * Canonical race of the XV2-only characters, in the vocabulary of `db_characters`
 * (Saiyan/Human/Namekian/Frieza Race/Android/Majin/God/Angel/Evil/Unknown).
 * Unnamed or ambiguous species stay "Unknown".
 */
export const XV2_RACE: Record<string, string> = {
  "Son Goten": "Saiyan",
  "Trunks du Futur": "Saiyan",
  Nappa: "Saiyan",
  Cabba: "Saiyan",
  Thalès: "Saiyan",
  Pan: "Saiyan",
  "Son Goku Black": "Saiyan",
  "Super Baby 2": "Saiyan",
  Videl: "Human",
  Majuub: "Majin",
  "Buu enfant": "Majin",
  "Super Buu": "Majin",
  "Piccolo Orange": "Namekian",
  Slugh: "Namekian",
  Frost: "Frieza Race",
  "Golden Freezer": "Frieza Race",
  "Metal Cooler": "Frieza Race",
  "Cell Junior": "Android",
  "Cell Max": "Android",
  "Super C-17": "Android",
  "C-21": "Android",
  "Gamma 1": "Android",
  "Gamma 2": "Android",
  Mira: "Android",
  "Champa, dieu de la destruction": "God",
  "Kaïo Shin du temps": "God",
  "Vieux Kaïo Shin": "God",
  Zamasu: "God",
  "Zamasu fusionné": "God",
  Vados: "Angel",
  Dabra: "Evil",
  "Dieu démon Demigra": "Evil",
  Towa: "Evil",
  Hit: "Unknown",
  Jaco: "Unknown",
  Jeice: "Unknown",
  Burter: "Unknown",
  Recoome: "Unknown",
  Guldo: "Unknown",
  Raspberry: "Unknown",
  Nabana: "Unknown",
  Kaiwareman: "Unknown",
  Bojack: "Unknown",
  Tapion: "Unknown",
  Paikuhan: "Unknown",
  Fu: "Unknown",
  Ribrianne: "Unknown",
  "Eis Shenron": "Unknown",
  "Li Shenron": "Unknown",
  "Suu Shenron": "Unknown",
};
const XV2_FEMALE = new Set([
  "Pan",
  "Videl",
  "Vados",
  "Towa",
  "Kaïo Shin du temps",
  "C-21",
  "Ribrianne",
]);

// ── Snapshot and plan ───────────────────────────────────────────────────────

export interface SnapshotCharacter {
  id: number;
  name: string;
  race: string | null;
  gender: string | null;
  description: string | null;
  portraitXv2: string | null;
  visible: boolean;
}
export interface SnapshotTechnique {
  id: number;
  name: string;
  slug: string;
  type: string | null;
  description: string | null;
  visible: boolean;
}
export interface SnapshotTransformation {
  id: number;
  name: string;
  characterId: number | null;
}
export interface Xv2Snapshot {
  characters: SnapshotCharacter[];
  techniques: SnapshotTechnique[];
  transformations: SnapshotTransformation[];
  links: { characterId: number; techniqueId: number }[];
}

export interface NewTechnique {
  id: number;
  slug: string;
  name: string;
  type: Xv2SkillType;
  description: string | null;
}
export interface NewCharacter {
  id: number;
  name: string;
  image: string;
  portraitXv2: string;
  description: string;
  code: string;
}
export interface NewTransformation {
  id: number;
  name: string;
  image: string;
  characterId: number;
  code: string;
}

export interface Xv2Plan {
  techniques: NewTechnique[];
  /** Descriptions refreshed on visible XV2-typed techniques. */
  techniqueDescriptions: { id: number; before: string | null; description: string }[];
  characters: NewCharacter[];
  meta: {
    id: number;
    before: { race: string | null; gender: string | null };
    race: string;
    gender: string;
  }[];
  portraits: { id: number; before: string | null; portraitXv2: string; code: string }[];
  transformations: NewTransformation[];
  links: { characterId: number; techniqueId: number }[];
  /** Skill names of a loadout with no technique row (should be 0). */
  unresolvedSkills: string[];
  /** Base names of forms whose character is unknown. */
  unlinkedForms: string[];
}

const nextId = (rows: { id: number }[]) => rows.reduce((m, r) => Math.max(m, r.id), 0) + 1;

/** Best code per canonical name: portrait first, then base form (no parenthesis). */
function codeByCanon(source: Xv2Source): Map<string, string> {
  const { catalog, portraitCodes } = source;
  const score = (code: string) =>
    (portraitCodes.has(code) ? 2 : 0) + (/[(),]/.test(catalog.characters[code] ?? "") ? 0 : 1);
  const best = new Map<string, string>();
  for (const [code, name] of Object.entries(catalog.characters)) {
    if (isAvatarCode(code) || /[(]/.test(name)) continue;
    const key = canonCharacter(name);
    if (!key) continue;
    const current = best.get(key);
    if (!current || score(code) > score(current)) best.set(key, code);
  }
  return best;
}

export function planXv2Content(snapshot: Xv2Snapshot, source: Xv2Source): Xv2Plan {
  const { catalog, skillsets, portraitCodes } = source;
  const portraitPath = (code: string) => `${XV2_PORTRAIT_DIR}/${code}.png`;
  const plan: Xv2Plan = {
    techniques: [],
    techniqueDescriptions: [],
    characters: [],
    meta: [],
    portraits: [],
    transformations: [],
    links: [],
    unresolvedSkills: [],
    unlinkedForms: [],
  };

  // 1. Techniques: insert names absent from the table (hidden rows included).
  //    Existing rows keep their text: editors replaced many XV2 blurbs with
  //    databook descriptions; only an empty description is filled.
  const techByName = new Map<string, { id: number; visible: boolean }>();
  const techRows = new Map<string, SnapshotTechnique>();
  for (const t of snapshot.techniques) {
    const key = normTechnique(t.name);
    if (key && !techRows.has(key)) {
      techByName.set(key, t);
      techRows.set(key, t);
    }
  }
  const usedSlugs = new Set(snapshot.techniques.map((t) => t.slug));
  const described = new Set<number>();
  // First non-empty game text per name (a name can repeat across categories).
  const descOf = new Map<string, string>();
  for (const type of XV2_SKILL_TYPES)
    for (const e of Object.values(catalog.skills[type])) {
      const k = normTechnique(e.name);
      if (k && e.desc && !descOf.has(k)) descOf.set(k, e.desc);
    }
  let techId = nextId(snapshot.techniques);
  for (const type of XV2_SKILL_TYPES) {
    for (const entry of Object.values(catalog.skills[type])) {
      const key = normTechnique(entry.name);
      if (!key) continue;
      const existing = techRows.get(key);
      if (existing) {
        const desc = descOf.get(key);
        if (existing.visible && !existing.description && desc && !described.has(existing.id)) {
          described.add(existing.id);
          plan.techniqueDescriptions.push({ id: existing.id, before: null, description: desc });
        }
        continue;
      }
      if (techByName.has(key)) continue;
      const base = slugify(entry.name) || `xv2-${type}`;
      let slug = base;
      for (let n = 2; usedSlugs.has(slug); n++) slug = `${base}-${n}`;
      usedSlugs.add(slug);
      const row: NewTechnique = {
        id: techId++,
        slug,
        name: entry.name,
        type,
        description: descOf.get(key) ?? null,
      };
      plan.techniques.push(row);
      techByName.set(key, { id: row.id, visible: true });
    }
  }

  // 2. Characters. Identity of a game code: first the row whose portrait_xv2 is
  //    that code (editors mapped them by hand: « Zabon » = ZBN, « Majin Boo » =
  //    BUL), then the canonical name, preferring the base name, then a visible row.
  const codeOfPortrait = (path: string | null) =>
    path?.match(/xv2-portraits\/([A-Z0-9]{3})\.png$/)?.[1] ?? null;
  const byCode = new Map<string, SnapshotCharacter>();
  const byCanon = new Map<string, SnapshotCharacter>();
  const rank = (c: SnapshotCharacter) => (/[(,]/.test(c.name) ? 0 : 2) + (c.visible ? 1 : 0);
  for (const c of snapshot.characters) {
    const code = codeOfPortrait(c.portraitXv2);
    const prev = code ? byCode.get(code) : undefined;
    if (code && (!prev || rank(c) > rank(prev))) byCode.set(code, c);
    const key = canonCharacter(c.name);
    const current = byCanon.get(key);
    if (key && (!current || rank(c) > rank(current))) byCanon.set(key, c);
  }
  const characterFor = (code: string): SnapshotCharacter | undefined => {
    const name = catalog.characters[code];
    return byCode.get(code) ?? (name ? byCanon.get(canonCharacter(name)) : undefined);
  };
  const takenNames = new Set(snapshot.characters.map((c) => c.name));
  let charId = nextId(snapshot.characters);
  for (const [code, name] of Object.entries(catalog.characters)) {
    if (!portraitCodes.has(code) || isAvatarCode(code)) continue;
    if (/[(）]/.test(name) || BLOCK.test(name)) continue;
    const key = canonCharacter(name);
    if (!key || characterFor(code) || takenNames.has(name)) continue;
    const row: NewCharacter = {
      id: charId++,
      name,
      image: portraitPath(code),
      portraitXv2: portraitPath(code),
      description: XV2_CHARACTER_DESCRIPTION,
      code,
    };
    plan.characters.push(row);
    takenNames.add(name);
    const created: SnapshotCharacter = {
      id: row.id,
      name,
      race: null,
      gender: null,
      description: row.description,
      portraitXv2: row.portraitXv2,
      visible: true,
    };
    byCode.set(code, created);
    byCanon.set(key, created);
  }

  // 3. Race and gender, only where they are empty (editors use their own labels).
  const metaSeen = new Set<number>();
  for (const [code, name] of Object.entries(catalog.characters)) {
    const race = XV2_RACE[name];
    const c = race ? characterFor(code) : undefined;
    if (!race || !c?.visible || metaSeen.has(c.id) || c.name !== name) continue;
    metaSeen.add(c.id);
    const gender = XV2_FEMALE.has(name) ? "Female" : "Male";
    const next = { race: c.race ?? race, gender: c.gender ?? gender };
    if (next.race === c.race && next.gender === c.gender) continue;
    plan.meta.push({ id: c.id, before: { race: c.race, gender: c.gender }, ...next });
  }

  // 4. Portraits on visible characters without one, matched by the game name.
  //    A subtitled wiki name (« Broly (DBS) ») needs the exact game name.
  const bestCode = codeByCanon(source);
  const exactCode = new Map<string, string>();
  for (const [code, name] of Object.entries(catalog.characters))
    if (portraitCodes.has(code) && !isAvatarCode(code) && !exactCode.has(fold(name)))
      exactCode.set(fold(name), code);
  for (const c of snapshot.characters) {
    if (!c.visible || c.portraitXv2) continue;
    const code = /[(,]/.test(c.name)
      ? exactCode.get(fold(c.name))
      : bestCode.get(canonCharacter(c.name));
    if (!code || !portraitCodes.has(code)) continue;
    plan.portraits.push({ id: c.id, before: null, portraitXv2: portraitPath(code), code });
  }

  // 5. Transformations: « Base (Forme) » codes with a portrait, attached to the base.
  const formsOf = new Map<number | null, string[]>();
  for (const t of snapshot.transformations)
    formsOf.set(t.characterId, [...(formsOf.get(t.characterId) ?? []), formKey(t.name)]);
  // A form already present, possibly under a longer label (« Super Saiyan Blue
  // (et déclinaison Rosé) »), counts as present; « Super Saiyan » does not
  // cover « Super Saiyan 4 » (a digit right after the match is another form).
  const hasForm = (characterId: number, key: string) =>
    (formsOf.get(characterId) ?? []).some((k) => {
      const at = k.indexOf(key);
      return at >= 0 && !/\d/.test(k[at + key.length] ?? "");
    });
  const codeByName = new Map(Object.entries(catalog.characters).map(([code, n]) => [n, code]));
  const unlinked = new Set<string>();
  let formId = nextId(snapshot.transformations);
  for (const [code, name] of Object.entries(catalog.characters)) {
    const m = name.match(/^(.+?)\s*\((.+)\)\s*$/);
    if (!m || !portraitCodes.has(code) || isAvatarCode(code)) continue;
    const baseName = m[1]!.trim();
    const form = m[2]!.trim();
    if (NOT_A_FORM.test(form)) continue;
    const baseCode = codeByName.get(baseName);
    const base =
      (baseCode ? characterFor(baseCode) : undefined) ?? byCanon.get(canonCharacter(baseName));
    if (!base) {
      unlinked.add(baseName);
      continue;
    }
    if (!base.visible) continue;
    const key = formKey(form);
    if (!key || hasForm(base.id, key)) continue;
    formsOf.set(base.id, [...(formsOf.get(base.id) ?? []), key]);
    plan.transformations.push({
      id: formId++,
      name: form,
      image: portraitPath(code),
      characterId: base.id,
      code,
    });
  }
  plan.unlinkedForms = [...unlinked].toSorted();

  // 6. Character ↔ technique links from the game loadouts.
  const pairs = new Set(snapshot.links.map((l) => `${l.characterId}:${l.techniqueId}`));
  for (const [code, categories] of Object.entries(skillsets)) {
    const character = characterFor(code);
    if (!character?.visible) continue;
    for (const skills of Object.values(categories)) {
      for (const skill of skills ?? []) {
        const technique = techByName.get(normTechnique(skill));
        if (!technique) {
          plan.unresolvedSkills.push(skill);
          continue;
        }
        if (!technique.visible) continue;
        const key = `${character.id}:${technique.id}`;
        if (pairs.has(key)) continue;
        pairs.add(key);
        plan.links.push({ characterId: character.id, techniqueId: technique.id });
      }
    }
  }
  return plan;
}

/**
 * Keeps only the sections of the selected steps. Rows that reference an entity
 * created by a step left out are dropped, so a partial run never writes a
 * dangling id.
 */
export function selectXv2Steps(plan: Xv2Plan, steps: readonly Xv2Step[]): Xv2Plan {
  const on = new Set(steps);
  const newChars = new Set(plan.characters.map((c) => c.id));
  const newTechs = new Set(plan.techniques.map((t) => t.id));
  const charOk = (id: number) => on.has("characters") || !newChars.has(id);
  const techOk = (id: number) => on.has("techniques") || !newTechs.has(id);
  return {
    ...plan,
    techniques: on.has("techniques") ? plan.techniques : [],
    techniqueDescriptions: on.has("techniques") ? plan.techniqueDescriptions : [],
    characters: on.has("characters") ? plan.characters : [],
    meta: on.has("char-meta") ? plan.meta.filter((m) => charOk(m.id)) : [],
    portraits: on.has("portraits") ? plan.portraits : [],
    transformations: on.has("transformations")
      ? plan.transformations.filter((t) => charOk(t.characterId))
      : [],
    links: on.has("char-techniques")
      ? plan.links.filter((l) => charOk(l.characterId) && techOk(l.techniqueId))
      : [],
  };
}

export interface Xv2PlanSummary {
  techniques: number;
  techniqueDescriptions: number;
  characters: number;
  charMeta: number;
  portraits: number;
  transformations: number;
  charTechniques: number;
  unresolvedSkills: number;
  unlinkedForms: number;
}

export function summarizeXv2Plan(plan: Xv2Plan): Xv2PlanSummary {
  return {
    techniques: plan.techniques.length,
    techniqueDescriptions: plan.techniqueDescriptions.length,
    characters: plan.characters.length,
    charMeta: plan.meta.length,
    portraits: plan.portraits.length,
    transformations: plan.transformations.length,
    charTechniques: plan.links.length,
    unresolvedSkills: plan.unresolvedSkills.length,
    unlinkedForms: plan.unlinkedForms.length,
  };
}
