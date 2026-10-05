/**
 * Section « faits Dragon Ball » des instantanés du plugin (`build-references.ts`).
 *
 * Ne retient que des données embarquées dans le dépôt, publiques, et dont
 * CHAQUE enregistrement porte sa source (ouvrage et planche, chapitre du
 * manga, page d'éditeur). Ce que le dépôt ne sait qu'en base, ou sans source
 * par enregistrement (chronologie en années, bornes des sagas, races,
 * transformations, fiches de personnages), reste vide et est déclaré comme tel :
 * « non établi » plutôt qu'une liste plausible.
 *
 * Écarté exprès (voir le registre `non_embarque`) : les remplissages de base
 * non sourcés (`seed-arcs.ts`, `seed-canon.ts`, `seed-wiki.ts`), les pages
 * rédigées sans source par fait (`seed-complete-wiki-pages.ts`), les sources
 * fabriquées par heuristique (`source-canonical-entities.ts`), tout ce qui
 * vient de Fandom (`extracted-wiki-assets.json`) et la conversion Kiri → BP,
 * présentée par le moteur lui-même comme une conversion de fans.
 */
import type { Contexte, Options, Sortie } from "./build-references";

type FaitsSources = typeof import("./src/faits-sources");

export interface Outils {
  lire(chemin: string, o: Options): Promise<string>;
  json(c: Contexte, donnees: unknown, extra?: Record<string, unknown>): string;
  enteteMarkdown(c: Contexte): string;
  charger<T>(entree: string, o: Options): Promise<{ module: T; sources: string[] }>;
}

const SITE = "https://dragonballfr.com";

/** Ordre par point de code : indépendant de l'ICU de la version de Bun. */
export const comparer = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
/** 1234567 → « 1 234 567 », sans dépendre des données de locale. */
const milliers = (n: number) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
const planche = (databook: number, page: number) =>
  `${SITE}/wiki/databooks/${databook}#planche-${page}`;

const FICHIERS = {
  citations: "apps/site/scripts/inventaires/canon-citations-fr.json",
  graphies: "data/ja-identities-2026-09-23.json",
  lieux: "apps/site/data/illustrations-lieux-objets.json",
  derives: "apps/bot/data/manga-spin-offs-manifest.json",
};

type Preuve =
  | { book: number; page: number; quote: string }
  | { book: number; page: number; scan: string }
  | { manga: string; page: number; quote: string };

function preuve(p: Preuve, livres: Record<number, string>) {
  if ("manga" in p) {
    const tome = Number(p.manga.replace(/\D/g, ""));
    return {
      ouvrage: `Manga Dragon Ball (corpus du site), tome ${tome}`,
      planche: p.page,
      citation: p.quote,
    };
  }
  const base = {
    ouvrage: livres[p.book] ?? `databook ${p.book}`,
    planche: p.page,
    url: planche(p.book, p.page),
  };
  return "scan" in p ? { ...base, lecture_du_scan: p.scan } : { ...base, citation: p.quote };
}

const preuveOuvrage = (p: { databook: number; page: number; title: string; excerpt: string }) => ({
  ouvrage: p.title,
  planche: p.page,
  extrait: p.excerpt,
  url: planche(p.databook, p.page),
});

export async function genererFaits(
  o: Options,
  ctx: (donnees: string[]) => Promise<Contexte>,
  outils: Outils,
): Promise<Sortie[]> {
  const { module: m, sources: code } = await outils.charger<FaitsSources>(
    "scripts/plugin/src/faits-sources.ts",
    o,
  );
  const modules = code.filter((s) => !s.startsWith("scripts/plugin/"));
  const donneesSources = [...modules, ...Object.values(FICHIERS)].toSorted();
  const c = await ctx(donneesSources);
  const lireJson = async <T>(chemin: string) => JSON.parse(await outils.lire(chemin, o)) as T;

  const livres = m.BOOK_LABELS as Record<number, string>;
  const divergences = new Map(m.DIVERGENCES.map((d) => [d.id, d.note]));
  const techniques = m.TECHNIQUES.map((t) => ({
    nom: t.name,
    ja: t.ja,
    ...(t.reading ? { lecture: t.reading } : {}),
    ...(t.debutChapter
      ? {
          premier_chapitre: {
            numero: t.debutChapter.number,
            preuves: t.debutChapter.evidence.map((e) => preuve(e as Preuve, livres)),
          },
        }
      : {}),
    ...(t.creator
      ? {
          createur: {
            fiche_wiki_personnage: t.creator.characterId,
            preuves: t.creator.evidence.map((e) => preuve(e as Preuve, livres)),
          },
        }
      : {}),
    ...(divergences.has(t.id) ? { divergence: divergences.get(t.id) } : {}),
    source:
      "Dictionnaires de techniques des databooks (deux ouvrages concordants exigés pour un chapitre)",
  }));

  const ps = m.DEFAULT_POWER_SCALING_CONFIG;
  const puissances = ps.officialBps.map((b) => ({
    personnage: b.character,
    saga: b.saga,
    etat: b.state,
    puissance: b.bp,
    mesure_au_scouter: b.scouter,
    source: b.source,
    rang_canon: b.canonTier,
  }));
  const multiplicateurs = ps.multipliers
    .filter((x) => x.multiplier > 0 && x.source)
    .map((x) => ({
      forme: x.form,
      multiplicateur: x.multiplier,
      base: x.baseForm,
      source: x.source,
      rang_canon: x.canonTier,
      precision: /\b(p\.|ch\.|chapitres?)\s*\d/i.test(x.source)
        ? "page ou chapitre cité"
        : "ouvrage cité sans page : à revérifier sur la planche",
      ...(x.notes ? { note: x.notes } : {}),
    }));

  const economie = {
    parite_zeni_yen: {
      ratio: m.ZENI_YEN_PARITY.ratio,
      source: m.ZENI_YEN_PARITY.source.title,
      url: m.ZENI_YEN_PARITY.source.url,
    },
    prix: m.CANON_PRICES.map((p) => ({
      objet: p.label,
      zeni: p.zeni,
      source: p.source.title,
      url: p.source.url,
    })),
    inflation_budokai: {
      facteur: Math.round(m.CANON_INFLATION_FACTOR * 100) / 100,
      calcul: "prix du Budokai en fin de série ÷ prix initial",
      source: m.CANON_PRICES.find((p) => p.key === "budokai_late")?.source.title ?? "",
    },
  };

  const cfg = m.DEFAULT_CANON_CONFIG;
  const hierarchie = {
    source:
      "apps/site/src/lib/canon-engine.ts (doctrine par défaut ; la production peut la retoucher)",
    rangs: cfg.tiers.map((t, i) => ({
      ordre: i + 1,
      rang: t.id,
      libelle: t.label,
      definition: t.definition,
      inclut: t.inclut,
    })),
    regles: cfg.doctrine,
    sources_admises: cfg.sourcesAdmises,
    sources_refusees: cfg.sourcesInterdites,
    documents_auteur_admis: m.DOCUMENTS.map((d) => ({
      source: d.source,
      ...(d.annee ? { annee: d.annee } : {}),
      langue: d.lang,
    })),
    motif_refuse: m.REFUSÉ.source,
  };

  const absolu = cfg.tiers.find((t) => t.id === "CANON_ABSOLU");
  const ligneManga = absolu?.inclut.find((l) => /tomes?\s+1\s+à\s+\d+/.test(l)) ?? null;
  const tomes = ligneManga?.match(/tomes?\s+1\s+à\s+(\d+)/)?.[1];
  const chapitres = ligneManga?.match(/chapitres?\s+1\s+à\s+(\d+)/)?.[1];

  const graphiesBrutes = await lireJson<{
    doctrine: string;
    written: {
      table: string;
      frenchName: string;
      value: string;
      proof: { databook: number; page: number; title: string; excerpt: string };
      extraProofs?: { databook: number; page: number; title: string; excerpt: string }[];
      review?: string;
    }[];
  }>(FICHIERS.graphies);
  const graphies = graphiesBrutes.written.map((w) => ({
    fiche: w.table.replace(/^db_/, ""),
    nom_fr: w.frenchName,
    ja: w.value,
    preuve: preuveOuvrage(w.proof),
    autres_preuves: (w.extraProofs ?? []).map(preuveOuvrage),
    ...(w.review ? { revue: w.review } : {}),
  }));

  const lieux = (
    await lireJson<
      {
        table: string;
        slug: string;
        source: { series: string; chapter: number; page: number; url: string };
        attribution: string;
        note?: string;
      }[]
    >(FICHIERS.lieux)
  ).map((l) => ({
    type: l.table === "db_items" ? "objet" : l.table === "db_locations" ? "lieu" : l.table,
    slug: l.slug,
    serie: l.source.series === "DBFC" ? "Dragon Ball Full Color" : l.source.series,
    chapitre: l.source.chapter,
    planche: l.source.page,
    attribution: l.attribution,
    ...(l.note ? { note: l.note } : {}),
  }));

  const derives = (
    await lireJson<{
      works: {
        title: string;
        title_ja?: string;
        author?: string;
        original_creator?: string;
        isbn?: string;
        published_at?: string;
        publisher?: string;
        source_url?: string;
      }[];
    }>(FICHIERS.derives)
  ).works
    // Une publication sans page d'éditeur n'est pas établie : elle n'est pas embarquée.
    .flatMap((w) => (w.source_url ? [{ ...w, source_url: w.source_url }] : []))
    .map((w) => ({
      titre: w.title,
      ...(w.title_ja ? { titre_ja: w.title_ja } : {}),
      ...(w.author ? { auteur: w.author } : {}),
      ...(w.original_creator ? { createur_original: w.original_creator } : {}),
      ...(w.isbn ? { isbn: w.isbn } : {}),
      ...(w.published_at ? { parution: w.published_at } : {}),
      ...(w.publisher ? { editeur: w.publisher } : {}),
      source: w.source_url,
    }))
    .toSorted((a, b) => comparer(a.parution ?? "", b.parution ?? ""));

  const citations = (
    await lireJson<{ id: string; source: string; text: string; textFr?: string }[]>(
      FICHIERS.citations,
    )
  ).map((x) => ({
    id: x.id,
    source: x.source,
    texte: x.text,
    ...(x.textFr ? { texte_fr: x.textFr } : {}),
    attribution:
      "Akira Toriyama / Shueisha ; traduction anglaise Kanzenshuu, traduction française dragonballfr.com",
  }));

  const nonEmbarque = [
    {
      theme: "chronologie (années, âges, événements)",
      raison:
        "vit en base (bot.db_timeline_events, champ source_ref) ; aucun fichier sourcé dans le dépôt",
    },
    {
      theme: "sagas et arcs (bornes en tomes et chapitres)",
      raison:
        "vit en base (bot.db_sagas.manga_chapter_*) ; les tables du dépôt (variantes-par-saga.ts, seed-arcs.ts, seed-canon.ts) n'ont aucune source par enregistrement",
    },
    {
      theme: "races",
      raison:
        "fiches du wiki en base ; packages/config/src/races.ts décrit les races du jeu Discord, pas l'œuvre",
    },
    {
      theme: "transformations",
      raison:
        "fiches du wiki en base ; seuls les multiplicateurs sourcés ci-dessus et les verdicts de canon (doctrine) sont embarqués",
    },
    {
      theme: "personnages, planètes, fiches du wiki, texte des databooks, planches du manga",
      raison: "base éditoriale et corpus du site : consulter l'API ou le MCP quand ils répondent",
    },
  ];

  const donnees = {
    hierarchie_sources: hierarchie,
    couverture_manga:
      tomes && chapitres
        ? {
            manga_original: { tomes: Number(tomes), chapitres: Number(chapitres) },
            source: `doctrine de canonicité, rang CANON_ABSOLU : « ${ligneManga} »`,
          }
        : null,
    techniques,
    puissances_officielles: puissances,
    multiplicateurs,
    economie,
    graphies_japonaises_prouvees: graphies,
    lieux_objets_attestes: lieux,
    publications_derivees: derives,
    declarations_auteur: citations,
    non_embarque: nonEmbarque,
  };

  const cJson = { ...c, sources: donneesSources };
  const md = faitsMarkdown(donnees, outils.enteteMarkdown(cJson));
  return [
    {
      chemin: "plugin/skills/dragon-ball/references/faits.json",
      contenu: outils.json(cJson, donnees, {
        statut:
          "Chaque enregistrement est établi par la source qu'il cite (instantané) ; un thème de non_embarque est non établi hors ligne.",
      }),
      donnees: donneesSources,
      code: code.filter((s) => s.startsWith("scripts/plugin/")).concat("scripts/plugin/faits.ts"),
    },
    {
      chemin: "plugin/skills/dragon-ball/references/faits.md",
      contenu: md,
      donnees: donneesSources,
      code: ["scripts/plugin/faits.ts"],
    },
  ];
}

const cel = (s: unknown) =>
  String(s ?? "")
    .replace(/\|/g, "\\|")
    .replace(/\n+/g, " ");

type Donnees = {
  hierarchie_sources: {
    rangs: { ordre: number; rang: string; libelle: string; inclut: string[] }[];
    regles: string[];
    sources_admises: string[];
    sources_refusees: string[];
    documents_auteur_admis: { source: string; annee?: number; langue: string }[];
  };
  couverture_manga: { manga_original: { tomes: number; chapitres: number }; source: string } | null;
  techniques: {
    nom: string;
    ja: string;
    lecture?: string;
    premier_chapitre?: {
      numero: number;
      preuves: { ouvrage: string; planche: number; url?: string }[];
    };
    divergence?: string;
  }[];
  puissances_officielles: {
    personnage: string;
    saga: string;
    etat: string;
    puissance: number;
    source: string;
  }[];
  multiplicateurs: { forme: string; multiplicateur: number; source: string; precision: string }[];
  economie: {
    parite_zeni_yen: { ratio: number; source: string; url: string };
    prix: { objet: string; zeni: number; source: string; url: string }[];
    inflation_budokai: { facteur: number; source: string };
  };
  graphies_japonaises_prouvees: {
    nom_fr: string;
    ja: string;
    preuve: { ouvrage: string; planche: number; url: string };
  }[];
  lieux_objets_attestes: {
    type: string;
    slug: string;
    serie: string;
    chapitre: number;
    planche: number;
  }[];
  publications_derivees: {
    titre: string;
    parution?: string;
    isbn?: string;
    editeur?: string;
    source: string;
  }[];
  declarations_auteur: { id: string; source: string }[];
  non_embarque: { theme: string; raison: string }[];
};

export function faitsMarkdown(d: Donnees, entete: string): string {
  const l: string[] = [
    "# Faits Dragon Ball — référence publique sourcée",
    "",
    entete.trimEnd(),
    "",
  ];
  l.push(
    "Chaque ligne cite sa source ; la données brute (avec citations et URL complètes) est dans",
    "`faits.json`, interrogeable par `bun scripts/faits.ts`. Un thème absent d'ici est **non établi**",
    "hors ligne : ne pas le combler de mémoire.",
    "",
    "## Hiérarchie des sources",
    "",
    "| Ordre | Rang | Libellé | Inclut |",
    "| --- | --- | --- | --- |",
    ...d.hierarchie_sources.rangs.map(
      (r) => `| ${r.ordre} | \`${r.rang}\` | ${cel(r.libelle)} | ${cel(r.inclut.join(" ; "))} |`,
    ),
    "",
    "Règles :",
    ...d.hierarchie_sources.regles.map((r) => `- ${r}`),
    "",
    "Sources admises :",
    ...d.hierarchie_sources.sources_admises.map((r) => `- ${r}`),
    "",
    "Sources refusées :",
    ...d.hierarchie_sources.sources_refusees.map((r) => `- ${r}`),
    "",
    "Documents d'auteur admis au corpus du site :",
    ...d.hierarchie_sources.documents_auteur_admis.map(
      (x) => `- ${x.source}${x.annee ? ` (${x.annee})` : ""} [${x.langue}]`,
    ),
    "",
    "## Couverture du manga",
    "",
  );
  if (d.couverture_manga) {
    l.push(
      `Manga original : ${d.couverture_manga.manga_original.tomes} tomes, ${d.couverture_manga.manga_original.chapitres} chapitres — ${d.couverture_manga.source}.`,
    );
  } else l.push("Non établi dans l'instantané.");
  l.push(
    "Bornes des sagas et des arcs en tomes ou chapitres : **non établies** hors ligne (voir la fin).",
    "",
    `## Techniques (${d.techniques.length})`,
    "",
    "| Technique | Japonais | Lecture | 1er chapitre | Preuves |",
    "| --- | --- | --- | --- | --- |",
    ...d.techniques.map((t) => {
      const p = t.premier_chapitre;
      const preuves = p
        ? p.preuves.map((x) => `${x.ouvrage} pl. ${x.planche}`).join(" ; ")
        : t.divergence
          ? `non établi : ${t.divergence}`
          : "non établi";
      return `| ${cel(t.nom)} | ${t.ja} | ${t.lecture ?? ""} | ${p ? p.numero : ""} | ${cel(preuves)} |`;
    }),
    "",
    `## Niveaux de puissance officiels (${d.puissances_officielles.length})`,
    "",
    "Chiffres du support cité seulement ; ne pas les extrapoler hors de leur contexte.",
    "",
    "| Personnage | Saga | État | Puissance | Source |",
    "| --- | --- | --- | --- | --- |",
    ...d.puissances_officielles.map(
      (p) =>
        `| ${cel(p.personnage)} | ${cel(p.saga)} | ${cel(p.etat)} | ${milliers(p.puissance)} | ${cel(p.source)} |`,
    ),
    "",
    "## Multiplicateurs de forme",
    "",
    "| Forme | × | Source | Précision |",
    "| --- | --- | --- | --- |",
    ...d.multiplicateurs.map(
      (x) => `| ${cel(x.forme)} | ${x.multiplicateur} | ${cel(x.source)} | ${x.precision} |`,
    ),
    "",
    "## Économie (zénis)",
    "",
    `Parité : 1 zéni ≈ ${d.economie.parite_zeni_yen.ratio} yen — ${d.economie.parite_zeni_yen.source} (${d.economie.parite_zeni_yen.url}).`,
    "",
    "| Objet | Zénis | Source |",
    "| --- | --- | --- |",
    ...d.economie.prix.map(
      (p) => `| ${cel(p.objet)} | ${milliers(p.zeni)} | [${cel(p.source)}](${p.url}) |`,
    ),
    "",
    `Inflation du prix du Budokai : ×${d.economie.inflation_budokai.facteur} (${d.economie.inflation_budokai.source}).`,
    "",
    "## Graphies japonaises prouvées",
    "",
    "| Nom français | Japonais | Preuve |",
    "| --- | --- | --- |",
    ...d.graphies_japonaises_prouvees.map(
      (g) =>
        `| ${cel(g.nom_fr)} | ${g.ja} | [${cel(g.preuve.ouvrage)}, pl. ${g.preuve.planche}](${g.preuve.url}) |`,
    ),
    "",
    "## Lieux et objets attestés dans le manga",
    "",
    "| Type | Fiche | Série | Chapitre | Planche |",
    "| --- | --- | --- | --- | --- |",
    ...d.lieux_objets_attestes.map(
      (x) => `| ${x.type} | ${x.slug} | ${x.serie} | ${x.chapitre} | ${x.planche} |`,
    ),
    "",
    "## Publications dérivées (catalogue de l'éditeur)",
    "",
    "| Titre | Parution | ISBN | Source |",
    "| --- | --- | --- | --- |",
    ...d.publications_derivees.map(
      (p) => `| ${cel(p.titre)} | ${p.parution ?? ""} | ${p.isbn ?? ""} | ${p.source} |`,
    ),
    "",
    `## Déclarations d'auteur (${d.declarations_auteur.length})`,
    "",
    "Texte intégral (anglais de Kanzenshuu, français du site) : `bun scripts/faits.ts citation <id>`.",
    "",
    "| Identifiant | Source |",
    "| --- | --- |",
    ...d.declarations_auteur.map((x) => `| \`${x.id}\` | ${cel(x.source)} |`),
    "",
    "## Non embarqué (non établi hors ligne)",
    "",
    ...d.non_embarque.map((x) => `- **${x.theme}** : ${x.raison}.`),
  );
  return `${l.join("\n").trimEnd()}\n`;
}
