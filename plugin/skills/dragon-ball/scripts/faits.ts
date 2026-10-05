#!/usr/bin/env bun
/**
 * Interroge hors ligne la référence publique sourcée du plugin
 * (`../references/faits.json`, instantané généré depuis le dépôt Shenron).
 * Aucun réseau, aucune dépendance : Bun seul.
 *
 *   bun faits.ts sections                 thèmes et nombre d'enregistrements
 *   bun faits.ts cherche <terme>          recherche dans tous les thèmes
 *   bun faits.ts section <thème>          un thème entier
 *   bun faits.ts citation <id>            une déclaration d'auteur complète
 *   (--json : sortie machine)
 *
 * Chaque résultat garde sa source : la citer avec la révision et la date de
 * l'instantané. Un terme introuvable n'est pas une preuve d'absence : il est
 * « non établi » hors ligne.
 */
import { join } from "node:path";

interface Instantane {
  revision: string;
  date: string;
  sources: string[];
  donnees: Record<string, unknown>;
}

export async function chargerFaits(
  dossier = join(import.meta.dir, "..", "references"),
): Promise<Instantane> {
  return (await Bun.file(join(dossier, "faits.json")).json()) as Instantane;
}

const replier = (s: string) =>
  s
    .normalize("NFKC")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[・･\s\-'’.]+/g, "");

/** Les enregistrements d'un thème : liste, ou objet aplati en une entrée. */
function enregistrements(valeur: unknown): Record<string, unknown>[] {
  if (Array.isArray(valeur)) return valeur as Record<string, unknown>[];
  if (valeur && typeof valeur === "object") {
    const objet = valeur as Record<string, unknown>;
    const listes = Object.entries(objet).filter(([, v]) => Array.isArray(v));
    if (
      listes.length &&
      listes.every(([, v]) => (v as unknown[]).every((x) => x && typeof x === "object"))
    ) {
      return listes.flatMap(([cle, v]) =>
        (v as Record<string, unknown>[]).map((x) => ({ _groupe: cle, ...x })),
      );
    }
    return [objet];
  }
  return [];
}

export function chercher(faits: Instantane, terme: string) {
  const cle = replier(terme);
  const trouves: { theme: string; enregistrement: Record<string, unknown> }[] = [];
  if (!cle) return trouves;
  for (const [theme, valeur] of Object.entries(faits.donnees)) {
    if (theme === "non_embarque") continue;
    for (const e of enregistrements(valeur)) {
      if (replier(JSON.stringify(e)).includes(cle)) trouves.push({ theme, enregistrement: e });
    }
  }
  return trouves;
}

function resume(e: Record<string, unknown>): string {
  const champs = [
    "nom",
    "personnage",
    "forme",
    "objet",
    "nom_fr",
    "slug",
    "titre",
    "id",
    "rang",
    "theme",
  ];
  const titre = champs.map((c) => e[c]).find((v) => v !== undefined) ?? "";
  const reste = Object.entries(e)
    .filter(([k, v]) => !champs.includes(k) && k !== "_groupe" && typeof v !== "object")
    .map(([k, v]) => `${k}=${String(v).length > 160 ? `${String(v).slice(0, 157)}…` : v}`);
  const chapitre = (e.premier_chapitre as { numero?: number } | undefined)?.numero;
  if (chapitre !== undefined) reste.unshift(`premier_chapitre=${chapitre}`);
  const preuves = JSON.stringify(e).match(/https:\/\/[^"]+/g) ?? [];
  return [String(titre), ...reste, ...[...new Set(preuves)].slice(0, 3)].join(" · ");
}

async function main(args: string[]): Promise<number> {
  const json = args.includes("--json");
  const [commande, ...suite] = args.filter((a) => a !== "--json");
  const faits = await chargerFaits();
  const entete = `instantané ${faits.revision} du ${faits.date} (sources : ${faits.sources.length} fichiers du dépôt Shenron)`;
  const valeur = suite.join(" ").trim();

  if (commande === "sections") {
    const liste = Object.entries(faits.donnees).map(([theme, v]) => ({
      theme,
      enregistrements: enregistrements(v).length,
    }));
    if (json)
      console.log(
        JSON.stringify({ revision: faits.revision, date: faits.date, themes: liste }, null, 2),
      );
    else {
      console.log(entete);
      for (const t of liste) console.log(`${t.theme}\t${t.enregistrements}`);
    }
    return 0;
  }
  if (commande === "cherche" && valeur) {
    const trouves = chercher(faits, valeur);
    if (json) {
      console.log(
        JSON.stringify(
          { revision: faits.revision, date: faits.date, requete: valeur, resultats: trouves },
          null,
          2,
        ),
      );
      return 0;
    }
    console.log(entete);
    if (!trouves.length) {
      console.log(
        `« ${valeur} » : rien dans l'instantané — statut non établi hors ligne (pas une preuve d'absence).`,
      );
      return 0;
    }
    for (const t of trouves.slice(0, 40)) console.log(`[${t.theme}] ${resume(t.enregistrement)}`);
    if (trouves.length > 40)
      console.log(`… ${trouves.length - 40} autres résultats (--json pour tout)`);
    console.log("statut : établi (instantané) par la source citée de chaque ligne");
    return 0;
  }
  if (commande === "section" && valeur) {
    const v = faits.donnees[valeur];
    if (v === undefined) {
      console.error(`thème inconnu : ${valeur} — voir « bun faits.ts sections »`);
      return 1;
    }
    console.log(
      JSON.stringify(
        { revision: faits.revision, date: faits.date, theme: valeur, donnees: v },
        null,
        2,
      ),
    );
    return 0;
  }
  if (commande === "citation" && valeur) {
    const c = (faits.donnees.declarations_auteur as { id: string }[]).find((x) => x.id === valeur);
    if (!c) {
      console.error(
        `citation inconnue : ${valeur} — voir « bun faits.ts section declarations_auteur »`,
      );
      return 1;
    }
    console.log(JSON.stringify({ revision: faits.revision, date: faits.date, ...c }, null, 2));
    return 0;
  }
  console.error(
    "usage : bun faits.ts sections | cherche <terme> | section <thème> | citation <id> [--json]",
  );
  return 1;
}

if (import.meta.main) process.exit(await main(Bun.argv.slice(2)));
