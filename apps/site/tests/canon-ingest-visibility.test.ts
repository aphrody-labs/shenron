/**
 * L'ingestion du corpus de canonicité et la visibilité des citations.
 *
 * Défaut corrigé : l'upsert de `scripts/canon-ingest.ts` remettait
 * `visible = true` à chaque passe (quinze minutes) ; un retrait fait dans
 * `/admin/canon` ne tenait donc pas. Désormais `visible` n'est fixé qu'à la
 * création ; une citation que l'ingestion a elle-même masquée (disparue de sa
 * source, quarantaine de traduction) revient, un retrait éditorial tracé dans
 * `wiki_revisions` jamais. Aucune base : un `sql` simulé enregistre les requêtes.
 */
import { describe, expect, test } from "bun:test";
import type { CanonReference } from "../src/lib/canon-engine";
import { ecrire, planifierIngestion, type Existant } from "../scripts/canon-ingest";

function existants(...lignes: Existant[]): Map<string, Existant> {
  return new Map(lignes.map((l) => [l.id, l]));
}

describe("planifierIngestion", () => {
  test("un retrait éditorial survit à la passe, même si la source a changé", () => {
    const plan = planifierIngestion(
      existants({ id: "a", hash: "h1", visible: false, retraitEditorial: true }),
      [{ id: "a", hash: "h2" }],
    );
    expect(plan.retraitsRespectes).toEqual(["a"]);
    expect(plan.aRetablir).toEqual([]);
    expect(plan.modifiees).toEqual(["a"]);
  });

  test("une citation masquée par l'ingestion revient quand elle réapparaît", () => {
    const plan = planifierIngestion(
      existants({ id: "planche-1-2", hash: "h", visible: false, retraitEditorial: false }),
      [{ id: "planche-1-2", hash: "h" }],
    );
    expect(plan.aRetablir).toEqual(["planche-1-2"]);
    expect(plan.inchangees).toEqual(["planche-1-2"]);
  });

  test("seules les nouvelles citations naissent visibles ; les disparues sont masquées", () => {
    const plan = planifierIngestion(
      existants(
        { id: "connue", hash: "h", visible: true, retraitEditorial: false },
        { id: "partie", hash: "h", visible: true, retraitEditorial: false },
        { id: "deja-masquee", hash: "h", visible: false, retraitEditorial: true },
      ),
      [
        { id: "connue", hash: "h" },
        { id: "neuve", hash: "h" },
      ],
    );
    expect(plan.nouvelles).toEqual(["neuve"]);
    expect(plan.disparues).toEqual(["partie"]);
    expect(plan.aRetablir).toEqual([]);
  });
});

type Requete = { texte: string; valeurs: unknown[] };

/** `sql` de postgres-js simulé : renvoie les lignes connues au premier SELECT. */
function sqlSimule(lignes: Existant[]) {
  const requetes: Requete[] = [];
  const sql = (strings: TemplateStringsArray, ...valeurs: unknown[]) => {
    const texte = strings.join("$").replace(/\s+/g, " ").trim();
    requetes.push({ texte, valeurs });
    const resultat = texte.startsWith("select c.id, c.hash") ? lignes.map((l) => ({ ...l })) : [];
    return Promise.resolve(Object.assign(resultat, { count: 1 }));
  };
  sql.json = (v: unknown) => v;
  sql.unsafe = (fragment: string) => ({ fragment });
  return { sql: sql as unknown as Parameters<typeof ecrire>[0], requetes };
}

function citation(id: string, text = `texte ${id}`): CanonReference {
  return {
    id,
    subject: `Sujet ${id}`,
    keywords: ["cell"],
    text,
    source: "Daizenshuu 2",
    document: "Daizenshuu 2",
    lang: "ja",
    provenance: "databooks",
  };
}

describe("ecrire", () => {
  test("l'upsert ne réécrit jamais la visibilité d'une citation connue", async () => {
    const { sql, requetes } = sqlSimule([
      { id: "retiree", hash: "ancien", visible: false, retraitEditorial: true },
    ]);
    const bilan = await ecrire(sql, "databooks", [citation("retiree"), citation("neuve")], false);
    const upserts = requetes.filter((r) =>
      r.texte.startsWith("insert into public.canon_references"),
    );
    expect(upserts).toHaveLength(2);
    for (const u of upserts) {
      const conflit = u.texte.slice(u.texte.indexOf("on conflict"));
      expect(conflit).not.toMatch(/visible\s*=/);
    }
    expect(requetes.some((r) => /set visible = true/.test(r.texte))).toBe(false);
    expect(bilan).toMatchObject({ inserted: 1, updated: 1, kept: 1, restored: 0 });
  });

  test("le rétablissement rejoue la garde éditoriale dans la requête", async () => {
    const { sql, requetes } = sqlSimule([
      { id: "quarantaine", hash: "x", visible: false, retraitEditorial: false },
    ]);
    await ecrire(sql, "databooks", [citation("quarantaine")], false);
    const retablir = requetes.find((r) => /set visible = true/.test(r.texte));
    expect(retablir?.valeurs[0]).toEqual(["quarantaine"]);
    expect(JSON.stringify(retablir?.valeurs[1])).toContain("wiki_revisions");
  });

  test("la simulation n'écrit rien", async () => {
    const { sql, requetes } = sqlSimule([]);
    const bilan = await ecrire(sql, "databooks", [citation("neuve")], true);
    expect(requetes).toHaveLength(1);
    expect(bilan.inserted).toBe(1);
  });
});
