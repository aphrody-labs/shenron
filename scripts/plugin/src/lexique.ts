/**
 * Lexique japonais → français / anglais hors ligne du plugin « shenron ».
 *
 * Point d'entrée empaqueté par `scripts/plugin/build-references.ts` dans
 * `plugin/skills/dragon-ball-japonais/scripts/lexique.js`. Les règles (recherche, masquage le plus
 * long d'abord aux frontières de mot katakana, jetons `Zeta001`, restauration tolérante) sont
 * celles de `@aphrody/shenron-lexicon`, identiques au crate Rust `shenron-lexicon` ; les termes sont ceux
 * de `references/lexique-canonique.json`, instantané de `data/lexicon/terms.json`.
 *
 *   bun lexique.js cherche <terme>          recherche JA, FR ou EN (alias et romaji compris)
 *   bun lexique.js termes <texte japonais>  termes du lexique présents dans le texte
 *   bun lexique.js masque <texte japonais> [--en]  texte masqué + table des jetons (JSON)
 *   bun lexique.js restaure <traduction> --table table.json
 *   (texte « - » : lu sur l'entrée standard ; --json pour une sortie machine)
 */
import { join } from "node:path";
import { findOccurrences, Lexicon, restoreTokens, type Term } from "../../../packages/lexicon/src";

interface Instantane {
  revision: string;
  date: string;
  donnees: Term[];
}

export async function chargerLexique(dossier = join(import.meta.dir, "..", "references")) {
  const brut = (await Bun.file(join(dossier, "lexique-canonique.json")).json()) as Instantane;
  const lexique = Lexicon.parse({ version: 1, terms: brut.donnees });
  return { revision: brut.revision, date: brut.date, lexique };
}

const ligne = (t: Term) => `${t.ja}\t${t.fr}\t${t.en || "—"}\t${t.kind}`;

async function texteArgument(valeur: string | undefined): Promise<string> {
  if (valeur === "-" || valeur === undefined) return (await Bun.stdin.text()).trim();
  return valeur;
}

async function main(args: string[]): Promise<number> {
  const json = args.includes("--json");
  const cible = args.includes("--en") ? "en" : "fr";
  const reste = args.filter((a) => a !== "--json" && a !== "--en");
  const [commande, ...suite] = reste;
  const { revision, date, lexique } = await chargerLexique();
  const entete = `lexique ${lexique.size} termes — instantané ${revision} (${date})`;
  const iTable = suite.indexOf("--table");
  const fichierTable = iTable >= 0 ? suite[iTable + 1] : undefined;
  const mots = iTable >= 0 ? suite.slice(0, iTable) : suite;
  const valeur = mots.length ? mots.join(" ") : undefined;

  if (commande === "cherche") {
    if (!valeur) return usage();
    const trouves = lexique.search(valeur, { limit: 30 });
    if (json)
      console.log(
        JSON.stringify(
          { revision, date, requete: valeur, resultats: trouves.map((h) => h.term) },
          null,
          2,
        ),
      );
    else {
      console.log(entete);
      if (!trouves.length) {
        console.log(
          `aucun terme pour « ${valeur} » : non établi dans le lexique (ce n'est pas une preuve de faute)`,
        );
      }
      for (const h of trouves) console.log(ligne(h.term));
    }
    return 0;
  }
  if (commande === "termes") {
    const texte = await texteArgument(valeur);
    const occ = findOccurrences(texte, lexique.maskEntries("fr")).map((o) => ({
      debut: o.start,
      ja: o.source,
      fr: o.entry.value.fr,
      en: o.entry.value.en,
      kind: o.entry.value.kind,
      id: o.entry.value.id,
    }));
    if (json) console.log(JSON.stringify({ revision, date, occurrences: occ }, null, 2));
    else {
      console.log(entete);
      for (const o of occ) console.log(`${o.debut}\t${o.ja}\t${o.fr}\t${o.en || "—"}\t${o.kind}`);
      if (!occ.length) console.log("aucun terme du lexique dans ce texte");
    }
    return 0;
  }
  if (commande === "masque") {
    const texte = await texteArgument(valeur);
    const masked = lexique.mask(texte, cible);
    const table = Object.fromEntries(masked.tokens.map((t) => [t.token, t.target]));
    const termesTrouves = masked.tokens.map((t) => ({
      jeton: t.token,
      id: t.entry.value.id,
      ja: t.entry.value.ja,
      fr: t.entry.value.fr,
      en: t.entry.value.en,
      kind: t.entry.value.kind,
    }));
    console.log(
      JSON.stringify(
        {
          revision,
          date,
          cible,
          masque: masked.text,
          table,
          termes: termesTrouves,
          debordement: masked.overflow,
        },
        null,
        2,
      ),
    );
    return 0;
  }
  if (commande === "restaure") {
    const texte = await texteArgument(valeur);
    if (!fichierTable) return usage();
    const brut = fichierTable.trim().startsWith("{")
      ? JSON.parse(fichierTable)
      : await Bun.file(fichierTable).json();
    const objet = (brut.table ?? brut) as Record<string, string>;
    const { text, unresolved, missing } = restoreTokens(texte, Object.entries(objet));
    if (json)
      console.log(
        JSON.stringify({ texte: text, residuels: unresolved, manquants: missing }, null, 2),
      );
    else {
      console.log(text);
      if (unresolved.length)
        console.error(`jetons non restaurés : ${unresolved.join(", ")} — traduction à refuser`);
      if (missing.length) console.error(`jetons absents de la traduction : ${missing.join(", ")}`);
    }
    return unresolved.length ? 2 : 0;
  }
  return usage();
}

function usage(): number {
  console.error(
    "usage : bun lexique.js cherche <terme> | termes <texte> | masque <texte> [--en] | restaure <traduction> --table <table.json> [--json]",
  );
  return 1;
}

if (import.meta.main) process.exit(await main(Bun.argv.slice(2)));
