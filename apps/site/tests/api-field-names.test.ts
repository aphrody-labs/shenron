/**
 * JSON keys of the exposed APIs: English names, the former French names kept as deprecated
 * duplicates until version 1.4.0.
 *
 * Two parts. The route tests check each renamed response carries both spellings (the database,
 * session and storage modules are mocked: no real database and no real secret). The guard at the
 * end reads the sources of the routes and fails when a French key appears in a response without
 * being listed, one by one, in an allowlist.
 */
import { beforeEach, describe, expect, mock, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

mock.module("server-only", () => ({}));
mock.module("@/lib/config", () => ({
  API_URL: "http://bot.test",
  ASSET_BASE: "http://bot.test/assets",
  SITE_URL: "https://dragonballfr.com",
}));

// --- database: each `execute` answers the next queued result ----------------
let executeResults: unknown[][] = [];
mock.module("@/lib/db", () => ({
  db: {
    execute: async () => executeResults.shift() ?? [],
    transaction: async () => [],
  },
}));
mock.module("@/lib/pg-unaccent", () => ({ sansAccents: async () => "" }));
const DEFAULT_DATABOOK = {
  id: 4,
  visible: true,
  pages: [
    { number: 1, image: null },
    { number: 2, image: "./assets/wiki/databooks/x.jpg" },
  ],
};
let databook: unknown = DEFAULT_DATABOOK;
mock.module("@/lib/databooks", () => ({
  listDatabooks: async () => ({ items: [] }),
  getDatabook: async () => databook,
  updateDatabook: async () => databook,
  createDatabook: async () => databook,
  deleteDatabook: async () => true,
}));
let indexedTexts: Record<string, string> | null = null;
mock.module("@/lib/databooks-redis", () => ({
  indexDatabook: async () => {},
  readIndexedTextes: async () => indexedTexts,
}));
mock.module("@/lib/databooks-freeze", () => ({ databooksFreeze: () => null }));
mock.module("@/lib/wiki-revisions", () => ({ recordRevision: async () => {} }));
mock.module("@/lib/wiki-revalidate", () => ({ revalidateWikiEntity: () => {} }));

// --- manga-api: one chapter -------------------------------------------------
mock.module("@/lib/db-universe", () => ({
  dbUniverse: {
    mangaChapter: async (id: number) =>
      id === 7
        ? {
            id: 7,
            series: "DB",
            chapter_number: 2,
            title: "Test",
            volume_id: 2,
            cover: null,
            pages: [
              "./assets/manga/DB/regular/vol2/001.webp",
              "./assets/manga/DB/regular/vol2/002.webp",
            ],
            prev: null,
            next: 8,
          }
        : null,
    timeline: async () => [
      {
        kind: "episode",
        id: 5,
        title: "Le réveil",
        titleJa: "目覚め",
        series: "DB",
        era: "DB",
        number: 1,
        date: 0,
        href: "/wiki/episodes/5",
      },
    ],
  },
}));
mock.module("@/lib/chronology-config", () => ({ getChronologyConfig: async () => ({}) }));
mock.module("@/lib/chronology", () => ({
  applyChronology: (items: unknown[]) => items,
  ERA_LABELS: { DB: "Dragon Ball" },
}));
mock.module("@/lib/manga-cors", () => ({ CORS_MANGA: {} }));

// --- entities and OCR review ------------------------------------------------
let isAdmin = true;
mock.module("@/lib/session", () => ({ isCurrentUserAdmin: async () => isAdmin }));
mock.module("@/lib/wiki-admin", () => ({
  TYPES_RATTACHABLES: ["character"],
  chercheEntites: async () => [{ id: 1, nom: "Son Goku" }],
}));
mock.module("@/lib/admin-guard", () => ({
  isAdminUserOrToken: async () => isAdmin,
  adminUserOrToken: async () => ({ allowed: isAdmin, me: { user: { roleAdmin: true } } }),
  hasValidApiToken: (req: Request) => req.headers.get("authorization") === "Bearer test-token",
}));

// --- Japanese anomalies of a databook ---------------------------------------
let anomalies: { total: number; planches: Record<number, unknown[]> } = { total: 0, planches: {} };
mock.module("@/lib/ja", () => ({ anomaliesOuvrage: async () => anomalies }));
mock.module("@/lib/ja/dictionnaire", () => ({ analyseur: async () => null }));

beforeEach(() => {
  isAdmin = true;
  executeResults = [];
  anomalies = { total: 0, planches: {} };
  databook = DEFAULT_DATABOOK;
  indexedTexts = null;
});

describe("/api/manga", () => {
  test("the index carries the English fields and keeps the former ones as duplicates", async () => {
    executeResults = [
      [{ series: "DB", chapitres: 2, planches: 400 }],
      [{ series: "DB", tomes: 42 }],
      [
        {
          id: 5,
          series: "DB",
          volume_number: 1,
          title: "Romance Dawn",
          title_ja: "ロマンス",
          published_at: 1000,
          isbn: "x",
          cover: "c.webp",
          readable_here: true,
        },
      ],
      [{ n: 12 }],
    ];
    const { GET } = await import("../src/app/api/manga/route");
    const body = (await (await GET()).json()) as Record<string, any>;

    expect(body.name).toBe(body.nom);
    expect(body.license).toBe(body.licence);
    expect(body.transcribedPages).toBe(12);
    expect(body.planchesTranscrites).toBe(12);
    expect(body.series[0]).toMatchObject({
      volumes: 42,
      chapters: 2,
      pages: 400,
      tomes: 42,
      chapitres: 2,
      planches: 400,
    });
    expect(body.catalog[0]).toMatchObject({
      number: 1,
      title: "Romance Dawn",
      titleJa: "ロマンス",
      publishedAt: 1000,
      cover: "c.webp",
      readableHere: true,
      numero: 1,
      titre: "Romance Dawn",
      titreJa: "ロマンス",
      datePublication: 1000,
      couverture: "c.webp",
      lectureDisponibleIci: true,
    });
    expect(body.catalogue).toEqual(body.catalog);
    expect(Object.keys(body.routes)).toEqual(
      expect.arrayContaining([
        "volume",
        "chapter",
        "page",
        "pageImage",
        "pageText",
        "search",
        "timeline",
        "tome",
        "chapitre",
        "planche",
        "plancheImage",
        "plancheTexte",
        "recherche",
        "chronologie",
      ]),
    );
    expect(body.routes.page).toBe(body.routes.planche);
    expect(body.examples).toEqual(body.exemples);
  });

  test("a chapter exposes page, pageList, transcribed and the English edition", async () => {
    executeResults = [[{ planche: 1, text: "Kamehameha", lines: null, lang: "fr" }]];
    const { chapitreApi, plancheApi } = await import("../src/lib/manga-api");
    const chapter = await chapitreApi(7);
    expect(chapter).not.toBeNull();
    expect(chapter!.pages).toBe(2);
    expect(chapter!.transcribed).toBe(1);
    expect(chapter!.transcrites).toBe(1);
    expect(chapter!.pageList).toBe(chapter!.planches);
    expect(chapter!.pageList[0]).toMatchObject({ index: 1, page: 1, planche: 1 });
    expect(chapter!.edition).toEqual({
      language: "fr",
      colorization: "bw",
      langue: "fr",
      colorisation: "nb",
    });

    executeResults = [[{ planche: 1, text: "Kamehameha", lines: null, lang: "fr" }]];
    const page = await plancheApi(7, 1);
    expect(page).toMatchObject({ index: 1, page: 1, planche: 1, total: 2 });
  });
});

describe("/api/admin/entities", () => {
  test("answers entities[].name, with entites[].nom as a duplicate", async () => {
    const { GET } = await import("../src/app/api/admin/entities/route");
    const res = await GET(new Request("http://x/api/admin/entities?type=character&q=goku"));
    const body = (await res.json()) as Record<string, any>;
    expect(body.entities).toEqual([{ id: 1, name: "Son Goku", nom: "Son Goku" }]);
    expect(body.entites).toEqual(body.entities);

    const short = await GET(new Request("http://x/api/admin/entities?type=character&q=g"));
    expect(await short.json()).toEqual({ entities: [], entites: [] });
  });
});

async function call(query: string) {
  const { GET } = await import("../src/app/api/databooks/[id]/ocr-review/route");
  return GET(new Request(`http://x/api/databooks/4/ocr-review?${query}`), {
    params: Promise.resolve({ id: "4" }),
  });
}

describe("/api/databooks/:id/ocr-review", () => {
  test("a plate without a scan answers noScan, with sansScan as a duplicate", async () => {
    const body = (await (await call("page=1")).json()) as Record<string, unknown>;
    expect(body).toMatchObject({ id: 4, page: 1, noScan: true, planche: 1, sansScan: true });
    expect(body.regions).toEqual([]);
  });

  test("the regions read carry text and box, with texte and boite as duplicates", async () => {
    const realFetch = globalThis.fetch;
    globalThis.fetch = (async () =>
      Response.json({
        regions: [{ texte: "悟空", score: 0.9, boite: [[0, 0]] }],
        texte: "悟空",
        secondes: 1.5,
        cache: false,
      })) as unknown as typeof fetch;
    try {
      const body = (await (await call("page=2")).json()) as Record<string, any>;
      expect(body).toMatchObject({
        page: 2,
        text: "悟空",
        seconds: 1.5,
        planche: 2,
        texte: "悟空",
        secondes: 1.5,
      });
      expect(body.regions[0]).toEqual({
        text: "悟空",
        score: 0.9,
        box: [[0, 0]],
        texte: "悟空",
        boite: [[0, 0]],
      });
    } finally {
      globalThis.fetch = realFetch;
    }
  });

  test("an unreachable service answers unavailable, with indisponible as a duplicate", async () => {
    const realFetch = globalThis.fetch;
    globalThis.fetch = (async () => {
      throw new Error("down");
    }) as unknown as typeof fetch;
    try {
      const body = (await (await call("planche=2")).json()) as Record<string, unknown>;
      expect(body).toMatchObject({ unavailable: true, indisponible: true, page: 2, planche: 2 });
    } finally {
      globalThis.fetch = realFetch;
    }
  });
});

async function callAnomalies() {
  const { GET } = await import("../src/app/api/databooks/[id]/anomalies/route");
  return GET(new Request("http://x/api/databooks/4/anomalies"), {
    params: Promise.resolve({ id: "4" }),
  });
}

describe("/api/databooks/:id/anomalies", () => {
  const finding = {
    lu: "ベジ-タ",
    attendu: "ベジータ",
    fr: "Végéta",
    kind: "character",
    distance: 1,
  };

  test("serves pages with read/expected and analysisPossible, the French fields as duplicates", async () => {
    anomalies = { total: 1, planches: { 3: [finding] } };
    const body = (await (await callAnomalies()).json()) as Record<string, any>;
    expect(body).toMatchObject({ id: 4, total: 1, analysisPossible: true, analysePossible: true });
    expect(body.pages).toEqual({ "3": [{ ...finding, read: "ベジ-タ", expected: "ベジータ" }] });
    // The former container keeps its former shape.
    expect(body.planches).toEqual({ "3": [finding] });
  });

  test("a databook that could not be analysed says so instead of reporting no finding", async () => {
    const body = (await (await callAnomalies()).json()) as Record<string, any>;
    expect(body).toMatchObject({
      total: 0,
      pages: {},
      planches: {},
      analysisPossible: false,
      analysePossible: false,
    });
  });
});

describe("/api/databooks/search", () => {
  test("each plate carries title, category, number and text, with the French fields as duplicates", async () => {
    executeResults = [
      [
        {
          id: "4",
          title: "Daizenshuu 1",
          category: "guide",
          cover: "c.webp",
          plate_number: 12,
          image: "x.webp",
          plate_text: "悟空がかめはめ波を放つ",
          total: 3,
          databook_count: 2,
        },
      ],
    ];
    const { chercherDansPlanches } = await import("../src/lib/databooks-transcription");
    const result = await chercherDansPlanches("かめはめ波");
    expect(result.total).toBe(3);
    expect(result.databookCount).toBe(2);
    expect(result.fiches).toBe(2);
    expect(result.items[0]).toEqual({
      databookId: 4,
      title: "Daizenshuu 1",
      category: "guide",
      cover: "c.webp",
      number: 12,
      image: "x.webp",
      text: "悟空がかめはめ波を放つ",
      titre: "Daizenshuu 1",
      categorie: "guide",
      numero: 12,
      texte: "悟空がかめはめ波を放つ",
    });
    expect(await chercherDansPlanches("  ")).toEqual({
      items: [],
      total: 0,
      databookCount: 0,
      fiches: 0,
    });
  });
});

describe("/api/admin/databooks/campaign", () => {
  const rows = [
    {
      id: 1,
      title: "Daizenshuu 1",
      category: "guide",
      total_pages: 10,
      transcribed: 8,
      translated: 3,
      faulty: 2,
      ja_chars: 900,
      ja_chars_untranslated: 500,
    },
    {
      id: 2,
      title: "Daizenshuu 2",
      category: null,
      total_pages: 5,
      transcribed: 5,
      translated: 5,
      faulty: 0,
      ja_chars: 400,
      ja_chars_untranslated: 0,
    },
  ];

  test("serves the English totals and works, with the French fields as duplicates", async () => {
    executeResults = [rows];
    const { GET } = await import("../src/app/api/admin/databooks/campaign/route");
    const res = await GET();
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, any>;

    expect(body).toMatchObject({
      totalWorks: 2,
      pendingWorks: 1,
      totalPages: 15,
      transcribedPages: 13,
      translatedPages: 8,
      remainingToTranslate: 5,
      remainingJaChars: 500,
      totalOuvrages: 2,
      ouvragesEnAttente: 1,
      totalPlanches: 15,
      planchesTranscrites: 13,
      planchesTraduites: 8,
      resteATraduire: 5,
      signesJaRestants: 500,
    });
    expect(body.topOuvrages).toEqual(body.topWorks);
    expect(body.topWorks[0]).toEqual({
      id: 1,
      title: "Daizenshuu 1",
      category: "guide",
      totalPages: 10,
      transcribed: 8,
      translated: 3,
      faulty: 2,
      remainingToTranslate: 5,
      remainingJaChars: 500,
      sourceQuality: "average",
      titre: "Daizenshuu 1",
      totalPlanches: 10,
      transcrites: 8,
      traduites: 3,
      fautives: 2,
      resteATraduire: 5,
      signesJaRestants: 500,
      qualiteSource: "moyenne",
    });
    expect(body.topWorks[1]).toMatchObject({ sourceQuality: "sound", qualiteSource: "saine" });
  });

  test("a source with more than 30% of defective plates is flagged to retranscribe", async () => {
    executeResults = [[{ ...rows[0], faulty: 7 }]];
    const { getCampaignStats } = await import("../src/lib/databooks-campaign");
    const stats = await getCampaignStats();
    expect(stats.topWorks[0]).toMatchObject({
      sourceQuality: "to-retranscribe",
      qualiteSource: "a-retranscrire",
    });
  });

  test("refuses a caller that is not an admin", async () => {
    isAdmin = false;
    const { GET } = await import("../src/app/api/admin/databooks/campaign/route");
    expect((await GET()).status).toBe(403);
  });
});

// --- databooks: plate edit, deposit and texts -------------------------------
const BOOK_WITH_TEXT = {
  id: 4,
  visible: true,
  pages: [
    { number: 1, image: "a.jpg", text: "悟空", verifiee: false },
    { number: 2, image: "b.jpg", text: null, verifiee: true },
  ],
};

describe("/api/databooks/:id/pages (PATCH)", () => {
  async function patch(body: unknown) {
    const { PATCH } = await import("../src/app/api/databooks/[id]/pages/route");
    return PATCH(
      new Request("http://x/api/databooks/4/pages", {
        method: "PATCH",
        body: JSON.stringify(body),
      }),
      { params: Promise.resolve({ id: "4" }) },
    );
  }

  test("answers verified, totalPages and transcribedPages, the French names as duplicates", async () => {
    databook = BOOK_WITH_TEXT;
    const res = await patch({ number: 2, verified: true });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      id: 4,
      number: 2,
      text: null,
      verified: true,
      totalPages: 2,
      transcribedPages: 1,
      verifiee: true,
      pagesTotal: 2,
      pagesTranscrites: 1,
    });
  });

  test("still reads the former verifiee flag, and refuses a flag that is not a boolean", async () => {
    databook = BOOK_WITH_TEXT;
    expect((await patch({ number: 2, verifiee: false })).status).toBe(200);
    const refused = await patch({ number: 2, verified: "yes" });
    expect(refused.status).toBe(400);
    expect(((await refused.json()) as { error: string }).error).toContain("verified");
    expect((await patch({ number: 2 })).status).toBe(400);
  });
});

describe("/api/databooks/:id/transcription (POST)", () => {
  test("answers deposited, ignored, duplicates, unknownPages, totalPages and transcribedPages", async () => {
    databook = BOOK_WITH_TEXT;
    const { POST } = await import("../src/app/api/databooks/[id]/transcription/route");
    const res = await POST(
      new Request("http://x/api/databooks/4/transcription", {
        method: "POST",
        headers: { authorization: "Bearer test-token" },
        body: JSON.stringify({
          mode: "merge",
          pages: [
            { number: 1, text: "悟空" },
            { number: 9, text: "ベジータ" },
            { number: 0, text: "number refused" },
            { number: 2, text: "   " },
          ],
        }),
      }),
      { params: Promise.resolve({ id: "4" }) },
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      id: 4,
      mode: "merge",
      deposited: 2,
      ignored: 2,
      duplicates: 0,
      unknownPages: 1,
      totalPages: 2,
      transcribedPages: 1,
      deposees: 2,
      ignorees: 2,
      doublons: 0,
      pagesInconnues: 1,
      pagesTotal: 2,
      pagesTranscrites: 1,
    });
  });
});

describe("/api/databooks/:id/texts (GET)", () => {
  test("answers texts, with textes as a duplicate", async () => {
    indexedTexts = { "1": "悟空" };
    executeResults = [[{ ok: 1 }]];
    const { GET } = await import("../src/app/api/databooks/[id]/texts/route");
    const res = await GET(new Request("http://x/api/databooks/4/texts?pages=1"), {
      params: Promise.resolve({ id: "4" }),
    });
    expect(await res.json()).toEqual({ texts: { "1": "悟空" }, textes: { "1": "悟空" } });
    const none = await GET(new Request("http://x/api/databooks/4/texts"), {
      params: Promise.resolve({ id: "4" }),
    });
    expect(await none.json()).toEqual({ texts: {}, textes: {} });
  });
});

describe("a databook record", () => {
  test("serves each page with verified next to the stored verifiee, and reads both on input", async () => {
    const { databookView, normalizePages } = await import("../src/lib/databooks-rules");
    const view = databookView({ id: 4, pages: normalizePages(BOOK_WITH_TEXT.pages) });
    expect(view.pages.map((p) => [p.verified, p.verifiee])).toEqual([
      [false, false],
      [true, true],
    ]);
    // A page sent as { verified: true } is stored as the flag verifiee.
    expect(normalizePages([{ number: 3, verified: true }])[0]).toMatchObject({ verifiee: true });
    expect(normalizePages([{ number: 3, verifiee: true }])[0]).toMatchObject({ verifiee: true });
    expect(normalizePages([{ number: 3 }])[0]).toMatchObject({ verifiee: false });
  });
});

// --- timeline, canon evidence and admin status ------------------------------
describe("/api/timeline", () => {
  test("serves entries with rank, title, series, era and number, the French names as duplicates", async () => {
    const { GET } = await import("../src/app/api/timeline/route");
    const body = (await (await GET(new Request("http://x/api/timeline"))).json()) as Record<
      string,
      any
    >;
    expect(body).toMatchObject({ total: 1, timelineTotal: 1, totalFrise: 1 });
    expect(body.entrees).toEqual(body.entries);
    expect(body.entries[0]).toMatchObject({
      rank: 1,
      title: "Le réveil",
      titleJa: "目覚め",
      series: "DB",
      era: "DB",
      eraLabel: "Dragon Ball",
      number: 1,
      rang: 1,
      titre: "Le réveil",
      titreJa: "目覚め",
      serie: "DB",
      ere: "DB",
      ereLabel: "Dragon Ball",
      numero: 1,
    });
  });
});

describe("the evidence behind a canon verdict", () => {
  test("serves plates, records and suggestions in English, the French names as duplicates", async () => {
    const { canonEvidenceView } = await import("../src/lib/canon-preuves-view");
    const view = canonEvidenceView({
      planches: [
        {
          databookId: 4,
          databookTitre: "Daizenshuu 1",
          numero: 12,
          image: "x.webp",
          texte: "悟空",
          texteFr: "Goku",
          verifiee: true,
          href: "/wiki/databooks/4#planche-12",
          score: 0.9,
        },
      ],
      fiches: [
        {
          kind: "character",
          titre: "Son Goku",
          extrait: "Un Saiyan",
          href: "/wiki/characters/1",
          score: 1,
          image: null,
          nameJa: "孫悟空",
        },
      ],
      suggestions: [{ titre: "Vegeta", href: "/wiki/canon?q=Vegeta" }],
      mode: "hybrid",
    });
    expect(view.plates[0]).toMatchObject({
      databookTitle: "Daizenshuu 1",
      number: 12,
      text: "悟空",
      textFr: "Goku",
      verified: true,
      databookTitre: "Daizenshuu 1",
      numero: 12,
      texte: "悟空",
      texteFr: "Goku",
      verifiee: true,
    });
    expect(view.records[0]).toMatchObject({
      title: "Son Goku",
      excerpt: "Un Saiyan",
      titre: "Son Goku",
      extrait: "Un Saiyan",
    });
    expect(view.suggestions[0]).toEqual({
      title: "Vegeta",
      href: "/wiki/canon?q=Vegeta",
      titre: "Vegeta",
    });
    expect(view.planches).toBe(view.plates);
    expect(view.fiches).toBe(view.records);
    expect(view.mode).toBe("hybrid");
  });
});

describe("the corpus status of the admin APIs", () => {
  test("serves the totals, pipelines and uploads in English, the French names as duplicates", async () => {
    const { localPipelinesView, progressTotalView, uploadStatusView, uploadSeriesView } =
      await import("../src/lib/admin-status-view");
    expect(
      progressTotalView({
        fiches: 3,
        planches: 40,
        transcrites: 30,
        traduites: 10,
        avecImage: 38,
        fautives: 2,
        signes: 9000,
      }),
    ).toMatchObject({
      books: 3,
      pages: 40,
      transcribed: 30,
      translated: 10,
      withImage: 38,
      faulty: 2,
      japaneseChars: 9000,
      fiches: 3,
      planches: 40,
      transcrites: 30,
      signes: 9000,
    });

    const generated = new Date("2026-10-05T10:00:00Z");
    const local = localPipelinesView({
      databooks: {
        etat: "actif",
        genereLe: generated,
        derniereActivite: null,
        expected: 10,
        images: 9,
        resultats: 8,
        textes: 7,
        restant: 2,
        lotActif: "lot-3",
        runnerPid: 42,
        gpu: { nom: "RTX", memoireUtilisee: "1 Go", memoireTotale: "8 Go", utilisation: "50 %" },
      },
      manga: {
        etat: "arrêté",
        runId: "run-1",
        genereLe: generated,
        pages: 100,
        resultats: 90,
        textes: 80,
        restant: 10,
        aRelire: 4,
        lots: 2,
      },
    });
    expect(local.databooks).toMatchObject({
      state: "actif",
      generatedAt: generated,
      results: 8,
      texts: 7,
      remaining: 2,
      activeBatch: "lot-3",
      gpu: {
        name: "RTX",
        memoryUsed: "1 Go",
        memoryTotal: "8 Go",
        utilization: "50 %",
        nom: "RTX",
      },
      etat: "actif",
      resultats: 8,
      lotActif: "lot-3",
    });
    expect(local.manga).toMatchObject({
      state: "arrêté",
      toReview: 4,
      batches: 2,
      aRelire: 4,
      lots: 2,
    });

    const entry = { serie: "DB", chapitres: 42, chapitresAvecPages: 42, planches: 8000 };
    expect(uploadSeriesView(entry)).toMatchObject({
      series: "DB",
      chapters: 42,
      chaptersWithPages: 42,
      pages: 8000,
      serie: "DB",
      planches: 8000,
    });
    expect(
      uploadStatusView({
        series: [entry],
        chapitres: 42,
        chapitresAvecPages: 42,
        planches: 8000,
        ocrPlanches: 7900,
        ocrPlanchesAvecTexte: 7800,
      }),
    ).toMatchObject({
      chapters: 42,
      pages: 8000,
      ocrPages: 7900,
      ocrPagesWithText: 7800,
      ocrPlanches: 7900,
      series: [{ series: "DB", pages: 8000 }],
    });
  });
});

// ============================================================================
// Guard: no new French key in an exposed JSON response
// ============================================================================
//
// A simple static analysis, not a type checker: it tokenizes the sources of the routes (and of the
// few modules that build their responses), collects the keys of every object literal, and flags
// those that look French. A key is French when it holds an accented letter or one of its words
// (split on camelCase, snake_case and dashes) is in FRENCH_WORDS.
//
// A French key may stay only if it is listed below, for one of two reasons:
//   - FORMER_NAMES: a deprecated duplicate of an English key, removed in 1.4.0 (REMOVAL_VERSION);
//   - INTERNAL_KEYS: never part of a response (an internal object, or the stored data schema).
// Anything else fails: name the key in English and, if clients depend on the old spelling, keep
// the French one as a deprecated duplicate and list it in FORMER_NAMES.

const REMOVAL_VERSION = "1.4.0";

/** French words that are not English words: a key holding one of them is French. */
const FRENCH_WORDS = new Set(
  `planche planches titre titres nom noms texte textes tome tomes chapitre chapitres resultat resultats
erreur erreurs ouvrage ouvrages fiche fiches transcrite transcrites traduite traduites reste signes
deposee deposees ignoree ignorees inconnue inconnues verifiee verifiees indisponible indisponibles
seconde secondes licence catalogue exemple exemples recherche chronologie entree entrees frise preuve
preuves origine admises interdites couverture numero rang extrait extraits lecture disponible ici
boite ere oeuvre oeuvres encyclopedie decouvrir participer espace communaute serie doublon doublons
sans fautive fautives qualite saine moyenne restant restants planete planetes jeu jeux actualite
actualites duree auteur lien liens annee mois heure periode debut valeur cle cles defaut reponse
reponses demande requete parametre parametres appel outil outils carte liste listes lieu lieux
personnage personnages saison saisons categorie langue langues ville villes naissance deces
biographie histoire traduction traductions transcription transcriptions relecture lu attendu
attendue attendus nombre taille poids hauteur largeur couleur couleurs colorisation vivant gagnant
perdant combattant combattants vainqueur douteux douteuse officiel officielle prefere derniere
dernier premier premiere suivant suivante precedent precedente ouvert ouverte supprime supprimee
masque masquee cachee ajoute ajoutee modifie modifiee cree creee racine aucun aucune chaque autre
autres meme memes dont donc mais car puis ainsi alors encore deja jamais toujours inclut ligne
lignes bulle bulles vignette vignettes prix unite unites quantite montant solde niveau niveaux
membre membres salon salons serveur serveurs commande commandes utilisateur utilisateurs joueur
joueurs identifiant identifiants etape etapes ordre sujet sujets regle regles avec contenu corps
etat statut mesure mesures champ champs valeurs analyse entite entites par marque marques destinataire destinataires fichier fichiers jointe`.split(
    /\s+/,
  ),
);

function wordsOfKey(key: string): string[] {
  return key
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_\-.]+/g, " ")
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
}

function isFrenchKey(key: string): boolean {
  if (/[àâäçéèêëîïôöùûüÿœæ]/i.test(key)) return true;
  return wordsOfKey(key).some((word) => FRENCH_WORDS.has(word));
}

type Token = {
  kind: "id" | "str" | "num" | "punct" | "template" | "regex";
  value: string;
  line: number;
};

/** Splits TypeScript source into tokens, skipping comments; strings, templates and regexes stay opaque. */
function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  const length = source.length;
  let at = 0;
  let line = 1;

  const regexAllowed = () => {
    const previous = tokens.at(-1);
    if (!previous) return true;
    if (previous.kind === "num" || previous.kind === "str" || previous.kind === "template")
      return false;
    if (previous.kind === "regex") return false;
    if (previous.kind === "id")
      return ["return", "typeof", "case", "in", "of", "delete", "void", "yield", "await"].includes(
        previous.value,
      );
    return ![")", "]", "}"].includes(previous.value);
  };

  /** Moves `at` past the template literal that starts at `at` (nested `${…}` included). */
  const skipTemplate = () => {
    let depth = 0;
    at++;
    while (at < length) {
      const c = source[at]!;
      if (c === "\\") {
        at += 2;
        continue;
      }
      if (c === "\n") line++;
      if (depth === 0 && c === "`") {
        at++;
        return;
      }
      if (c === "$" && source[at + 1] === "{") {
        depth++;
        at += 2;
        continue;
      }
      if (depth > 0 && c === "}") depth--;
      else if (depth > 0 && c === "`") {
        skipTemplate();
        continue;
      }
      at++;
    }
  };

  while (at < length) {
    const c = source[at]!;
    if (c === "\n") {
      line++;
      at++;
    } else if (c === " " || c === "\t" || c === "\r") {
      at++;
    } else if (c === "/" && source[at + 1] === "/") {
      while (at < length && source[at] !== "\n") at++;
    } else if (c === "/" && source[at + 1] === "*") {
      at += 2;
      while (at < length && !(source[at] === "*" && source[at + 1] === "/")) {
        if (source[at] === "\n") line++;
        at++;
      }
      at += 2;
    } else if (c === '"' || c === "'") {
      let value = "";
      const start = line;
      at++;
      while (at < length && source[at] !== c) {
        if (source[at] === "\\") at++;
        value += source[at] ?? "";
        at++;
      }
      at++;
      tokens.push({ kind: "str", value, line: start });
    } else if (c === "`") {
      const start = line;
      const from = at;
      skipTemplate();
      tokens.push({ kind: "template", value: source.slice(from, at), line: start });
    } else if (c === "/" && regexAllowed()) {
      const from = at;
      let inClass = false;
      at++;
      while (at < length && source[at] !== "\n") {
        const d = source[at]!;
        if (d === "\\") at++;
        else if (d === "[") inClass = true;
        else if (d === "]") inClass = false;
        else if (d === "/" && !inClass) break;
        at++;
      }
      at++;
      while (at < length && /[a-z]/i.test(source[at]!)) at++;
      tokens.push({ kind: "regex", value: source.slice(from, at), line });
    } else if (/[A-Za-z_$]/.test(c)) {
      const from = at;
      while (at < length && /[\w$]/.test(source[at]!)) at++;
      tokens.push({ kind: "id", value: source.slice(from, at), line });
    } else if (/[0-9]/.test(c)) {
      const from = at;
      while (at < length && /[\w.]/.test(source[at]!)) at++;
      tokens.push({ kind: "num", value: source.slice(from, at), line });
    } else {
      const two = source.slice(at, at + 2);
      const operator = source.startsWith("...", at)
        ? "..."
        : ["=>", "?.", "??", "&&", "||"].includes(two)
          ? two
          : c;
      tokens.push({ kind: "punct", value: operator, line });
      at += operator.length;
    }
  }
  return tokens;
}

/** Tokens after which a `{` opens an object literal (anywhere else it opens a block or a type). */
const OBJECT_PRECEDERS = new Set(["(", ",", "[", "=", "?", "...", "||", "&&", "??", "+"]);

type Frame = { kind: "object" | "block" | "array" | "paren"; ternaries: number };

/**
 * The keys of every object literal in `source`, with their line: `{ a: 1, b, "c": 2 }` gives a, b
 * and c. A `{` that follows a type annotation (`p: { titre: string }`) opens a type, not an object:
 * only the colon of a key or of a ternary leads to an object literal.
 */
function objectLiteralKeys(source: string): Array<{ key: string; line: number }> {
  const tokens = tokenize(source);
  const found: Array<{ key: string; line: number }> = [];
  const stack: Frame[] = [];
  let colonOpensObject = false;
  tokens.forEach((token, index) => {
    const previous = tokens[index - 1];
    const next = tokens[index + 1];
    const top = stack.at(-1);
    if (token.kind === "punct") {
      switch (token.value) {
        case "(":
          stack.push({ kind: "paren", ternaries: 0 });
          break;
        case "[":
          stack.push({ kind: "array", ternaries: 0 });
          break;
        case "?":
          // `a?: string` marks an optional member, any other `?` opens a ternary.
          if (top && !(next?.kind === "punct" && next.value === ":")) top.ternaries++;
          break;
        case ":": {
          const startsEntry =
            top?.kind === "object" &&
            index >= 2 &&
            tokens[index - 2]?.kind === "punct" &&
            ["{", ","].includes(tokens[index - 2]!.value);
          if (startsEntry) colonOpensObject = true;
          else if (top && top.ternaries > 0) {
            top.ternaries--;
            colonOpensObject = true;
          } else colonOpensObject = false;
          break;
        }
        case "{": {
          const afterColon = previous?.kind === "punct" && previous.value === ":";
          const opensObject =
            previous !== undefined &&
            (afterColon
              ? colonOpensObject
              : (previous.kind === "punct" && OBJECT_PRECEDERS.has(previous.value)) ||
                (previous.kind === "id" && previous.value === "return"));
          stack.push({ kind: opensObject ? "object" : "block", ternaries: 0 });
          break;
        }
        case ")":
        case "]":
        case "}":
          stack.pop();
          break;
        default:
          break;
      }
      return;
    }
    if ((token.kind !== "id" && token.kind !== "str") || top?.kind !== "object") return;
    const startsEntry =
      previous?.kind === "punct" && (previous.value === "{" || previous.value === ",");
    if (!startsEntry || next?.kind !== "punct") return;
    const isShorthand = token.kind === "id" && (next.value === "," || next.value === "}");
    if (next.value === ":" || isShorthand) found.push({ key: token.value, line: token.line });
  });
  return found;
}

const REPO_ROOT = join(import.meta.dir, "..", "..", "..");

function sourcesToScan(): string[] {
  const glob = (pattern: string) =>
    [...new Bun.Glob(pattern).scanSync({ cwd: REPO_ROOT })].map((file) =>
      file.replaceAll("\\", "/"),
    );
  return [
    ...glob("apps/site/src/app/**/route.ts"),
    // Modules that build a response object out of internal data.
    "apps/site/src/lib/admin-status-view.ts",
    "apps/site/src/lib/canon-preuves-view.ts",
    "apps/site/src/lib/databooks-campaign.ts",
    "apps/site/src/lib/databooks-rules.ts",
    "apps/site/src/lib/manga-api.ts",
    ...glob("apps/bot/src/api/*.ts"),
    ...glob("packages/api/src/**/*.ts"),
  ].toSorted();
}

/** Deprecated duplicates of an English key, served until REMOVAL_VERSION. */
const FORMER_NAMES: Record<string, readonly string[]> = {
  "apps/site/src/app/api/admin/ai/route.ts": ["tome", "planche", "extrait", "preuves"],
  "apps/site/src/app/api/admin/entities/route.ts": ["nom", "entites"],
  "apps/site/src/app/api/canon/route.ts": [
    "sourcesAdmises",
    "sourcesInterdites",
    "parProvenance",
    "origine",
  ],
  "apps/site/src/app/api/databooks/[id]/anomalies/route.ts": ["planches", "analysePossible"],
  "apps/site/src/app/api/databooks/[id]/ocr-review/route.ts": [
    "texte",
    "boite",
    "planche",
    "sansScan",
    "indisponible",
    "secondes",
  ],
  "apps/site/src/app/api/databooks/[id]/pages/route.ts": ["verifiee", "pagesTranscrites"],
  "apps/site/src/app/api/databooks/[id]/texts/route.ts": ["textes"],
  "apps/site/src/app/api/databooks/[id]/transcription/route.ts": [
    "deposees",
    "ignorees",
    "doublons",
    "pagesInconnues",
    "pagesTranscrites",
  ],
  "apps/site/src/app/api/manga/route.ts": [
    "tomes",
    "chapitres",
    "planches",
    "numero",
    "titre",
    "titreJa",
    "couverture",
    "lectureDisponibleIci",
    "tome",
    "chapitre",
    "planche",
    "plancheImage",
    "plancheTexte",
    "recherche",
    "chronologie",
    "tomesLisibles",
    "nom",
    "licence",
    "catalogue",
    "planchesTranscrites",
    "exemples",
  ],
  "apps/site/src/app/api/manga/search/route.ts": ["exemple", "tome", "resultats"],
  "apps/site/src/app/api/timeline/route.ts": [
    "rang",
    "titre",
    "titreJa",
    "serie",
    "ere",
    "ereLabel",
    "numero",
    "totalFrise",
    "entrees",
  ],
  "apps/site/src/lib/canon-preuves-view.ts": [
    "databookTitre",
    "numero",
    "texte",
    "texteFr",
    "verifiee",
    "titre",
    "extrait",
    "planches",
    "fiches",
  ],
  "apps/site/src/lib/databooks-campaign.ts": [
    "titre",
    "totalPlanches",
    "transcrites",
    "traduites",
    "fautives",
    "resteATraduire",
    "signesJaRestants",
    "qualiteSource",
    "totalOuvrages",
    "ouvragesEnAttente",
    "planchesTranscrites",
    "planchesTraduites",
    "topOuvrages",
  ],
  "apps/site/src/lib/manga-api.ts": [
    "tome",
    "planche",
    "transcrites",
    "planches",
    "langue",
    "colorisation",
    "extrait",
    "rang",
  ],
  "apps/bot/src/api/graphql.ts": ["tome", "planche", "planches", "planchesWithJa", "mangaTomes"],
  "apps/bot/src/api/openapi.ts": [
    "tome",
    "planche",
    "planches",
    "planchesWithJa",
    "plancheRange",
    "tomes",
  ],
  "apps/bot/src/api/server.ts": [
    "totalPlanches",
    "planchesAvecTexte",
    "tome",
    "planches",
    "planchesWithJa",
    "plancheRange",
    "tomes",
    "planche",
    "marques",
    "destinataire",
  ],
};

/** French keys that are not part of a response: internal objects and the stored data schema. */
const INTERNAL_KEYS: Record<string, readonly string[]> = {
  // The page objects handed to the databook writer; `verifiee` is the stored jsonb key.
  "apps/site/src/app/api/databooks/[id]/transcription/route.ts": ["verifiee"],
  "apps/site/src/lib/databooks-rules.ts": ["verifiee"],
  // The target handed to the Full Color helper of the bot (`CiblePlanche`, an internal type).
  "apps/bot/src/api/server.ts": ["salonId", "pieceJointeId", "fichier"],
  // The groups of the site map, in a text generator (not a JSON response).
  "apps/site/src/app/llms.txt/route.ts": [
    "decouvrir",
    "encyclopedie",
    "oeuvres",
    "communaute",
    "participer",
    "espace",
  ],
};

/**
 * French keys of a response that still have to be renamed, with a deprecated duplicate. They sit
 * in a file another agent held while the renames were made: rename them, keep the French name as
 * a deprecated duplicate, then move them to FORMER_NAMES.
 */
const NOT_YET_RENAMED: Record<string, readonly string[]> = {};

describe("guard: exposed JSON keys are English", () => {
  const frenchKeysByFile = new Map<string, Map<string, number>>();
  for (const file of sourcesToScan()) {
    const keys = new Map<string, number>();
    for (const { key, line } of objectLiteralKeys(readFileSync(join(REPO_ROOT, file), "utf8"))) {
      if (isFrenchKey(key) && !keys.has(key)) keys.set(key, line);
    }
    if (keys.size > 0) frenchKeysByFile.set(file, keys);
  }
  const allowed = (file: string) =>
    new Set([
      ...(FORMER_NAMES[file] ?? []),
      ...(INTERNAL_KEYS[file] ?? []),
      ...(NOT_YET_RENAMED[file] ?? []),
    ]);

  test("a French key in a response is listed as a deprecated former name or an internal key", () => {
    const unlisted: string[] = [];
    for (const [file, keys] of frenchKeysByFile) {
      for (const [key, line] of keys) {
        if (!allowed(file).has(key)) unlisted.push(`${file}:${line} ${key}`);
      }
    }
    // Name the key in English; keep the French one only as a deprecated duplicate (removed in
    // REMOVAL_VERSION) and list it in FORMER_NAMES, or in INTERNAL_KEYS if no client sees it.
    expect(
      unlisted,
      `French keys to rename (duplicates are removed in ${REMOVAL_VERSION})`,
    ).toEqual([]);
  });

  test("every listed French key is still in its file, so the lists shrink as the duplicates go", () => {
    const stale: string[] = [];
    for (const list of [FORMER_NAMES, INTERNAL_KEYS, NOT_YET_RENAMED]) {
      for (const [file, keys] of Object.entries(list)) {
        for (const key of keys) {
          if (!frenchKeysByFile.get(file)?.has(key)) stale.push(`${file} ${key}`);
        }
      }
    }
    expect(stale).toEqual([]);
  });

  test("every listed file exists and is scanned", () => {
    const scanned = new Set(sourcesToScan());
    const missing = [
      ...Object.keys(FORMER_NAMES),
      ...Object.keys(INTERNAL_KEYS),
      ...Object.keys(NOT_YET_RENAMED),
    ].filter((file) => !scanned.has(file));
    expect(missing).toEqual([]);
  });

  test("the scanner reads object literal keys and nothing else", () => {
    const keys = (source: string) => objectLiteralKeys(source).map((entry) => entry.key);
    expect(
      keys('Response.json({ a: 1, b, "c": [{ d: 2 }], ...rest, e: { f: x ? y : z } })'),
    ).toEqual(["a", "b", "c", "d", "e", "f"]);
    // Blocks, type annotations, strings, templates, comments and regexes hold no key.
    expect(
      keys(
        'if (x) { texte = 1 }\nconst f = (p: { titre: string }) => { return p }\n// { planche: 1 }\nconst s = "{ nom: 1 }" + `${a}{ b: 1 }` + /{ c: 1 }/.source',
      ),
    ).toEqual([]);
    expect(keys("const o = { titre: 1 }")).toEqual(["titre"]);
  });

  test("the dictionary tells French keys from English ones", () => {
    for (const key of [
      "planche",
      "plancheImage",
      "pagesTranscrites",
      "totalPlanches",
      "sans_scan",
      "résumé",
      "texte_fr",
      "qualiteSource",
    ]) {
      expect(isFrenchKey(key), key).toBe(true);
    }
    for (const key of [
      "page",
      "pageList",
      "transcribedPages",
      "totalPages",
      "text",
      "textFr",
      "title_ja",
      "cache-control",
      "Cache-Control",
      "verified",
      "entries",
    ]) {
      expect(isFrenchKey(key), key).toBe(false);
    }
  });
});
