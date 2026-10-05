/**
 * JSON fields of the manga, OCR review, entities, databooks search and campaign
 * APIs: English names, the former French names kept as deprecated duplicates
 * for one version.
 *
 * The database, session and storage modules are mocked: no real database and no
 * real secret.
 */
import { beforeEach, describe, expect, mock, test } from "bun:test";

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
mock.module("@/lib/databooks", () => ({
  listDatabooks: async () => ({ items: [] }),
  getDatabook: async () => ({
    pages: [
      { number: 1, image: null },
      { number: 2, image: "./assets/wiki/databooks/x.jpg" },
    ],
  }),
}));
mock.module("@/lib/databooks-redis", () => ({ indexDatabook: async () => {} }));

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
  },
}));

// --- entities and OCR review ------------------------------------------------
let isAdmin = true;
mock.module("@/lib/session", () => ({ isCurrentUserAdmin: async () => isAdmin }));
mock.module("@/lib/wiki-admin", () => ({
  TYPES_RATTACHABLES: ["character"],
  chercheEntites: async () => [{ id: 1, nom: "Son Goku" }],
}));
mock.module("@/lib/admin-guard", () => ({ isAdminUserOrToken: async () => isAdmin }));

beforeEach(() => {
  isAdmin = true;
  executeResults = [];
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
