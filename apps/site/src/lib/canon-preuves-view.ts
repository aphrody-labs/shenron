import type { CanonPreuves } from "@/lib/canon-preuves";

/**
 * The evidence behind a canon verdict as the API serves it: `plates` (databook plates with
 * their transcription and translation), `records` (wiki records) and `suggestions`, with the
 * former French names kept as deprecated duplicates until 1.4.0 (`planches`, `fiches`, and
 * `numero`, `texte`, `texteFr`, `verifiee`, `databookTitre`, `titre`, `extrait` on their items).
 */
export function canonEvidenceView(
  evidence: Pick<CanonPreuves, "planches" | "fiches" | "suggestions" | "mode">,
) {
  const plates = evidence.planches.map((plate) => ({
    databookId: plate.databookId,
    databookTitle: plate.databookTitre,
    number: plate.numero,
    image: plate.image,
    text: plate.texte,
    textFr: plate.texteFr,
    verified: plate.verifiee,
    href: plate.href,
    score: plate.score,
    // Former names, deprecated: removed in 1.4.0.
    databookTitre: plate.databookTitre,
    numero: plate.numero,
    texte: plate.texte,
    texteFr: plate.texteFr,
    verifiee: plate.verifiee,
  }));
  const records = evidence.fiches.map((record) => ({
    kind: record.kind,
    title: record.titre,
    excerpt: record.extrait,
    href: record.href,
    score: record.score,
    image: record.image,
    nameJa: record.nameJa,
    // Former names, deprecated: removed in 1.4.0.
    titre: record.titre,
    extrait: record.extrait,
  }));
  const suggestions = evidence.suggestions.map((suggestion) => ({
    title: suggestion.titre,
    href: suggestion.href,
    // Former name, deprecated: removed in 1.4.0.
    titre: suggestion.titre,
  }));
  return {
    plates,
    records,
    suggestions,
    mode: evidence.mode,
    // Former names, deprecated: removed in 1.4.0.
    planches: plates,
    fiches: records,
  };
}
