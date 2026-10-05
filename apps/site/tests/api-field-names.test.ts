/**
 * Champs JSON des API manga, relecture OCR et entités : noms anglais, anciens
 * noms français gardés en doublon déprécié le temps d'une version.
 *
 * Les modules de base, de session et de stockage sont simulés : aucune base ni
 * aucun secret réel.
 */
import { beforeEach, describe, expect, mock, test } from "bun:test";

mock.module("server-only", () => ({}));
mock.module("@/lib/config", () => ({
  API_URL: "http://bot.test",
  ASSET_BASE: "http://bot.test/assets",
  SITE_URL: "https://dragonballfr.com",
}));

// --- /api/manga (index) -----------------------------------------------------
let executeResults: unknown[][] = [];
mock.module("@/lib/db", () => ({
  db: {
    execute: async () => executeResults.shift() ?? [],
    transaction: async () => [],
  },
}));
mock.module("@/lib/pg-unaccent", () => ({ sansAccents: async () => "" }));

// --- manga-api (chapitre) ---------------------------------------------------
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

// --- entités et relecture OCR ----------------------------------------------
let isAdmin = true;
mock.module("@/lib/session", () => ({ isCurrentUserAdmin: async () => isAdmin }));
mock.module("@/lib/wiki-admin", () => ({
  TYPES_RATTACHABLES: ["character"],
  chercheEntites: async () => [{ id: 1, nom: "Son Goku" }],
}));
mock.module("@/lib/admin-guard", () => ({ isAdminUserOrToken: async () => isAdmin }));
mock.module("@/lib/databooks", () => ({
  getDatabook: async () => ({
    pages: [
      { number: 1, image: null },
      { number: 2, image: "./assets/wiki/databooks/x.jpg" },
    ],
  }),
}));

beforeEach(() => {
  isAdmin = true;
  executeResults = [];
});

describe("/api/manga", () => {
  test("l'index porte les champs anglais et garde les anciens en doublon", async () => {
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

  test("un chapitre expose page, pageList, transcribed et l'édition en anglais", async () => {
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
  test("rend entities[].name, avec entites[].nom en doublon", async () => {
    const { GET } = await import("../src/app/api/admin/entities/route");
    const res = await GET(new Request("http://x/api/admin/entities?type=character&q=goku"));
    const body = (await res.json()) as Record<string, any>;
    expect(body.entities).toEqual([{ id: 1, name: "Son Goku", nom: "Son Goku" }]);
    expect(body.entites).toEqual(body.entities);

    const short = await GET(new Request("http://x/api/admin/entities?type=character&q=g"));
    expect(await short.json()).toEqual({ entities: [], entites: [] });
  });
});

describe("/api/databooks/:id/ocr-review", () => {
  const call = async (query: string) => {
    const { GET } = await import("../src/app/api/databooks/[id]/ocr-review/route");
    return GET(new Request(`http://x/api/databooks/4/ocr-review?${query}`), {
      params: Promise.resolve({ id: "4" }),
    });
  };

  test("une planche sans scan répond noScan, avec sansScan en doublon", async () => {
    const body = (await (await call("page=1")).json()) as Record<string, unknown>;
    expect(body).toMatchObject({ id: 4, page: 1, noScan: true, planche: 1, sansScan: true });
    expect(body.regions).toEqual([]);
  });

  test("les régions lues portent text et box, texte et boite en doublon", async () => {
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

  test("un service injoignable répond unavailable, avec indisponible en doublon", async () => {
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
