// SPDX-License-Identifier: Apache-2.0
import { describe, expect, test } from "bun:test";
import {
  buildRelationBank,
  mergeBanks,
  PROTOCOL_LIMITS,
  QuizBankError,
  RELATION_CATEGORY,
  type RelationFact,
} from "../src";
import { makeBank } from "./helpers";

const same = (value: string) => ({ fr: value, en: value, ja: value });

const races = [
  ["saiyan", { fr: "Saiyan", en: "Saiyan", ja: "サイヤ人" }],
  ["namekian", { fr: "Namékien", en: "Namekian", ja: "ナメック星人" }],
  ["human", { fr: "Humain", en: "Human", ja: "地球人" }],
  ["majin", { fr: "Majin", en: "Majin", ja: "魔人" }],
  ["angel", { fr: "Ange", en: "Angel", ja: "天使" }],
] as const;

type Entity = readonly [string, { fr: string; en: string; ja: string }];

function fact(
  id: string,
  subject: [string, string],
  object: Entity,
  relation: RelationFact["relation"] = "character_race",
): RelationFact {
  return {
    id,
    relation,
    subject: { id: subject[0], text: same(subject[1]) },
    object: { id: object[0], text: object[1] },
    source: { type: "page", kind: "wiki", url: `https://dragonballfr.com/wiki/${subject[0]}` },
  };
}

const facts = (): RelationFact[] => [
  fact("goku", ["goku", "Son Goku"], races[0]),
  fact("piccolo", ["piccolo", "Piccolo"], races[1]),
  fact("krilin", ["krilin", "Krilin"], races[2]),
  fact("boo", ["boo", "Majin Boo"], races[3]),
  fact("whis", ["whis", "Whis"], races[4]),
];

describe("buildRelationBank", () => {
  test("builds one question per fact, with the fact's source and a prompt in three languages", () => {
    const bank = buildRelationBank(facts());
    expect(bank.size).toBe(5);
    const question = bank.get("rel:character_race:goku")!;
    expect(question.category).toBe("characters");
    expect(question.prompt.fr).toBe("Quelle est la race de « Son Goku » ?");
    expect(question.prompt.en).toBe('What is the race of "Son Goku"?');
    expect(question.prompt.ja).toContain("Son Goku");
    expect(question.answer.text.en).toBe("Saiyan");
    expect(question.source).toEqual({
      type: "page",
      kind: "wiki",
      url: "https://dragonballfr.com/wiki/goku",
    });
    expect(question.distractors.map((d) => d.text.en).toSorted()).not.toContain("Saiyan");
  });

  test("each relation feeds its own category", () => {
    expect(RELATION_CATEGORY).toEqual({
      character_race: "characters",
      character_planet: "characters",
      technique_user: "techniques",
      saga_volumes: "volumes",
      databook_passage: "databooks",
    });
    const bank = buildRelationBank(
      [0, 1, 2, 3].map((i) =>
        fact(`p${i}`, [`t${i}`, `Technique ${i}`], races[i]!, "technique_user"),
      ),
    );
    expect(bank.availableCategories()).toEqual(["techniques"]);
  });

  test("a wrong choice is never another true answer for the same subject", () => {
    // Two characters know the technique: neither may be offered as a wrong choice for the other.
    const shared: RelationFact[] = [
      fact("k-goku", ["kamehameha", "Kamehameha"], races[0], "technique_user"),
      fact("k-gohan", ["kamehameha", "Kamehameha"], races[1], "technique_user"),
      fact("m-piccolo", ["masenko", "Masenko"], races[2], "technique_user"),
      fact("m-boo", ["kikoho", "Kikoho"], races[3], "technique_user"),
      fact("m-whis", ["hakai", "Hakai"], races[4], "technique_user"),
    ];
    for (let seed = 0; seed < 30; seed++) {
      const bank = buildRelationBank(shared, { seed: `s${seed}` });
      const gokuQuestion = bank.get("rel:technique_user:k-goku")!;
      expect(gokuQuestion.distractors.map((d) => d.id)).not.toContain("rel:namekian");
      const gohanQuestion = bank.get("rel:technique_user:k-gohan")!;
      expect(gohanQuestion.distractors.map((d) => d.id)).not.toContain("rel:saiyan");
    }
  });

  test("a choice that reads like the answer is not offered (same text in any language)", () => {
    const lookalike: RelationFact[] = [
      ...facts(),
      fact(
        "clone",
        ["clone", "Clone"],
        ["saiyan-bis", { fr: "SAIYAN", en: "Saiyan!", ja: "別の人" }],
      ),
    ];
    for (let seed = 0; seed < 20; seed++) {
      const question = buildRelationBank(lookalike, { seed: `l${seed}` }).get(
        "rel:character_race:goku",
      )!;
      expect(question.distractors.map((d) => d.id)).not.toContain("rel:saiyan-bis");
    }
  });

  test("not enough other answers: the fact is skipped, not padded", () => {
    expect(buildRelationBank(facts().slice(0, 3)).size).toBe(0);
    expect(buildRelationBank(facts().slice(0, 4)).size).toBe(4);
  });

  test("is deterministic for a seed", () => {
    expect(buildRelationBank(facts(), { seed: "x" }).all()).toEqual(
      buildRelationBank(facts(), { seed: "x" }).all(),
    );
  });

  test("a passage too long once wrapped in its question is skipped, not truncated", () => {
    const long = (id: string, length: number, object: (typeof races)[number]): RelationFact =>
      fact(id, [id, "x".repeat(length)], object, "databook_passage");
    const edge = PROTOCOL_LIMITS.maxTextLength;
    const set = [
      long("fits", 300, races[0]),
      long("too-long", edge - 10, races[1]),
      long("p3", 20, races[2]),
      long("p4", 20, races[3]),
      long("p5", 20, races[4]),
    ];
    const bank = buildRelationBank(set);
    expect(bank.get("rel:databook_passage:fits")).toBeDefined();
    expect(bank.get("rel:databook_passage:too-long")).toBeUndefined();
  });

  test("invalid facts are refused with a bank error naming the problem", () => {
    const base = facts();
    const broken: unknown[] = [
      { ...base[0], source: { type: "page", kind: "wiki", url: "http://insecure.example/x" } },
      { ...base[0], relation: "character_hobby" },
      { ...base[0], id: "bad id" },
      { ...base[0], object: { id: "x", text: { fr: "", en: "a", ja: "b" } } },
      { ...base[0], extra: true },
    ];
    for (const item of broken) {
      expect(() => buildRelationBank([item as RelationFact])).toThrow(QuizBankError);
    }
  });

  test("duplicate fact ids are refused", () => {
    expect(() => buildRelationBank([...facts(), ...facts()])).toThrow(QuizBankError);
  });

  test("can be merged with another bank; a clash of ids is an error", () => {
    const merged = mergeBanks(buildRelationBank(facts()), makeBank(6));
    expect(merged.size).toBe(11);
    expect(merged.availableCategories()).toEqual(["characters", "techniques", "sagas"]);
    expect(() => mergeBanks(makeBank(6), makeBank(6))).toThrow(QuizBankError);
  });
});
