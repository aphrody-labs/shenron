// SPDX-License-Identifier: Apache-2.0
/**
 * Question bank generated from relation facts supplied by the caller: character and race, character
 * and home planet, technique and character, saga and volumes, databook passage and subject. The
 * facts come from the wiki tables and the databooks (manga, databooks and Toriyama's own statements
 * outrank every other source; Fandom is never one); this module invents none and only checks them.
 *
 * Every fact carries its source (a page link), shown to the players at the reveal.
 */
import { z } from "zod";
import { localizeWith, type DictionaryKey } from "../i18n";
import {
  LocalizedTextSchema,
  PROTOCOL_LIMITS,
  QuizSourceSchema,
  type QuizCategory,
} from "../protocol";
import { randomInt, seededRng, type Rng } from "../rng";
import { createBank, foldText, QuizBankError } from "./bank";
import type { QuizBank, QuizChoice, QuizQuestion } from "./types";

export const RELATIONS = [
  "character_race",
  "character_planet",
  "technique_user",
  "saga_volumes",
  "databook_passage",
] as const;
export type Relation = (typeof RELATIONS)[number];

/** Category each relation feeds. */
export const RELATION_CATEGORY: Readonly<Record<Relation, QuizCategory>> = {
  character_race: "characters",
  character_planet: "characters",
  technique_user: "techniques",
  saga_volumes: "volumes",
  databook_passage: "databooks",
};

const Slug = z.string().regex(/^[A-Za-z0-9_.:-]{1,80}$/);

export const RelationEntitySchema = z.strictObject({ id: Slug, text: LocalizedTextSchema });
export type RelationEntity = z.infer<typeof RelationEntitySchema>;

export const RelationFactSchema = z.strictObject({
  /** Stable fact id; becomes part of the question id, so it must not be renumbered. */
  id: Slug,
  relation: z.enum(RELATIONS),
  /** What the question is about (the character, the technique, the saga, the passage). */
  subject: RelationEntitySchema,
  /** The right answer (the race, the planet, the character, the volumes, the subject). */
  object: RelationEntitySchema,
  source: QuizSourceSchema,
});
export type RelationFact = z.infer<typeof RelationFactSchema>;

export interface RelationBankOptions {
  readonly seed?: string;
}

const LOCALES = ["fr", "en", "ja"] as const;

function sameFace(a: RelationEntity, b: RelationEntity): boolean {
  return LOCALES.some((locale) => foldText(a.text[locale]) === foldText(b.text[locale]));
}

function choiceOf(entity: RelationEntity): QuizChoice {
  return { id: `rel:${entity.id}`, text: entity.text };
}

/** Three objects of the same relation that are not true for the subject and look different. */
function pickWrongObjects(
  answer: RelationEntity,
  pool: readonly RelationEntity[],
  trueObjectIds: ReadonlySet<string>,
  rng: Rng,
): RelationEntity[] | null {
  const chosen: RelationEntity[] = [];
  const acceptable = (candidate: RelationEntity): boolean =>
    !trueObjectIds.has(candidate.id) &&
    !sameFace(candidate, answer) &&
    chosen.every((other) => other.id !== candidate.id && !sameFace(other, candidate));
  for (let attempt = 0; attempt < 60 && chosen.length < 3; attempt++) {
    const candidate = pool[randomInt(rng, pool.length)] as RelationEntity;
    if (acceptable(candidate)) chosen.push(candidate);
  }
  for (const candidate of pool) {
    if (chosen.length >= 3) break;
    if (acceptable(candidate)) chosen.push(candidate);
  }
  return chosen.length === 3 ? chosen : null;
}

/**
 * Builds the relation bank. A fact whose relation has fewer than three other possible answers is
 * skipped (there is nothing plausible to offer). The wrong choices never include another object that
 * is also true for the same subject and relation, so a question has exactly one right answer.
 * Question ids are `rel:<relation>:<fact id>`.
 */
export function buildRelationBank(
  facts: readonly RelationFact[],
  options: RelationBankOptions = {},
): QuizBank {
  const parsed = z.array(RelationFactSchema).safeParse(facts);
  if (!parsed.success)
    throw new QuizBankError(
      `invalid relation facts: ${parsed.error.issues
        .slice(0, 3)
        .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
        .join("; ")}`,
    );
  const seed = options.seed ?? "relation-bank-v1";
  const objectsByRelation = new Map<Relation, Map<string, RelationEntity>>();
  const trueObjects = new Map<string, Set<string>>();
  for (const fact of parsed.data) {
    const objects = objectsByRelation.get(fact.relation) ?? new Map<string, RelationEntity>();
    objects.set(fact.object.id, fact.object);
    objectsByRelation.set(fact.relation, objects);
    const key = `${fact.relation}|${fact.subject.id}`;
    const owned = trueObjects.get(key) ?? new Set<string>();
    owned.add(fact.object.id);
    trueObjects.set(key, owned);
  }

  const questions: QuizQuestion[] = [];
  for (const fact of parsed.data) {
    const pool = [...(objectsByRelation.get(fact.relation)?.values() ?? [])].toSorted((a, b) =>
      a.id.localeCompare(b.id),
    );
    const id = `rel:${fact.relation}:${fact.id}`;
    const wrong = pickWrongObjects(
      fact.object,
      pool,
      trueObjects.get(`${fact.relation}|${fact.subject.id}`) ?? new Set(),
      seededRng(`${seed}|${id}`),
    );
    if (wrong === null) continue;
    const prompt = localizeWith(
      `prompt.relation.${fact.relation}` satisfies DictionaryKey,
      (locale) => ({ subject: fact.subject.text[locale] }),
    );
    // A passage too long to display once wrapped in its question is skipped, not truncated.
    if (LOCALES.some((locale) => prompt[locale].length > PROTOCOL_LIMITS.maxTextLength)) continue;
    const [first, second, third] = wrong as [RelationEntity, RelationEntity, RelationEntity];
    questions.push({
      id,
      category: RELATION_CATEGORY[fact.relation],
      subjectKey: `rel:${fact.subject.id}`,
      prompt,
      answer: choiceOf(fact.object),
      distractors: [choiceOf(first), choiceOf(second), choiceOf(third)],
      source: fact.source,
    });
  }
  return createBank(questions);
}
