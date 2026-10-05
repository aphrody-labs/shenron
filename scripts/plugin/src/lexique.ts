/**
 * Lexique japonais → français hors ligne du plugin « shenron ».
 *
 * Point d'entrée empaqueté par `scripts/plugin/build-references.ts` dans
 * `plugin/skills/dragon-ball-japonais/scripts/lexique.js`. Les règles de
 * masquage sont celles du site (`apps/site/src/lib/ja/traduction.ts` : le plus
 * long d'abord, frontières de mot katakana, jetons `Zeta001`) ; les termes sont
 * ceux de `references/lexique-canonique.json`, instantané de
 * `data/lexique-db-canonique.json` (formes `name`/`name_ja` du wiki).
 *
 *   bun lexique.js cherche <terme>          recherche JA ou FR
 *   bun lexique.js termes <texte japonais>  termes du lexique présents dans le texte
 *   bun lexique.js masque <texte japonais>  texte masqué + table des jetons (JSON)
 *   bun lexique.js restaure <traduction> --table table.json
 *   (texte « - » : lu sur l'entrée standard ; --json pour une sortie machine)
 */
import { join } from "node:path";
import {
  masquerTermes,
  occurrencesDuLexique,
  restaurerJetons,
} from "../../../apps/site/src/lib/ja/traduction";
import { normaliserJa, katakanaVersHiragana } from "../../../apps/site/src/lib/ja/normalisation";

export interface Terme {
  ja: string;
  fr: string;
  kind: string;
  length: number;
}

interface Instantane {
  revision: string;
  date: string;
  donnees: Terme[];
}

export async function chargerLexique(dossier = join(import.meta.dir, "..", "references")) {
  const brut = (await Bun.file(join(dossier, "lexique-canonique.json")).json()) as Instantane;
  const termes = brut.donnees.toSorted((a, b) => b.length - a.length || a.ja.localeCompare(b.ja));
  return { revision: brut.revision, date: brut.date, termes };
}

const replierFr = (s: string) =>
  s
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
const replierJa = (s: string) => katakanaVersHiragana(normaliserJa(s)).replace(/[・･\s]/g, "");

/** Recherche par graphie japonaise ou forme française ; exacts d'abord. */
export function chercher(termes: Terme[], requete: string, limite = 30): Terme[] {
  const ja = replierJa(requete);
  const fr = replierFr(requete);
  const notes: { t: Terme; note: number }[] = [];
  for (const t of termes) {
    const tj = replierJa(t.ja);
    const tf = replierFr(t.fr);
    let note = 0;
    if (ja && tj === ja) note = 4;
    else if (fr && tf === fr) note = 4;
    else if (ja && tj.includes(ja)) note = 2;
    else if (fr && (tf.includes(fr) || ` ${tf} `.includes(` ${fr} `))) note = 2;
    else if (ja && ja.includes(tj) && tj.length >= 2) note = 1;
    if (note) notes.push({ t, note });
  }
  return notes
    .toSorted((a, b) => b.note - a.note || a.t.ja.length - b.t.ja.length)
    .slice(0, limite)
    .map((n) => n.t);
}

async function texteArgument(valeur: string | undefined): Promise<string> {
  if (valeur === "-" || valeur === undefined) return (await Bun.stdin.text()).trim();
  return valeur;
}

async function main(args: string[]): Promise<number> {
  const json = args.includes("--json");
  const reste = args.filter((a) => a !== "--json");
  const [commande, ...suite] = reste;
  const { revision, date, termes } = await chargerLexique();
  const entete = `lexique ${termes.length} termes — instantané ${revision} (${date})`;
  const iTable = suite.indexOf("--table");
  const fichierTable = iTable >= 0 ? suite[iTable + 1] : undefined;
  const mots = iTable >= 0 ? suite.slice(0, iTable) : suite;
  const valeur = mots.length ? mots.join(" ") : undefined;

  if (commande === "cherche") {
    if (!valeur) return usage();
    const trouves = chercher(termes, valeur);
    if (json)
      console.log(JSON.stringify({ revision, date, requete: valeur, resultats: trouves }, null, 2));
    else {
      console.log(entete);
      if (!trouves.length) {
        console.log(
          `aucun terme pour « ${valeur} » : non établi dans le lexique (ce n'est pas une preuve de faute)`,
        );
      }
      for (const t of trouves) console.log(`${t.ja}\t${t.fr}\t${t.kind}`);
    }
    return 0;
  }
  if (commande === "termes") {
    const texte = await texteArgument(valeur);
    const occ = occurrencesDuLexique(texte, termes).map((o) => ({
      debut: o.debut,
      ja: o.terme.ja,
      fr: o.terme.fr,
      kind: o.terme.kind,
    }));
    if (json) console.log(JSON.stringify({ revision, date, occurrences: occ }, null, 2));
    else {
      console.log(entete);
      for (const o of occ) console.log(`${o.debut}\t${o.ja}\t${o.fr}\t${o.kind}`);
      if (!occ.length) console.log("aucun terme du lexique dans ce texte");
    }
    return 0;
  }
  if (commande === "masque") {
    const texte = await texteArgument(valeur);
    const { masque, jetons, debordement } = masquerTermes(texte, termes);
    const table = Object.fromEntries([...jetons].map(([j, t]) => [j, t.fr]));
    const termesTrouves = [...jetons].map(([j, t]) => ({
      jeton: j,
      ja: t.ja,
      fr: t.fr,
      kind: t.kind,
    }));
    console.log(
      JSON.stringify(
        { revision, date, masque, table, termes: termesTrouves, debordement },
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
    const { texte: restaure, residuels } = restaurerJetons(texte, new Map(Object.entries(objet)));
    if (json) console.log(JSON.stringify({ texte: restaure, residuels }, null, 2));
    else {
      console.log(restaure);
      if (residuels.length)
        console.error(`jetons non restaurés : ${residuels.join(", ")} — traduction à refuser`);
    }
    return residuels.length ? 2 : 0;
  }
  return usage();
}

function usage(): number {
  console.error(
    "usage : bun lexique.js cherche <terme> | termes <texte> | masque <texte> | restaure <traduction> --table <table.json> [--json]",
  );
  return 1;
}

if (import.meta.main) process.exit(await main(Bun.argv.slice(2)));
