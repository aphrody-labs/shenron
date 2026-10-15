// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "bun:test";
import {
  type EvalCase,
  ask,
  inventedReferences,
  looksRefused,
  percentile,
  scoreCase,
  summarize,
} from "./eval-rag-faithfulness";

const DATASET = new URL(
  "../../packages/pipeline/test/ai/fixtures/eval/rag-faithfulness.json",
  import.meta.url,
);

const answerable: EvalCase = {
  id: "t",
  lang: "fr",
  kind: "answerable",
  category: "identity",
  q: "Qui est Kid Buu ?",
  expectAny: ["buu"],
};
const hits = [
  { title: "Kid Buu", url: "https://x/kid-buu", sourceId: "db_characters", content: "Kid Buu." },
  {
    title: "Kid Buu (DBFR)",
    url: "https://x/source-e4c4a3dfc18bba4d7df1",
    sourceId: "wiki_pages",
    content:
      "Cette fiche décrit un document collecté. Elle ne constitue pas une assertion canonique.",
  },
];
const meta = { status: 200, latencyMs: 10 };

describe("eval set", () => {
  it("holds fr, en and ja questions, answerable and out of corpus", async () => {
    const { cases } = (await Bun.file(DATASET).json()) as { cases: EvalCase[] };
    expect(cases.length).toBeGreaterThanOrEqual(12);
    expect(new Set(cases.map((c) => c.id)).size).toBe(cases.length);
    expect(new Set(cases.map((c) => c.lang))).toEqual(new Set(["fr", "en", "ja"]));
    expect(cases.filter((c) => c.kind === "out_of_corpus").length).toBeGreaterThanOrEqual(4);
    expect(cases.some((c) => c.category === "power_comparison")).toBe(true);
    for (const item of cases.filter((c) => c.kind === "answerable")) {
      expect(item.expectAny?.length).toBeGreaterThan(0);
    }
  });
});

describe("scoreCase", () => {
  it("a citation of a returned hit is valid", () => {
    const score = scoreCase(
      answerable,
      {
        answer: "Kid Buu est un monstre [1].",
        hits,
        citations: [{ n: 1, url: "https://x/kid-buu" }],
      },
      meta,
    );
    expect(score.citationValid).toBe(true);
    expect(score.keywordHit).toBe(true);
    expect(score.collectedInTop3).toBe(1);
    expect(score.firstCollectedRank).toBe(2);
  });

  it("a source outside the hits, a dangling marker or no citation at all is invalid", () => {
    const outside = scoreCase(
      answerable,
      { answer: "Kid Buu [1].", hits, citations: [{ n: 1, url: "https://x/ailleurs" }] },
      meta,
    );
    expect(outside.citationValid).toBe(false);
    expect(outside.citationsOutsideHits).toBe(1);
    const dangling = scoreCase(
      answerable,
      { answer: "Kid Buu [3].", hits, citations: [{ n: 1, url: "https://x/kid-buu" }] },
      meta,
    );
    expect(dangling.citationValid).toBe(false);
    expect(scoreCase(answerable, { answer: "Kid Buu.", hits }, meta).citationValid).toBe(false);
  });

  it("an out-of-corpus question must be refused, an answerable one must not", () => {
    const ooc: EvalCase = { ...answerable, kind: "out_of_corpus", q: "Qui est Zorgalax ?" };
    const refused = scoreCase(
      ooc,
      { answer: "Non établi dans les sources : rien.", refusal: true, hits: [] },
      meta,
    );
    expect(refused.refusalCorrect).toBe(true);
    expect(refused.citationValid).toBeNull();
    expect(scoreCase(ooc, { answer: "Zorgalax est un guerrier.", hits }, meta).refusalCorrect).toBe(
      false,
    );
    expect(
      scoreCase(answerable, { answer: "Non établi dans les sources.", hits }, meta).refusalCorrect,
    ).toBe(false);
  });

  it("a failed request counts as no answer", () => {
    const score = scoreCase(
      answerable,
      {},
      { status: 503, latencyMs: 30, error: "llm_unavailable" },
    );
    expect(score.refusalCorrect).toBe(false);
    expect(summarize([score]).failedRequests).toBe(1);
  });
});

describe("helpers", () => {
  it("looksRefused reads the flag, then the localised wording", () => {
    expect(looksRefused({ refusal: true })).toBe(true);
    expect(looksRefused({ answer: "Not established in the sources: nothing." })).toBe(true);
    expect(looksRefused({ answer: "出典では確認できません：なし" })).toBe(true);
    expect(looksRefused({ answer: "Goku est un Saiyan." })).toBe(false);
  });

  it("inventedReferences flags numbers no passage contains", () => {
    const evidence = [{ title: "Épisode 7", content: "Au tome 12, Goku." }];
    expect(inventedReferences("Il apparaît à l'épisode 142 de DBZ Kai.", evidence)).toEqual([
      "épisode 142",
    ]);
    expect(inventedReferences("Voir l'épisode 7 et le tome 12.", evidence)).toEqual([]);
  });

  it("summarize rates citations, refusals and latency", () => {
    const ok = scoreCase(
      answerable,
      { answer: "Kid Buu [1].", hits, citations: [{ n: 1, url: "https://x/kid-buu" }] },
      { status: 200, latencyMs: 100 },
    );
    const bad = scoreCase(
      answerable,
      { answer: "Kid Buu.", hits },
      { status: 200, latencyMs: 300 },
    );
    const summary = summarize([ok, bad]);
    expect(summary.validCitationRate).toBe(0.5);
    expect(summary.answeredWithoutCitation).toBe(1);
    expect(summary.latencyMs).toEqual({ p50: 100, p95: 300, max: 300 });
    expect(percentile([5, 1, 3], 50)).toBe(3);
  });
});

describe("chat transport qualification", () => {
  it("sends the case language to retrieval and generation", async () => {
    let received: unknown;
    const observed: { language: string | null } = { language: null };
    const server = Bun.serve({
      port: 0,
      fetch: async (request) => {
        received = await request.json();
        observed.language = request.headers.get("accept-language");
        return Response.json({ answer: "悟空です。", hits: [], citations: [] });
      },
    });
    try {
      const result = await ask(server.url.href, { ...answerable, lang: "ja" }, "whis", 1000);
      expect(received).toEqual({ q: answerable.q, persona: "whis", lang: "ja" });
      expect(observed.language).toBe("ja");
      expect(result.status).toBe(200);
      expect(result.error).toBeUndefined();
    } finally {
      await server.stop(true);
    }
  });

  it("counts empty, malformed and embedded-error HTTP 200 payloads as failures", async () => {
    const bodies: unknown[] = [
      null,
      {},
      { answer: "" },
      { answer: "Goku", hits: [null] },
      { answer: "Goku", citations: [{ n: "1" }] },
      { answer: "Goku", error: "generation_failed" },
    ];
    const server = Bun.serve({ port: 0, fetch: () => Response.json(bodies.shift()) });
    try {
      for (let index = 0; index < 6; index++) {
        const { response, ...requestMeta } = await ask(server.url.href, answerable, "whis", 1000);
        expect(requestMeta.status).toBe(200);
        expect(requestMeta.error).toBe(index === 5 ? "generation_failed" : "invalid_chat_response");
        expect(summarize([scoreCase(answerable, response, requestMeta)]).failedRequests).toBe(1);
      }
    } finally {
      await server.stop(true);
    }
  });

  it("preserves HTTP failures independently of the JSON body", async () => {
    const server = Bun.serve({
      port: 0,
      fetch: () => new Response("unavailable", { status: 503 }),
    });
    try {
      const result = await ask(server.url.href, answerable, "whis", 1000);
      expect(result.status).toBe(503);
      expect(result.error).toBe("http_503");
    } finally {
      await server.stop(true);
    }
  });
});
