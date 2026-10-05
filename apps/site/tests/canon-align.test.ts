/**
 * Alignement de la doctrine de production sur celle du dépôt
 * (`scripts/canon-align.ts`), sans base ni réseau extérieur : un faux site
 * local répond à `GET`/`PUT /api/canon-config`.
 */
import { afterAll, describe, expect, test } from "bun:test";
import { join } from "node:path";
import { DEFAULT_CANON_CONFIG, type CanonConfig } from "../src/lib/canon-engine";
import {
  construireCorpsAlignement,
  correctifCitationsDeploye,
  diffDoctrine,
  ENTREES_REVUES,
  PREFIXE_PARAPHRASE,
  verifierPoints,
} from "../scripts/canon-align";

const JETON = "jeton-de-test-canon-align-0123456789";

/** Une doctrine de production en retard sur le dépôt, comme relevé par la revue. */
function prodEnRetard(): CanonConfig {
  const prod = structuredClone(DEFAULT_CANON_CONFIG);
  const e = (id: string) => prod.entries.find((x) => x.id === id)!;
  e("c16-fils-gero").sources.push("Super Exciting Guide");
  e("daima").verdict = "Ancien verdict de production.";
  e("fillers-anime-garlic-paikuhan").sources = ["Fandom"];
  e("gregory-kaio").sources = ["Wiki"];
  e("piccolo-favori").sources.push("docs/toriyama-interviews.md");
  for (const id of ["piccolo-favori", "broly-dbz-1993", "goku-saiyan-kakarotto"]) {
    const q = e(id).toriyamaQuote!;
    q.source = q.source.replace(PREFIXE_PARAPHRASE, "");
  }
  prod.tiers[0]!.label = "Ancien libellé";
  prod.doctrine = prod.doctrine.slice(1);
  prod.sourcesInterdites = ["Fandom, sauf images officielles"];
  prod.entries.push({ ...structuredClone(e("daima")), id: "sujet-propre-a-la-prod" });
  prod.heuristics = prod.heuristics.slice(0, 2);
  prod.references = [
    {
      id: "saisie-manuelle",
      subject: "Saisie",
      keywords: ["cell"],
      text: "Texte saisi à la main.",
      source: "Daizenshuu 2",
      document: "",
      lang: "fr",
      provenance: "manuel",
    },
    {
      id: "manga-vol-dbz_anime_comics-3",
      subject: "Tome",
      keywords: ["cell"],
      text: "Texte",
      source: "Manga",
      document: "",
      lang: "ja",
      provenance: "manga",
      updatedAt: "2026-10-01T08:00:00.000Z",
    },
  ];
  return prod;
}

describe("doctrine du dépôt", () => {
  test("elle porte déjà les sept corrections de la revue et Fandom interdit sans condition", () => {
    const echecs = verifierPoints(DEFAULT_CANON_CONFIG).filter((p) => !p.ok);
    expect(echecs).toEqual([]);
    for (const id of ENTREES_REVUES) {
      expect(DEFAULT_CANON_CONFIG.entries.some((e) => e.id === id)).toBe(true);
    }
  });
});

describe("construireCorpsAlignement", () => {
  test("le corps reprend le dépôt et conserve ce qui n'appartient qu'à la production", () => {
    const prod = prodEnRetard();
    expect(verifierPoints(prod).filter((p) => !p.ok).length).toBeGreaterThan(5);
    const corps = construireCorpsAlignement(prod);
    expect(verifierPoints(corps).filter((p) => !p.ok)).toEqual([]);
    expect(corps.entries.some((e) => e.id === "sujet-propre-a-la-prod")).toBe(true);
    expect(corps.heuristics).toHaveLength(2);
    expect(corps.references.map((r) => r.id)).toEqual(["saisie-manuelle"]);
    const diff = diffDoctrine(prod, corps).join("\n");
    expect(diff).toContain("entries[c16-fils-gero].sources");
    expect(diff).toContain("tiers[CANON_ABSOLU].label");
  });

  test("--entrees restreint les sujets réalignés", () => {
    const corps = construireCorpsAlignement(prodEnRetard(), DEFAULT_CANON_CONFIG, {
      entrees: ["c16-fils-gero"],
    });
    expect(corps.entries.find((e) => e.id === "daima")?.verdict).toBe(
      "Ancien verdict de production.",
    );
    expect(corps.entries.find((e) => e.id === "c16-fils-gero")?.sources).toEqual(
      DEFAULT_CANON_CONFIG.entries.find((e) => e.id === "c16-fils-gero")?.sources,
    );
  });

  test("le correctif se détecte à l'updatedAt des citations ingérées", () => {
    const prod = prodEnRetard();
    expect(correctifCitationsDeploye(prod)).toBe(true);
    prod.references = prod.references.map(({ updatedAt: _u, ...r }) => r);
    expect(correctifCitationsDeploye(prod)).toBe(false);
  });
});

describe("script", () => {
  let config = prodEnRetard();
  const puts: unknown[] = [];
  const serveur = Bun.serve({
    port: 0,
    async fetch(req) {
      if (req.headers.get("authorization") !== `Bearer ${JETON}`) {
        return Response.json({ error: "Forbidden" }, { status: 403 });
      }
      if (req.method === "PUT") {
        const corps = (await req.json()) as CanonConfig;
        puts.push(corps);
        config = { ...corps, references: [...corps.references, ...config.references.slice(1)] };
        return Response.json({ ok: true, config });
      }
      return Response.json({ config, defaults: DEFAULT_CANON_CONFIG });
    },
  });
  afterAll(() => serveur.stop(true));

  async function lancer(...args: string[]) {
    const p = Bun.spawn(
      [
        "bun",
        join(import.meta.dir, "..", "scripts", "canon-align.ts"),
        "--base",
        serveur.url.origin,
        ...args,
      ],
      {
        env: { ...process.env, SHENRON_ADMIN_TOKEN: JETON, DATABASE_URL: "" },
        stdout: "pipe",
        stderr: "pipe",
      },
    );
    const [sortie, erreurs, code] = await Promise.all([
      new Response(p.stdout).text(),
      new Response(p.stderr).text(),
      p.exited,
    ]);
    return { sortie: sortie + erreurs, code };
  }

  test("simulation : diff affiché, rien d'enregistré, jeton jamais affiché", async () => {
    const { sortie, code } = await lancer();
    expect(code).toBe(0);
    expect(sortie).toContain("(simulation)");
    expect(sortie).toContain("entries[c16-fils-gero].sources");
    expect(sortie).not.toContain(JETON);
    expect(puts).toHaveLength(0);
  });

  test("--write enregistre exactement le corps construit, puis vérifie la production", async () => {
    const attendu = construireCorpsAlignement(config);
    const { sortie, code } = await lancer("--write");
    expect(sortie).not.toContain(JETON);
    expect(puts).toEqual([JSON.parse(JSON.stringify(attendu))]);
    expect(sortie).toContain("Production alignée.");
    expect(code).toBe(0);
  });
});
