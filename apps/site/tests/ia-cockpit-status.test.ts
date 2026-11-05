import { describe, expect, test } from "bun:test";
import {
  SourceNotConfiguredError,
  collectIaCockpit,
  computeRetrievalMetrics,
  mapDiscordMessage,
  mapEvalRow,
  parseBotIaStatus,
  parseGoldSet,
  probeSource,
  resolveRagBackend,
  summarizeAphrodyRagStats,
  summarizeYoloWebProbe,
  type IaCockpitFetchers,
  type SourceSpec,
} from "../src/lib/ia-cockpit";

// Pure status aggregation, parsing and metric arithmetic over synthetic payloads. No retrieval runs
// here and no fixture stands for a retrieval answer: the counters, modes and rankings below are
// invented inputs to the aggregation rules. What the real Shenron RAG answers (health, statistics,
// search probe, hit ranking, evaluation) is covered by admin-ia-rag-live.test.ts.

/** Deterministic clock: every call advances by 7 ms. */
function steppingClock(step = 7): () => number {
  let now = 0;
  return () => {
    const current = now;
    now += step;
    return current;
  };
}

const ok = <T>(label: string, data: T): SourceSpec<T> => ({
  label,
  target: label,
  run: async () => data,
});
const failing = <T>(label: string, error: Error): SourceSpec<T> => ({
  label,
  target: label,
  run: async () => {
    throw error;
  },
});

/** Evaluation row exactly as postgres-js returns it (bigint columns as strings). */
const EVAL_ROW = {
  id: "94",
  recall_1: 0.3837,
  recall_3: 0.6,
  recall_5: 0.8023,
  recall_10: 0.8605,
  mrr: 0.5453,
  ndcg: 0.6149,
  duration_ms: "9165",
  cases_count: "172",
  sidecar_online: "0",
  misses_count: "24",
  created_at: "1790156651492",
};

/** Every source answers with synthetic data; the two engines get distinct counters on purpose. */
function syntheticFetchers(): IaCockpitFetchers {
  return {
    aphrodyHealth: ok("Aphrody AI — santé", { rag: true, llm: false, ocr: false }),
    aphrodyRagStats: ok("Aphrody RAG — statistiques", {
      chunks: 1_000,
      vectors: 900,
      vectorsStored: 1_000,
      sources: 2,
      kinds: [{ kind: "synthetic", count: 1_000, vectors: 900 }],
    }),
    aphrodyRagProbe: ok("Aphrody RAG — sonde", {
      query: "synthetic query",
      mode: "hybrid",
      hits: 1,
    }),
    yoloWeb: ok("YOLO WEB — crawl", {
      server: "io.github.yolo-rs/web-mcp-server 1.0.0",
      tools: 70,
      cdpEndpoint: "http://127.0.0.1:9222",
      cdpBrowser: "Chrome/150.0",
    }),
    botRag: ok("Bot Shenron — index local", {
      chunks: 2_000,
      vectors: 2_000,
      mode: "hybrid",
      builtAt: "2026-01-01T00:00:00.000Z",
      gatewayReady: true,
    }),
    evalHistory: ok("Historique", [mapEvalRow(EVAL_ROW)]),
    goldSet: ok("Jeu doré", {
      cases: 172,
      sample: [{ q: "Qui est Goku ?", expected: ["/wiki/characters/son-goku"] }],
    }),
    feedbacks: ok("Retours", { total: 48, pending: 3, rows: [] }),
    goals: ok("Objectifs", { active: 2, rows: [] }),
    labMessages: ok("Discord", []),
    agentKeys: ok("Clés", []),
  };
}

describe("probeSource — chaque source rend son propre état", () => {
  test("succès : données validées et latence mesurée", async () => {
    const report = await probeSource(ok("A", { n: 1 }), steppingClock());
    expect(report).toEqual({
      label: "A",
      target: "A",
      status: "ok",
      latencyMs: 7,
      data: { n: 1 },
      error: null,
    });
  });

  test("échec : indisponible avec le message d'erreur, jamais de données de repli", async () => {
    const report = await probeSource(
      failing(
        "Aphrody RAG — statistiques",
        new Error("Aphrody compute HTTP 404 on /api/v1/shenron/rag/stats"),
      ),
      steppingClock(),
    );
    expect(report.status).toBe("unavailable");
    expect(report.data).toBeNull();
    expect(report.error).toBe("Aphrody compute HTTP 404 on /api/v1/shenron/rag/stats");
    expect(report.latencyMs).toBe(7);
  });

  test("configuration absente : non configuré, sans latence", async () => {
    const report = await probeSource(
      failing("Web", new SourceNotConfiguredError("YOLO_WEB_CLI absent")),
    );
    expect(report.status).toBe("unconfigured");
    expect(report.latencyMs).toBeNull();
    expect(report.error).toBe("YOLO_WEB_CLI absent");
  });

  test("délai dépassé : nommé comme tel", async () => {
    const timeout = new DOMException("The operation timed out.", "TimeoutError");
    const report = await probeSource({
      label: "T",
      target: "T",
      run: () => Promise.reject(timeout),
    });
    expect(report.error).toBe("Délai de réponse dépassé");
  });
});

describe("resolveRagBackend — même règle que usesAphrodyRag()", () => {
  test("non défini → moteur local du bot", () => {
    expect(resolveRagBackend(undefined)).toEqual({
      value: "local",
      raw: null,
      engine: "Bot Shenron (index local)",
    });
  });
  test("aphrody → Aphrody AI", () => {
    expect(resolveRagBackend("aphrody")).toEqual({
      value: "aphrody",
      raw: "aphrody",
      engine: "Aphrody AI",
    });
  });
  test("toute autre valeur reste locale mais est affichée telle quelle", () => {
    expect(resolveRagBackend(" aphrody")).toMatchObject({ value: "local", raw: " aphrody" });
  });
});

describe("collectIaCockpit — règles d'agrégation sur des rapports de sources synthétiques", () => {
  test("toutes sources OK, backend local : compteurs et mode du bot", async () => {
    const report = await collectIaCockpit(
      syntheticFetchers(),
      resolveRagBackend(undefined),
      steppingClock(),
    );
    expect(report.summary.status).toBe("ok");
    expect(report.summary.failing).toEqual([]);
    expect(report.summary.serving).toEqual({
      engine: "Bot Shenron (index local)",
      source: "botRag",
      status: "ok",
      error: null,
    });
    expect(report.summary.countsSource).toBe("botRag");
    expect(report.summary.documents).toBe(2_000);
    expect(report.summary.mode).toBe("hybrid");
    expect(report.summary.goldCases).toBe(172);
    expect(report.summary.latestEval?.recall5).toBe(0.8023);
    expect(report.summary.pendingFeedbacks).toBe(3);
    expect(report.summary.activeGoals).toBe(2);
  });

  test("backend aphrody : compteurs de la source statistiques, mode de la source sonde", async () => {
    const report = await collectIaCockpit(syntheticFetchers(), resolveRagBackend("aphrody"));
    expect(report.summary.serving.source).toBe("aphrodyRagProbe");
    expect(report.summary.countsSource).toBe("aphrodyRagStats");
    expect(report.summary.documents).toBe(1_000);
    expect(report.summary.vectors).toBe(900);
    expect(report.summary.mode).toBe("hybrid");
  });

  test("backend aphrody, sonde en échec : moteur servi indisponible, compteurs conservés", async () => {
    const fetchers = syntheticFetchers();
    fetchers.aphrodyRagProbe = failing(
      "Aphrody RAG — sonde",
      new Error("Aphrody compute HTTP 503 on /api/v1/shenron/rag/search"),
    );
    const report = await collectIaCockpit(fetchers, resolveRagBackend("aphrody"));
    expect(report.summary.serving).toMatchObject({
      source: "aphrodyRagProbe",
      status: "unavailable",
      error: "Aphrody compute HTTP 503 on /api/v1/shenron/rag/search",
    });
    expect(report.summary.documents).toBe(1_000);
    expect(report.summary.mode).toBeNull();
    expect(report.summary.status).toBe("degraded");
  });

  test("sources en échec ou non configurées : signalées une à une, jamais remplacées par une valeur", async () => {
    const fetchers = syntheticFetchers();
    fetchers.aphrodyRagStats = failing(
      "Aphrody RAG — statistiques",
      new Error("Aphrody compute HTTP 404 on /api/v1/shenron/rag/stats"),
    );
    fetchers.aphrodyRagProbe = ok("Aphrody RAG — sonde", {
      query: "synthetic query",
      mode: "lexical",
      hits: 1,
    });
    fetchers.yoloWeb = failing(
      "YOLO WEB — crawl",
      new SourceNotConfiguredError("YOLO_WEB_CLI absent de l'environnement du site"),
    );
    fetchers.feedbacks = failing("Retours", new Error("connect ECONNREFUSED"));

    const report = await collectIaCockpit(fetchers, resolveRagBackend("aphrody"));

    expect(report.summary.status).toBe("degraded");
    expect(report.summary.failing.map((f) => [f.key, f.status])).toEqual([
      ["aphrodyRagStats", "unavailable"],
      ["yoloWeb", "unconfigured"],
      ["feedbacks", "unavailable"],
    ]);
    // The probe source still answers: serving is ok, but the counters of the failed source are unknown, not zero.
    expect(report.summary.serving.status).toBe("ok");
    expect(report.summary.documents).toBeNull();
    expect(report.summary.vectors).toBeNull();
    expect(report.summary.mode).toBe("lexical");
    expect(report.summary.pendingFeedbacks).toBeNull();
    expect(report.sources.feedbacks.data).toBeNull();
    // Other sources are unaffected by the failures.
    expect(report.sources.aphrodyHealth.data).toEqual({ rag: true, llm: false, ocr: false });
    expect(report.sources.botRag.status).toBe("ok");
    expect(report.summary.latestEval?.casesCount).toBe(172);
  });

  test("moteur local en panne : le moteur servi est signalé indisponible", async () => {
    const fetchers = syntheticFetchers();
    fetchers.botRag = failing(
      "Bot Shenron — index local",
      new Error("Bot HTTP 502 sur /api/ia/status"),
    );
    const report = await collectIaCockpit(fetchers, resolveRagBackend(undefined));
    expect(report.summary.serving).toMatchObject({
      status: "unavailable",
      error: "Bot HTTP 502 sur /api/ia/status",
    });
    expect(report.summary.documents).toBeNull();
    expect(report.summary.mode).toBeNull();
  });

  test("les sources sont interrogées en parallèle", async () => {
    const fetchers = syntheticFetchers();
    let inFlight = 0;
    let peak = 0;
    for (const key of Object.keys(fetchers) as Array<keyof IaCockpitFetchers>) {
      const original = fetchers[key];
      (fetchers as unknown as Record<string, SourceSpec<unknown>>)[key] = {
        ...original,
        run: async () => {
          inFlight++;
          peak = Math.max(peak, inFlight);
          await Bun.sleep(5);
          inFlight--;
          return (original as SourceSpec<unknown>).run();
        },
      };
    }
    await collectIaCockpit(fetchers, resolveRagBackend(undefined));
    expect(peak).toBe(Object.keys(fetchers).length);
  });
});

describe("parseurs de charges utiles d'exemple", () => {
  test("bot.rag_eval_history : colonnes bigint converties, date ISO", () => {
    expect(mapEvalRow(EVAL_ROW)).toEqual({
      id: 94,
      createdAt: new Date(1790156651492).toISOString(),
      casesCount: 172,
      recall1: 0.3837,
      recall3: 0.6,
      recall5: 0.8023,
      recall10: 0.8605,
      mrr: 0.5453,
      ndcg: 0.6149,
      durationMs: 9165,
      sidecarOnline: false,
      missesCount: 24,
    });
    expect(() => mapEvalRow({ ...EVAL_ROW, mrr: "n/a" })).toThrow("Colonne mrr invalide");
  });

  test("bot /api/ia/status", () => {
    const status = parseBotIaStatus({
      gatewayReady: true,
      wsLatency: 103,
      dbLatency: 0.08,
      ragReady: true,
      rag: { chunks: 59995, vectors: 59995, mode: "hybrid", builtAt: "2026-09-16T05:28:53.630Z" },
      ok: true,
    });
    expect(status).toEqual({
      chunks: 59995,
      vectors: 59995,
      mode: "hybrid",
      builtAt: "2026-09-16T05:28:53.630Z",
      gatewayReady: true,
    });
    expect(() => parseBotIaStatus({ ok: false, error: "sqlite locked" })).toThrow("sqlite locked");
    expect(() => parseBotIaStatus({ ok: true })).toThrow("Statut RAG du bot invalide");
  });

  test("Aphrody /rag/stats : regroupement par type d'un relevé d'exemple", () => {
    expect(
      summarizeAphrodyRagStats({
        chunks: 10,
        vectors: 6,
        vectorsStored: 8,
        sources: [
          { kind: "character", count: 4, vectors: 2 },
          { kind: "technique", count: 5, vectors: 4 },
          { kind: "character", count: 1, vectors: undefined },
        ],
      }),
    ).toEqual({
      chunks: 10,
      vectors: 6,
      vectorsStored: 8,
      sources: 3,
      kinds: [
        { kind: "character", count: 5, vectors: 2 },
        { kind: "technique", count: 5, vectors: 4 },
      ],
    });
  });

  test("sonde YOLO WEB : handshake MCP, outils et version CDP", () => {
    const probe = {
      server: { name: "io.github.yolo-rs/web-mcp-server", version: "1.0.0" },
      tools: 70,
      hasBrowserTools: true,
      cdp: { endpoint: "http://127.0.0.1:9222", browser: "Chrome/150.0" },
    };
    expect(summarizeYoloWebProbe(probe)).toEqual({
      server: "io.github.yolo-rs/web-mcp-server 1.0.0",
      tools: 70,
      cdpEndpoint: "http://127.0.0.1:9222",
      cdpBrowser: "Chrome/150.0",
    });
    expect(() => summarizeYoloWebProbe({ ...probe, hasBrowserTools: false })).toThrow(
      "outils browser_*",
    );
    expect(() => summarizeYoloWebProbe({ ...probe, tools: 0 })).toThrow("outils browser_*");
  });

  test("message Discord : auteur, texte ou titre d'embed", () => {
    expect(
      mapDiscordMessage({
        id: "1",
        author: { username: "shenron", global_name: "Shenron" },
        content: "",
        embeds: [{ title: "RAPPORT", description: "Recall@5 80 %" }],
        timestamp: "2026-09-23T09:44:11.492Z",
      }),
    ).toEqual({
      id: "1",
      author: "Shenron",
      content: "RAPPORT — Recall@5 80 %",
      timestamp: "2026-09-23T09:44:11.492Z",
    });
  });
});

describe("jeu doré et arithmétique des métriques (classements synthétiques, aucune récupération ; définitions de apps/bot/src/lib/rag-eval.ts)", () => {
  const gold = parseGoldSet(
    [
      '{"q":"Qui est Freezer ?","expectUrl":["/wiki/characters/freezer"]}',
      "// commentaire",
      '{"q":"Kamehameha","expect":["kamehameha"]}',
      "ligne invalide",
      '{"q":"sans attente"}',
    ].join("\n"),
  );

  test("lignes invalides, commentaires et cas sans attente ignorés", () => {
    expect(gold.map((c) => c.q)).toEqual(["Qui est Freezer ?", "Kamehameha"]);
  });

  test("URL attendue avec frontière de chemin, rang, MRR, rappel", () => {
    const metrics = computeRetrievalMetrics(
      [
        {
          case: gold[0]!,
          hits: [
            { title: "Freezer du futur", snippet: "", url: "/wiki/characters/freezer-futur" },
            {
              title: "Freezer",
              snippet: "",
              url: "https://dragonballfr.com/wiki/characters/freezer/",
            },
          ],
        },
        { case: gold[1]!, hits: [{ title: "Autre", snippet: "rien", url: "/wiki/x" }] },
      ],
      42,
    );
    expect(metrics.cases).toBe(2);
    expect(metrics.recall).toEqual({ 1: 0, 3: 0.5, 5: 0.5, 10: 0.5 });
    expect(metrics.mrr).toBe(0.25);
    expect(metrics.ndcg).toBe(Number((1 / Math.log2(3) / 2).toFixed(4)));
    expect(metrics.durationMs).toBe(42);
    expect(metrics.misses).toEqual([
      { q: "Kamehameha", expected: ["kamehameha"], returnedTitle: "Autre" },
    ]);
  });
});
