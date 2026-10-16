/**
 * Arbitre de canonicité hors ligne du plugin « shenron ».
 *
 * Point d'entrée empaqueté par `scripts/plugin/build-references.ts` dans
 * `plugin/skills/dragon-ball-canon/scripts/canon.js` : le moteur
 * `apps/site/src/lib/canon-engine.ts` (sans import) et sa doctrine par défaut
 * voyagent avec le plugin. Le verdict est celui de `/api/canon` calculé sur la
 * doctrine livrée avec le dépôt ; la doctrine de production peut avoir été
 * retouchée dans `/admin/canon`, et le corpus de références (`canon_references`),
 * les planches et les fiches viennent de la base : ils sont vides hors ligne.
 *
 *   bun canon.js "Broly est-il canon ?"       verdict lisible
 *   bun canon.js --json "Broly est-il canon ?" même forme que GET /api/canon?q=
 *   bun canon.js --doctrine                    même forme que GET /api/canon
 *   bun canon.js --entree broly                une entrée complète
 *   bun canon.js --liste                       les sujets tranchés
 */
import {
  CANON_TIERS,
  DEFAULT_CANON_CONFIG,
  analyzeCanon,
  type CanonAnalysisResult,
} from "../../../apps/site/src/lib/canon-engine";

export { CANON_TIERS, DEFAULT_CANON_CONFIG, analyzeCanon };

declare const __INSTANTANE__: { revision: string; date: string; source: string };

/** `__INSTANTANE__` est substitué au build ; hors build, l'identifiant n'existe pas. */
function instantane(): { revision: string; date: string; source: string } {
  try {
    return __INSTANTANE__;
  } catch {
    return { revision: "dépôt", date: "courante", source: "apps/site/src/lib/canon-engine.ts" };
  }
}

const INSTANTANE = instantane();

const SITE = "https://dragonballfr.com";

/** Statut à citer : seule une entrée curée établit un rang. */
export function statut(v: CanonAnalysisResult): string {
  const o = v.origine;
  if (o.startsWith("entry:")) return "établi (instantané)";
  if (o.startsWith("heuristic:"))
    return "non établi (rang présumé par une famille de formulations)";
  if (o.startsWith("troll")) return "hors des sources";
  if (o === "empty") return "aucune question";
  return "non établi";
}

/** Réponse au format de `GET /api/canon?q=` (preuves de base vides hors ligne). */
export function reponseApi(question: string) {
  const q = question.trim().slice(0, 400);
  const v = analyzeCanon(q, DEFAULT_CANON_CONFIG);
  return {
    question: q,
    verdict: {
      tier: v.tier,
      tierLabel: v.tierLabel,
      tierDefinition: v.tierDefinition ?? null,
      score: v.score,
      color: v.color,
      verdict: v.verdict,
      explanation: v.explanation,
      toriyamaQuote: v.toriyamaQuote ?? null,
      sources: v.sources,
      matchedKeywords: v.matchedKeywords,
      doctrine: v.doctrineRules ?? [],
      origine: v.origine,
      nature: v.nature,
      suggestions: v.suggestions,
    },
    references: (v.references ?? []).map((r) => ({
      id: r.id,
      subject: r.subject,
      text: r.text,
      textFr: r.textFr ?? null,
      source: r.source,
      year: r.year ?? null,
      lang: r.lang,
      provenance: r.provenance,
      href: r.href ?? null,
    })),
    planches: [],
    fiches: [],
    suggestions: v.suggestions.map((titre) => ({
      titre,
      href: `/wiki/canon?q=${encodeURIComponent(titre)}`,
    })),
    mode: null,
    statut: statut(v),
    instantane: { ...INSTANTANE, hors_ligne: true },
  };
}

/** Doctrine au format de `GET /api/canon` (sans question). */
export function doctrineApi() {
  const c = DEFAULT_CANON_CONFIG;
  return {
    intro: c.intro,
    tiers: c.tiers,
    doctrine: c.doctrine,
    sourcesAdmises: c.sourcesAdmises,
    sourcesInterdites: c.sourcesInterdites,
    entries: c.entries.map((e) => ({
      id: e.id,
      title: e.title,
      category: e.category,
      tier: e.tier,
      score: e.score,
      verdict: e.verdict,
    })),
    heuristics: c.heuristics.map((h) => ({ id: h.id, label: h.label, tier: h.tier })),
    stats: { references: 0, parProvenance: {} },
    instantane: { ...INSTANTANE, hors_ligne: true },
  };
}

function lisible(question: string): string {
  const r = reponseApi(question);
  const v = r.verdict;
  const tranche = v.origine.startsWith("entry:") || v.origine.startsWith("heuristic:");
  const lignes = [
    `Question : ${r.question}`,
    `Statut : ${r.statut} — doctrine du dépôt, révision ${INSTANTANE.revision} (${INSTANTANE.date})`,
    tranche
      ? `Rang : ${v.tier} — ${v.tierLabel}`
      : `Rang : aucun rang établi (${v.tierLabel} ; valeur de repli de l'API : ${v.tier})`,
    tranche
      ? `Score : ${v.score} (autorité du rang ou du sujet, pas une probabilité)`
      : `Score : ${v.score} (repli, ne fonde rien)`,
    `Origine : ${v.origine} (nature : ${v.nature})`,
    `Verdict : ${v.verdict}`,
    `Explication : ${v.explanation}`,
  ];
  if (v.toriyamaQuote) {
    const q = v.toriyamaQuote;
    lignes.push(`Citation d'auteur : « ${q.text} » — ${q.source}${q.year ? ` (${q.year})` : ""}`);
  }
  if (v.sources.length) lignes.push("Sources :", ...v.sources.map((s) => `  - ${s}`));
  if (v.matchedKeywords.length) lignes.push(`Mots-clés reconnus : ${v.matchedKeywords.join(", ")}`);
  if (v.tierDefinition) lignes.push(`Définition du rang : ${v.tierDefinition}`);
  if (r.suggestions.length) {
    lignes.push("Sujets voisins :", ...r.suggestions.map((s) => `  - ${s.titre}`));
  }
  lignes.push(
    "Références du corpus, planches et fiches : non embarquées (base du site).",
    `En ligne, si joignable : ${SITE}/api/canon?q=${encodeURIComponent(r.question)}`,
  );
  return lignes.join("\n");
}

function main(args: string[]): number {
  const json = args.includes("--json");
  const reste = args.filter((a) => a !== "--json");
  if (reste[0] === "--doctrine") {
    console.log(JSON.stringify(doctrineApi(), null, 2));
    return 0;
  }
  if (reste[0] === "--liste") {
    for (const t of CANON_TIERS) {
      for (const e of DEFAULT_CANON_CONFIG.entries.filter((x) => x.tier === t)) {
        console.log(`${e.id}\t${e.tier}\t${e.score}\t${e.title}`);
      }
    }
    return 0;
  }
  if (reste[0] === "--entree") {
    const e = DEFAULT_CANON_CONFIG.entries.find((x) => x.id === reste[1]);
    if (!e) {
      console.error(`entrée inconnue : ${reste[1] ?? "(vide)"} — voir --liste`);
      return 1;
    }
    console.log(JSON.stringify({ ...e, instantane: INSTANTANE }, null, 2));
    return 0;
  }
  const question = reste.join(" ").trim();
  if (!question) {
    console.error(
      'usage : bun canon.js [--json] "question" | --doctrine | --liste | --entree <id>',
    );
    return 1;
  }
  console.log(json ? JSON.stringify(reponseApi(question), null, 2) : lisible(question));
  return 0;
}

if (import.meta.main) process.exit(main(Bun.argv.slice(2)));
