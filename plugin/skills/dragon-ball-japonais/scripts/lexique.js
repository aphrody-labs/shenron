// @bun
// Généré par scripts/plugin/build-references.ts — ne pas éditer.
// Sources : apps/site/src/lib/ja/normalisation.ts, apps/site/src/lib/ja/traduction.ts, scripts/plugin/src/lexique.ts
// Révision : 5536b05+modifications (2026-10-05)
// scripts/plugin/src/lexique.ts
import { join } from "path";

// apps/site/src/lib/ja/traduction.ts
var PREFIXE_JETON = "Zeta";
function jeton(n, prefixe = PREFIXE_JETON, largeur = 3) {
  return `${prefixe}${String(n).padStart(largeur, "0")}`;
}
var VOYELLES = {
  a: "[a\xE0\xE2\xE4\xE1]",
  e: "[e\xE9\xE8\xEA\xEB]",
  i: "[i\xEE\xEF\xED]",
  o: "[o\xF4\xF6\xF3]",
  u: "[u\xF9\xFB\xFC\xFA]"
};
function motifJetons(prefixe = PREFIXE_JETON, largeur) {
  const corps = [...prefixe.toLowerCase()].map((c) => VOYELLES[c] ?? c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("");
  const chiffres = largeur ? `(\\d{${largeur}})` : `(\\d{3,4})(?!\\d)`;
  return new RegExp(`${corps}[\\s\\-_]?${chiffres}`, "giu");
}
function jetonsResiduels(texte, prefixe = PREFIXE_JETON, largeur) {
  return [...texte.matchAll(motifJetons(prefixe, largeur))].map((m) => m[0]);
}
var KATAKANA_MOT = /[\u30A1-\u30FA\u30FC-\u30FF\u31F0-\u31FF\uFF66-\uFF9F]/;
var LATIN_MOT = /[A-Za-z0-9\u00C0-\u024F]/;
function classeDeSigne(c) {
  if (!c)
    return null;
  if (KATAKANA_MOT.test(c))
    return "katakana";
  if (LATIN_MOT.test(c))
    return "latin";
  return null;
}
function bordsDeMot(texte, debut, fin) {
  const initiale = classeDeSigne(texte[debut]);
  if (initiale && classeDeSigne(texte[debut - 1]) === initiale)
    return false;
  const finale = classeDeSigne(texte[fin - 1]);
  if (finale && classeDeSigne(texte[fin]) === finale)
    return false;
  return true;
}
function occurrencesDuLexique(texte, termes) {
  const parInitiale = new Map;
  for (const t of termes) {
    if (!t.ja || [...t.ja].length < 2)
      continue;
    const liste = parInitiale.get(t.ja[0]) ?? [];
    liste.push(t);
    parInitiale.set(t.ja[0], liste);
  }
  const candidates = [];
  for (let i = 0;i < texte.length; i++) {
    const liste = parInitiale.get(texte[i]);
    if (!liste)
      continue;
    for (const t of liste) {
      const fin = i + t.ja.length;
      if (texte.startsWith(t.ja, i) && bordsDeMot(texte, i, fin)) {
        candidates.push({ debut: i, fin, terme: t });
      }
    }
  }
  candidates.sort((a, b) => b.fin - b.debut - (a.fin - a.debut) || a.debut - b.debut);
  const occupe = new Uint8Array(texte.length);
  const retenues = [];
  for (const c of candidates) {
    let libre = true;
    for (let k = c.debut;k < c.fin; k++) {
      if (occupe[k]) {
        libre = false;
        break;
      }
    }
    if (!libre)
      continue;
    occupe.fill(1, c.debut, c.fin);
    retenues.push(c);
  }
  return retenues.toSorted((a, b) => a.debut - b.debut);
}
function masquerTermes(texte, termes, options = {}) {
  const max = options.max ?? Number.POSITIVE_INFINITY;
  const prefixe = options.prefixe ?? PREFIXE_JETON;
  const jetons = new Map;
  const jetonDe = new Map;
  let debordement = 0;
  let masque = "";
  let curseur = 0;
  for (const o of occurrencesDuLexique(texte, termes)) {
    let j = jetonDe.get(o.terme.ja);
    if (j === undefined) {
      if (jetons.size >= max) {
        j = null;
        debordement++;
      } else {
        j = jeton(jetons.size + 1, prefixe, options.largeur);
        jetons.set(j, o.terme);
      }
      jetonDe.set(o.terme.ja, j);
    }
    if (j === null)
      continue;
    masque += texte.slice(curseur, o.debut) + j;
    curseur = o.fin;
  }
  masque += texte.slice(curseur);
  return { masque, jetons, debordement };
}
var echappe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
var ABSORBE_AVANT = "\x01";
var ABSORBE_APRES = "\x02";
function restaurerJetons(traduction, table, prefixe = PREFIXE_JETON, largeur) {
  const parNumero = new Map;
  for (const [cle, fr] of table) {
    const m = /(\d{3,4})$/.exec(cle);
    if (m)
      parNumero.set(Number(m[1]), fr);
  }
  const texte = traduction.replace(motifJetons(prefixe, largeur), (brut, numero, decalage, source) => {
    const fr = parNumero.get(Number(numero));
    if (fr === undefined)
      return brut;
    const motFr = echappe(fr);
    const avant = source.slice(0, decalage);
    const apres = source.slice(decalage + brut.length);
    if (new RegExp(`(?:^|[^\\p{L}\\p{N}])${motFr}[ \\t]*$`, "iu").test(avant))
      return ABSORBE_AVANT;
    if (new RegExp(`^[ \\t]*${motFr}(?![\\p{L}\\p{N}])`, "iu").test(apres))
      return ABSORBE_APRES;
    return fr;
  }).replace(new RegExp(`[ \\t]*${ABSORBE_AVANT}`, "g"), "").replace(new RegExp(`${ABSORBE_APRES}[ \\t]*`, "g"), "");
  return { texte, residuels: jetonsResiduels(texte, prefixe, largeur) };
}

// apps/site/src/lib/ja/normalisation.ts
function normaliserJa(s) {
  return s.replace(/[\u30FB\uFF65\u00B7\s]/g, "");
}
function katakanaVersHiragana(s) {
  let out = "";
  for (const c of s) {
    const cp = c.codePointAt(0);
    out += cp >= 12449 && cp <= 12534 ? String.fromCodePoint(cp - 96) : c;
  }
  return out;
}

// scripts/plugin/src/lexique.ts
async function chargerLexique(dossier = join(import.meta.dir, "..", "references")) {
  const brut = await Bun.file(join(dossier, "lexique-canonique.json")).json();
  const termes = brut.donnees.toSorted((a, b) => b.length - a.length || a.ja.localeCompare(b.ja));
  return { revision: brut.revision, date: brut.date, termes };
}
var replierFr = (s) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
var replierJa = (s) => katakanaVersHiragana(normaliserJa(s)).replace(/[\u30FB\uFF65\s]/g, "");
function chercher(termes, requete, limite = 30) {
  const ja = replierJa(requete);
  const fr = replierFr(requete);
  const notes = [];
  for (const t of termes) {
    const tj = replierJa(t.ja);
    const tf = replierFr(t.fr);
    let note = 0;
    if (ja && tj === ja)
      note = 4;
    else if (fr && tf === fr)
      note = 4;
    else if (ja && tj.includes(ja))
      note = 2;
    else if (fr && (tf.includes(fr) || ` ${tf} `.includes(` ${fr} `)))
      note = 2;
    else if (ja && ja.includes(tj) && tj.length >= 2)
      note = 1;
    if (note)
      notes.push({ t, note });
  }
  return notes.toSorted((a, b) => b.note - a.note || a.t.ja.length - b.t.ja.length).slice(0, limite).map((n) => n.t);
}
async function texteArgument(valeur) {
  if (valeur === "-" || valeur === undefined)
    return (await Bun.stdin.text()).trim();
  return valeur;
}
async function main(args) {
  const json = args.includes("--json");
  const reste = args.filter((a) => a !== "--json");
  const [commande, ...suite] = reste;
  const { revision, date, termes } = await chargerLexique();
  const entete = `lexique ${termes.length} termes \u2014 instantan\xE9 ${revision} (${date})`;
  const iTable = suite.indexOf("--table");
  const fichierTable = iTable >= 0 ? suite[iTable + 1] : undefined;
  const mots = iTable >= 0 ? suite.slice(0, iTable) : suite;
  const valeur = mots.length ? mots.join(" ") : undefined;
  if (commande === "cherche") {
    if (!valeur)
      return usage();
    const trouves = chercher(termes, valeur);
    if (json)
      console.log(JSON.stringify({ revision, date, requete: valeur, resultats: trouves }, null, 2));
    else {
      console.log(entete);
      if (!trouves.length) {
        console.log(`aucun terme pour \xAB ${valeur} \xBB : non \xE9tabli dans le lexique (ce n'est pas une preuve de faute)`);
      }
      for (const t of trouves)
        console.log(`${t.ja}	${t.fr}	${t.kind}`);
    }
    return 0;
  }
  if (commande === "termes") {
    const texte = await texteArgument(valeur);
    const occ = occurrencesDuLexique(texte, termes).map((o) => ({
      debut: o.debut,
      ja: o.terme.ja,
      fr: o.terme.fr,
      kind: o.terme.kind
    }));
    if (json)
      console.log(JSON.stringify({ revision, date, occurrences: occ }, null, 2));
    else {
      console.log(entete);
      for (const o of occ)
        console.log(`${o.debut}	${o.ja}	${o.fr}	${o.kind}`);
      if (!occ.length)
        console.log("aucun terme du lexique dans ce texte");
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
      kind: t.kind
    }));
    console.log(JSON.stringify({ revision, date, masque, table, termes: termesTrouves, debordement }, null, 2));
    return 0;
  }
  if (commande === "restaure") {
    const texte = await texteArgument(valeur);
    if (!fichierTable)
      return usage();
    const brut = fichierTable.trim().startsWith("{") ? JSON.parse(fichierTable) : await Bun.file(fichierTable).json();
    const objet = brut.table ?? brut;
    const { texte: restaure, residuels } = restaurerJetons(texte, new Map(Object.entries(objet)));
    if (json)
      console.log(JSON.stringify({ texte: restaure, residuels }, null, 2));
    else {
      console.log(restaure);
      if (residuels.length)
        console.error(`jetons non restaur\xE9s : ${residuels.join(", ")} \u2014 traduction \xE0 refuser`);
    }
    return residuels.length ? 2 : 0;
  }
  return usage();
}
function usage() {
  console.error("usage : bun lexique.js cherche <terme> | termes <texte> | masque <texte> | restaure <traduction> --table <table.json> [--json]");
  return 1;
}
if (import.meta.main)
  process.exit(await main(Bun.argv.slice(2)));
export {
  chargerLexique,
  chercher
};
