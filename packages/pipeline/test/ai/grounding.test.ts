// SPDX-License-Identifier: Apache-2.0
import { describe, expect, test } from "bun:test";
import type { LanguageModelV4GenerateResult } from "@ai-sdk/provider";
import { MockLanguageModelV4 } from "ai/test";
import { generateGroundedAnswer, type GroundedHit, lexiconAliases } from "../../src/ai/generate";
import {
  anchorPassage,
  citationsOf,
  detectLang,
  extractEntities,
  isCanonSource,
  isCollectedDocument,
  type PassageText,
  rankHitsForContext,
  resolveAnswerLang,
  selectContextHits,
  stripCitationMarkers,
  uncoveredEntities,
  verifyAnswer,
} from "../../src/ai/grounding";
import { isNotEstablishedAnswer, NOT_ESTABLISHED, notEstablished } from "../../src/ai/prompts";

const COLLECTED =
  "[Kid Buu — DBFR] > Cette fiche décrit un document collecté. Elle ne constitue pas une assertion canonique.";

const KID_BUU: GroundedHit = {
  id: "a",
  title: "Kid Buu / Majin Buu Pur",
  url: "https://dragonballfr.com/wiki/personnages/kid-buu",
  sourceId: "db_characters",
  content:
    "Kid Buu est la forme originelle de Majin Buu. Il détruit la Terre et affronte Goku et Vegeta.",
};
const BUUHAN: GroundedHit = {
  id: "b",
  title: "Vegetto vs Buuhan",
  url: "https://dragonballfr.com/wiki/combats/battle-vegetto-vs-buuhan",
  sourceId: "narrative_events",
  content: "Super Vegetto ridiculise Buuhan, né de l'absorption de Gohan et de Gotenks.",
};
const COLLECTED_HIT: GroundedHit = {
  id: "c",
  title: "Kid Buu (DBFR)",
  url: "https://dragonballfr.com/wiki/source-e4c4a3dfc18bba4d7df1",
  sourceId: "wiki_pages",
  content: COLLECTED,
};
const SECTION: GroundedHit = {
  id: "d",
  title: "Kid Buu — Histoire",
  url: "https://dragonballfr.com/wiki/personnages/kid-buu#histoire",
  sourceId: "db_wiki_sections",
  content: "Kid Buu se réveille après des millions d'années.",
};

function passages(hits: readonly GroundedHit[]): PassageText[] {
  return hits.map((hit, index) => ({ n: index + 1, hit, text: hit.content ?? "" }));
}

function reply(text: string): LanguageModelV4GenerateResult {
  return {
    content: [{ type: "text", text }],
    finishReason: { unified: "stop", raw: undefined },
    usage: {
      inputTokens: {
        total: undefined,
        noCache: undefined,
        cacheRead: undefined,
        cacheWrite: undefined,
      },
      outputTokens: { total: undefined, text: undefined, reasoning: undefined },
    },
    warnings: [],
  };
}

describe("language", () => {
  test("detects fr, en and ja; an explicit code wins", () => {
    expect(detectLang("Qui est le plus fort, Goku ou Vegeta ?")).toBe("fr");
    expect(detectLang("Who is stronger, Goku or Vegeta?")).toBe("en");
    expect(detectLang("悟空とベジータはどちらが強い？")).toBe("ja");
    expect(resolveAnswerLang("Who is Goku?", "fr-FR")).toBe("fr");
    expect(resolveAnswerLang("Who is Goku?", "xx")).toBe("en");
    expect(resolveAnswerLang("Who is Goku?")).toBe("en");
  });

  test("the refusal exists in fr, en and ja and is recognised", () => {
    for (const lang of ["fr", "en", "ja"] as const) {
      expect(isNotEstablishedAnswer(NOT_ESTABLISHED[lang])).toBe(true);
      expect(isNotEstablishedAnswer(notEstablished(lang, ["Zorgalax"]))).toBe(true);
      expect(notEstablished(lang, ["Zorgalax"])).toContain("Zorgalax");
    }
    expect(isNotEstablishedAnswer("Oh oh, Goku est un Saiyan.")).toBe(false);
  });
});

describe("collected documents behind the canon", () => {
  test("the marker and the url tell a collected document", () => {
    expect(isCollectedDocument(COLLECTED_HIT)).toBe(true);
    expect(isCollectedDocument({ ...COLLECTED_HIT, content: "x", snippet: "" })).toBe(true);
    expect(isCollectedDocument(KID_BUU)).toBe(false);
  });

  test("ranking is stable and keeps every hit", () => {
    const ranked = rankHitsForContext([COLLECTED_HIT, BUUHAN, KID_BUU, SECTION]);
    expect(ranked.map((hit) => hit.id)).toEqual(["a", "d", "b", "c"]);
  });

  test("every db_* encyclopaedia corpus is canon, the games are not", () => {
    const technique = { ...KID_BUU, sourceId: "db_techniques" };
    expect(rankHitsForContext([COLLECTED_HIT, technique]).map((hit) => hit.sourceId)).toEqual([
      "db_techniques",
      "wiki_pages",
    ]);
    expect(isCanonSource("db_locations")).toBe(true);
    expect(isCanonSource("db_games")).toBe(false);
    expect(isCanonSource("wiki_pages")).toBe(false);
  });

  test("with enough solid passages the collected ones leave the context", () => {
    const solid = [KID_BUU, SECTION, BUUHAN];
    expect(selectContextHits([COLLECTED_HIT, ...solid], 6).map((hit) => hit.id)).toEqual([
      "a",
      "d",
      "b",
    ]);
    expect(selectContextHits([COLLECTED_HIT, KID_BUU], 6).map((hit) => hit.id)).toEqual(["a", "c"]);
  });
});

describe("entities", () => {
  test("capitalised names, katakana and Han runs; question words are not entities", () => {
    expect(extractEntities("Qui est Zorgalax ?")).toEqual(["Zorgalax"]);
    expect(extractEntities("Qui est le plus fort, Goku ou Vegeta ?")).toEqual(["Goku", "Vegeta"]);
    expect(extractEntities("Goku est-il plus fort ?")).toEqual(["Goku"]);
    expect(extractEntities("Quand Kid Buu apparaît-il dans DBZ Kai ?")).toEqual(["Kid Buu"]);
    expect(extractEntities("Who is Vrombulon Prime?")).toEqual(["Vrombulon Prime"]);
    expect(extractEntities("ゾルガラックとは誰ですか？")).toEqual(["ゾルガラック"]);
    expect(extractEntities("qui est le roi du monde")).toEqual([]);
  });

  test("an entity is covered by a title or a text, accents and plurals ignored", () => {
    const p = passages([KID_BUU, BUUHAN]);
    expect(uncoveredEntities(["Buuhan", "Vegeta", "Saiyans"], p)).toEqual(["Saiyans"]);
    expect(uncoveredEntities(["Zorgalax", "Véguéta"], p)).toEqual(["Zorgalax", "Véguéta"]);
    expect(uncoveredEntities(["ゾルガラック"], p)).toEqual([]); // no Japanese in the passages
  });

  test("a several-word name is covered by the whole name or by every word, not by one word", () => {
    const p = passages([KID_BUU, BUUHAN]);
    expect(uncoveredEntities(["Kid Buu", "Majin Buu"], p)).toEqual([]);
    expect(uncoveredEntities(["Vrombulon Prime", "Super Vegetto"], p)).toEqual(["Vrombulon Prime"]);
  });

  test("the lexicon names an English or Japanese entity the French passages spell otherwise", () => {
    const genkidama = passages([
      { id: "g", title: "Genkidama", url: "/g", content: "Technique Genkidama (元気玉)." },
    ]);
    expect(uncoveredEntities(["Spirit Bomb"], genkidama)).toEqual(["Spirit Bomb"]);
    expect(uncoveredEntities(["Spirit Bomb"], genkidama, lexiconAliases)).toEqual([]);
    expect(uncoveredEntities(["元気玉"], genkidama, lexiconAliases)).toEqual([]);
    expect(uncoveredEntities(["Zorgalax"], genkidama, lexiconAliases)).toEqual(["Zorgalax"]);
  });
});

describe("citations", () => {
  const p = passages([KID_BUU, BUUHAN, SECTION]);

  test("a citation outside the provided passages is removed or re-pointed", () => {
    const out = verifyAnswer(
      "Buuhan naît de l'absorption de Gohan et de Gotenks [9].",
      "Qui est Buuhan ?",
      p,
    );
    expect(out.answer).toBe("Buuhan naît de l'absorption de Gohan et de Gotenks [2].");
    expect(out.citations.map((c) => c.url)).toEqual([BUUHAN.url]);
    expect(out.report.replaced).toBe(1);
  });

  test("a citation the passage does not support is replaced by the closest passage", () => {
    const out = verifyAnswer(
      "Super Vegetto ridiculise Buuhan né de Gohan et Gotenks [1].",
      "Qui est Buuhan ?",
      p,
    );
    expect(out.citations.map((c) => c.n)).toEqual([2]);
    expect(out.answer).toContain("[2]");
    expect(out.answer).not.toContain("[1]");
  });

  test("a correct citation stays; a missing one is attached to the closest passage", () => {
    const kept = verifyAnswer("Kid Buu est la forme originelle de Majin Buu [1].", "Kid Buu ?", p);
    expect(kept.answer).toBe("Kid Buu est la forme originelle de Majin Buu [1].");
    const attached = verifyAnswer("Kid Buu est la forme originelle de Majin Buu.", "Kid Buu ?", p);
    expect(attached.answer).toBe("Kid Buu est la forme originelle de Majin Buu [1].");
    expect(attached.report.cited).toBe(1);
  });

  test("a sentence that invents a proper noun is dropped", () => {
    const out = verifyAnswer(
      "Buuhan naît de l'absorption de Gohan [2]. Il est un guerrier de la Galaxie 15 connu partout.",
      "Qui est Buuhan ?",
      p,
    );
    expect(out.answer).toBe("Buuhan naît de l'absorption de Gohan [2].");
    expect(out.report.dropped).toBe(1);
  });

  test("persona small talk is neither a claim nor cited", () => {
    const out = verifyAnswer(
      "Oh oh, jeune voyageur ! Kid Buu détruit la Terre [1].",
      "Kid Buu ?",
      p,
    );
    expect(out.answer).toBe("Oh oh, jeune voyageur ! Kid Buu détruit la Terre [1].");
  });

  test("a Source label the model appends is removed", () => {
    const out = verifyAnswer(
      "Kid Buu est la forme originelle de Majin Buu [1]. Source : Kid Buu. *(Source :)*",
      "Kid Buu ?",
      p,
    );
    expect(out.answer).toBe("Kid Buu est la forme originelle de Majin Buu [1].");
    const inline = verifyAnswer(
      "Kid Buu est la forme originelle de Majin Buu (Source) [1].",
      "Kid Buu ?",
      p,
    );
    expect(inline.answer).toBe("Kid Buu est la forme originelle de Majin Buu [1].");
  });

  test("a French answer on Japanese passages cites the passage that names the entity", () => {
    const ja = passages([
      {
        id: "j1",
        title: "魔人ブウ",
        url: "/ja/1",
        content: "魔人ブウは魔導士ビビディが造り出した魔物。",
      },
      { id: "j2", title: "孫悟空", url: "/ja/2", content: "孫悟空はサイヤ人。" },
    ]);
    const anchor = anchorPassage(["魔人ブウ"], ja, lexiconAliases);
    expect(anchor).toBe(1);
    const out = verifyAnswer(
      "Le monstre est né de la magie de Bibidi.",
      "魔人ブウとは何ですか？",
      ja,
      {
        lang: "fr",
        anchor,
      },
    );
    expect(out.answer).toBe("Le monstre est né de la magie de Bibidi [1].");
    expect(out.citations.map((c) => c.url)).toEqual(["/ja/1"]);
  });

  test("markers read back and stripped", () => {
    expect(citationsOf("Kid Buu [1] et Buuhan [2][7].", p).map((c) => c.n)).toEqual([1, 2]);
    expect(stripCitationMarkers("Kid Buu [1] est là [2].")).toBe("Kid Buu est là.");
  });
});

describe("generateGroundedAnswer fidelity", () => {
  const chunks = { contentFor: async () => new Map<string, string>() };

  test("an entity no passage mentions is refused without generating", async () => {
    const model = new MockLanguageModelV4({
      modelId: "m",
      doGenerate: async () => reply("inventé"),
    });
    const out = await generateGroundedAnswer({
      model,
      persona: "whis",
      strict: true,
      question: "Qui est Zorgalax ?",
      hits: [KID_BUU, BUUHAN],
      chunks,
    });
    expect(out.refusal).toBe(true);
    expect(out.citations).toEqual([]);
    expect(out.uncovered).toEqual(["Zorgalax"]);
    expect(isNotEstablishedAnswer(out.answer)).toBe(true);
    expect(model.doGenerateCalls.length).toBe(0);
  });

  test("the refusal follows the question language", async () => {
    const model = new MockLanguageModelV4({ modelId: "m", doGenerate: async () => reply("x") });
    const en = await generateGroundedAnswer({
      model,
      persona: "whis",
      strict: true,
      question: "Who is Zorgalax?",
      hits: [KID_BUU],
      chunks,
    });
    expect(en.answer.startsWith("Not established in the sources")).toBe(true);
    const ja = await generateGroundedAnswer({
      model,
      persona: "whis",
      strict: true,
      question: "Who is Zorgalax?",
      lang: "ja",
      hits: [KID_BUU],
      chunks,
    });
    expect(ja.answer.startsWith("出典では確認できません")).toBe(true);
    const none = await generateGroundedAnswer({
      model,
      persona: "whis",
      strict: true,
      question: "combien de tomes existe-t-il",
      hits: [],
      chunks,
    });
    expect(none.refusal).toBe(true);
  });

  test("without strict (a task with no retrieval) the model answers unchecked", async () => {
    const model = new MockLanguageModelV4({
      modelId: "m",
      doGenerate: async () => reply("Kami est un Namek."),
    });
    const out = await generateGroundedAnswer({
      model,
      persona: "whis",
      question: "Qui est Kami ?",
      hits: [],
      chunks,
    });
    expect(model.doGenerateCalls.length).toBe(1);
    expect(out).toMatchObject({ answer: "Kami est un Namek.", refusal: false, citations: [] });
    expect(String(model.doGenerateCalls[0]?.prompt[0]?.content)).not.toContain(
      "identifiant du passage",
    );
  });

  test("collected documents alone establish nothing: refusal", async () => {
    const model = new MockLanguageModelV4({ modelId: "m", doGenerate: async () => reply("x") });
    const out = await generateGroundedAnswer({
      model,
      persona: "whis",
      strict: true,
      question: "Qu'est-ce que le Kamehameha ?",
      hits: [COLLECTED_HIT, { ...COLLECTED_HIT, id: "c2" }],
      chunks,
    });
    expect(out.refusal).toBe(true);
    expect(model.doGenerateCalls.length).toBe(0);
  });

  test("citations come back verified, with the real source of the passage", async () => {
    const model = new MockLanguageModelV4({
      modelId: "m",
      doGenerate: async () =>
        reply(
          "Oh oh ! Buuhan naît de l'absorption de Gohan et de Gotenks [3]. C'est un guerrier de la Galaxie 15 redoutable.",
        ),
    });
    const out = await generateGroundedAnswer({
      model,
      persona: "whis",
      strict: true,
      question: "Qui est Buuhan ?",
      hits: [COLLECTED_HIT, BUUHAN, KID_BUU, SECTION],
      chunks,
    });
    expect(out.refusal).toBe(false);
    expect(out.answer).toContain("Buuhan naît de l'absorption de Gohan et de Gotenks [");
    expect(out.answer).not.toContain("Galaxie");
    expect(out.citations.length).toBe(1);
    expect(out.citations[0]?.url).toBe(BUUHAN.url);
    const prompt = model.doGenerateCalls[0]?.prompt ?? [];
    expect(String(prompt[0]?.content)).toContain("identifiant du passage");
    const user = JSON.stringify(prompt[1]?.content);
    expect(user).not.toContain("document collecté");
  });

  test("an answer no passage supports is not served: the refusal replaces it", async () => {
    const model = new MockLanguageModelV4({
      modelId: "m",
      doGenerate: async () => reply("Bravo, tu as trouvé la réponse exacte."),
    });
    const out = await generateGroundedAnswer({
      model,
      persona: "whis",
      strict: true,
      question: "Qui est Kid Buu ?",
      hits: [KID_BUU],
      chunks,
    });
    expect(out.refusal).toBe(true);
    expect(out.citations).toEqual([]);
  });

  test("an English name the lexicon knows is not refused", async () => {
    const model = new MockLanguageModelV4({
      modelId: "m",
      doGenerate: async () => reply("The Genkidama gathers energy from every living being [1]."),
    });
    const out = await generateGroundedAnswer({
      model,
      persona: "whis",
      strict: true,
      question: "What is the Spirit Bomb?",
      hits: [
        {
          id: "g",
          title: "Genkidama",
          url: "/wiki/techniques/genkidama",
          sourceId: "db_techniques",
          content:
            "Technique Genkidama (元気玉). Elle rassemble l'énergie de tous les êtres vivants.",
        },
      ],
      chunks,
    });
    expect(model.doGenerateCalls.length).toBe(1);
    expect(out.refusal).toBe(false);
    expect(out.citations.map((c) => c.url)).toEqual(["/wiki/techniques/genkidama"]);
  });

  test("an English question asks for an English answer", async () => {
    const model = new MockLanguageModelV4({
      modelId: "m",
      doGenerate: async () => reply("Kid Buu is the original form of Majin Buu [1]."),
    });
    await generateGroundedAnswer({
      model,
      persona: "whis",
      strict: true,
      question: "Who is Kid Buu?",
      hits: [KID_BUU],
      chunks,
    });
    expect(String(model.doGenerateCalls[0]?.prompt[0]?.content)).toContain("Answer in English.");
  });
});
