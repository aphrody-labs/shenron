#!/usr/bin/env bun
/**
 * Aligne la doctrine de canonicité de production sur celle du dépôt.
 *
 * Passe par la route admin (`GET` puis `PUT /api/canon-config`), jamais par la
 * base : la route résout, borne et trace l'écriture comme pour l'éditeur.
 *
 * Le corps enregistré part de la doctrine de production et prend du dépôt :
 *   - `tiers`, `doctrine`, `sourcesAdmises`, `sourcesInterdites` en entier ;
 *   - chaque sujet tranché (`entries`) du dépôt, remplacé par identifiant
 *     (`--entrees a,b` restreint la liste) ; un sujet propre à la production
 *     est conservé et signalé.
 * Le reste (règles, puissance, repli, textes d'accueil) et les citations
 * saisies à la main restent ceux de la production. Les citations ingérées ne
 * sont pas renvoyées : depuis le correctif de `saveCanonConfig`, une citation
 * absente du document n'est plus retirée. Le script le vérifie avant d'écrire
 * (le `GET` doit porter `updatedAt` sur les citations ingérées) et refuse
 * d'enregistrer face à un site qui n'a pas encore ce correctif.
 *
 * Simulation par défaut : affiche le diff et les points attendus. `--write`
 * enregistre puis relit la production pour vérifier.
 *
 * Environnement : `SHENRON_ADMIN_TOKEN` (alias `API_ADMIN_TOKEN`), jamais
 * affiché ; origine par `--base <url>`, sinon `DATABOOKS_API_BASE` /
 * `SITE_INTERNAL_URL`, sinon le loopback `127.0.0.1:5011`.
 *
 * Usage :
 *   bun apps/site/scripts/canon-align.ts [--base <url>] [--entrees id,id] [--corps <fichier.json>]
 *   bun apps/site/scripts/canon-align.ts --write
 */
import {
  DEFAULT_CANON_CONFIG,
  resolveCanonConfig,
  type CanonConfig,
  type CanonReference,
  type CanonTopicEntry,
} from "../src/lib/canon-engine";
import { origineSite } from "./_origine-site";

/** Préfixe des citations d'auteur reformulées. */
export const PREFIXE_PARAPHRASE = "Paraphrase, pas une citation littérale — ";

/** Les sujets dont la production doit reprendre le contenu du dépôt (revue éditoriale). */
export const ENTREES_REVUES = [
  "c16-fils-gero",
  "daima",
  "fillers-anime-garlic-paikuhan",
  "gregory-kaio",
  "piccolo-favori",
  "broly-dbz-1993",
  "goku-saiyan-kakarotto",
] as const;

/**
 * Construit le corps du `PUT /api/canon-config` à partir de la doctrine de
 * production (telle que le `GET` la rend) et de celle du dépôt.
 */
export function construireCorpsAlignement(
  prod: CanonConfig,
  depot: CanonConfig = DEFAULT_CANON_CONFIG,
  options: { entrees?: readonly string[] } = {},
): CanonConfig {
  const filtre = options.entrees?.length ? new Set(options.entrees) : null;
  const duDepot = new Map(
    depot.entries.filter((e) => !filtre || filtre.has(e.id)).map((e) => [e.id, e]),
  );
  const entries: CanonTopicEntry[] = prod.entries.map((e) =>
    structuredClone(duDepot.get(e.id) ?? e),
  );
  const presentes = new Set(entries.map((e) => e.id));
  for (const e of duDepot.values()) if (!presentes.has(e.id)) entries.push(structuredClone(e));
  const references: CanonReference[] = prod.references
    .filter((r) => r.provenance === "manuel" && r.visible !== false)
    .map(({ visible: _visible, updatedAt: _updatedAt, ...r }) => r);
  return resolveCanonConfig({
    ...structuredClone(prod),
    tiers: structuredClone(depot.tiers),
    doctrine: [...depot.doctrine],
    sourcesAdmises: [...depot.sourcesAdmises],
    sourcesInterdites: [...depot.sourcesInterdites],
    entries,
    references,
  });
}

/**
 * Le site a-t-il le correctif de `saveCanonConfig` ? Seul le nouveau code rend
 * `updatedAt` sur les citations ingérées ; sans citation ingérée visible,
 * l'ancien code n'aurait rien à masquer.
 */
export function correctifCitationsDeploye(prod: CanonConfig): boolean {
  const ingerees = prod.references.filter((r) => r.provenance !== "manuel");
  return ingerees.length === 0 || ingerees.some((r) => typeof r.updatedAt === "string");
}

export interface Point {
  id: string;
  ok: boolean;
  detail: string;
}

function entree(c: CanonConfig, id: string): CanonTopicEntry | undefined {
  return c.entries.find((e) => e.id === id);
}

const memes = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** Les points de la revue éditoriale, vérifiés sur un document de doctrine. */
export function verifierPoints(c: CanonConfig, depot: CanonConfig = DEFAULT_CANON_CONFIG): Point[] {
  const points: Point[] = [];
  const point = (id: string, ok: boolean, detail: string) => points.push({ id, ok, detail });
  const c16 = entree(c, "c16-fils-gero");
  point(
    "c16-fils-gero.sources",
    !!c16 && !c16.sources.some((s) => /super exciting guide/i.test(s)),
    "sans « Super Exciting Guide »",
  );
  point(
    "daima.verdict",
    !!entree(c, "daima") && entree(c, "daima")?.verdict === entree(depot, "daima")?.verdict,
    "verdict du dépôt",
  );
  for (const id of ["fillers-anime-garlic-paikuhan", "gregory-kaio"]) {
    point(
      `${id}.sources`,
      !!entree(c, id) && memes(entree(c, id)?.sources, entree(depot, id)?.sources),
      "sources du dépôt",
    );
  }
  const piccolo = entree(c, "piccolo-favori");
  point(
    "piccolo-favori.sources",
    !!piccolo && !piccolo.sources.some((s) => s.includes("toriyama-interviews.md")),
    "sans « docs/toriyama-interviews.md »",
  );
  for (const id of ["piccolo-favori", "broly-dbz-1993", "goku-saiyan-kakarotto"]) {
    point(
      `${id}.toriyamaQuote.source`,
      !!entree(c, id)?.toriyamaQuote?.source.startsWith(PREFIXE_PARAPHRASE),
      `préfixe « ${PREFIXE_PARAPHRASE.trim()} »`,
    );
  }
  for (const champ of ["tiers", "doctrine", "sourcesAdmises", "sourcesInterdites"] as const) {
    point(champ, memes(c[champ], depot[champ]), "identique au dépôt");
  }
  point(
    "sourcesInterdites.fandom",
    c.sourcesInterdites.some(
      (s) => /fandom/i.test(s) && !/\b(sauf|hors|except|à condition|si )/i.test(s),
    ) && !c.sourcesAdmises.some((s) => /fandom/i.test(s)),
    "Fandom interdit sans condition",
  );
  return points;
}

// ── Diff lisible ────────────────────────────────────────────────────────────

function court(v: unknown): string {
  const s = typeof v === "string" ? v : JSON.stringify(v);
  return s.length > 160 ? `${s.slice(0, 157)}…` : s;
}

function diffListe(chemin: string, avant: readonly string[], apres: readonly string[]): string[] {
  const lignes: string[] = [];
  for (const x of avant) if (!apres.includes(x)) lignes.push(`  - ${chemin} : ${court(x)}`);
  for (const x of apres) if (!avant.includes(x)) lignes.push(`  + ${chemin} : ${court(x)}`);
  if (lignes.length === 0 && !memes(avant, apres)) lignes.push(`  ~ ${chemin} : ordre modifié`);
  return lignes;
}

function diffObjet(chemin: string, avant: object | undefined, apres: object | undefined): string[] {
  const a = (avant ?? {}) as Record<string, unknown>;
  const b = (apres ?? {}) as Record<string, unknown>;
  const lignes: string[] = [];
  for (const cle of new Set([...Object.keys(a), ...Object.keys(b)])) {
    const va = a[cle];
    const vb = b[cle];
    if (memes(va, vb)) continue;
    const ici = `${chemin}.${cle}`;
    if (Array.isArray(va) && Array.isArray(vb)) lignes.push(...diffListe(ici, va, vb));
    else if (va && vb && typeof va === "object" && typeof vb === "object")
      lignes.push(...diffObjet(ici, va, vb));
    else lignes.push(`  ~ ${ici} : ${court(va ?? "(absent)")} → ${court(vb ?? "(absent)")}`);
  }
  return lignes;
}

/** Identifiants des citations saisies à la main. */
function manuelles(c: CanonConfig): string[] {
  return c.references.filter((r) => r.provenance === "manuel").map((r) => r.id);
}

/** Diff de doctrine, citations ingérées exclues (elles ne sont pas réécrites). */
export function diffDoctrine(avant: CanonConfig, apres: CanonConfig): string[] {
  const lignes: string[] = [];
  for (const champ of ["doctrine", "sourcesAdmises", "sourcesInterdites"] as const) {
    lignes.push(...diffListe(champ, avant[champ], apres[champ]));
  }
  for (const t of apres.tiers) {
    lignes.push(
      ...diffObjet(
        `tiers[${t.id}]`,
        avant.tiers.find((x) => x.id === t.id),
        t,
      ),
    );
  }
  const ids = new Set(apres.entries.map((e) => e.id));
  for (const e of apres.entries) {
    const a = entree(avant, e.id);
    if (!a) lignes.push(`  + entries[${e.id}] : ${court(e.title)}`);
    else lignes.push(...diffObjet(`entries[${e.id}]`, a, e));
  }
  for (const e of avant.entries) {
    if (!ids.has(e.id)) lignes.push(`  - entries[${e.id}] : ${court(e.title)}`);
  }
  lignes.push(...diffListe("references(manuel)", manuelles(avant), manuelles(apres)));
  return lignes;
}

// ── Point d'entrée ──────────────────────────────────────────────────────────

async function appel(
  base: string,
  jeton: string,
  init: { method: "GET" | "PUT"; body?: string },
): Promise<{ config: CanonConfig }> {
  const res = await fetch(`${base}/api/canon-config`, {
    method: init.method,
    headers: { authorization: `Bearer ${jeton}`, "content-type": "application/json" },
    ...(init.body ? { body: init.body } : {}),
  });
  const texte = await res.text();
  if (!res.ok)
    throw new Error(`${init.method} /api/canon-config → HTTP ${res.status} ${texte.slice(0, 300)}`);
  const json = JSON.parse(texte) as { config?: CanonConfig };
  if (!json.config) throw new Error(`${init.method} /api/canon-config : réponse sans « config »`);
  return { config: json.config };
}

function afficherPoints(titre: string, points: Point[]): boolean {
  console.log(`\n${titre}`);
  for (const p of points) console.log(`  ${p.ok ? "✓" : "✗"} ${p.id} — ${p.detail}`);
  return points.every((p) => p.ok);
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  const opt = (n: string) => {
    const i = args.indexOf(`--${n}`);
    return i >= 0 ? args[i + 1] : undefined;
  };
  const ECRIRE = args.includes("--write");
  const base = (opt("base") ?? origineSite()).replace(/\/$/, "");
  const entrees = opt("entrees")
    ?.split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const jeton = (process.env.SHENRON_ADMIN_TOKEN ?? process.env.API_ADMIN_TOKEN ?? "").trim();
  if (!jeton) {
    console.error("SHENRON_ADMIN_TOKEN (ou API_ADMIN_TOKEN) absent de l'environnement.");
    process.exit(2);
  }

  const { config: prod } = await appel(base, jeton, { method: "GET" });
  const corps = construireCorpsAlignement(prod, DEFAULT_CANON_CONFIG, { entrees });
  const lignes = diffDoctrine(resolveCanonConfig(prod), corps);
  console.log(`Origine : ${base}${ECRIRE ? "" : " (simulation)"}`);
  console.log(
    `Doctrine de production : ${prod.entries.length} sujets, ${prod.heuristics.length} règles, ${prod.references.length} citations lues`,
  );
  console.log(
    lignes.length ? `\nDiff (${lignes.length}) :\n${lignes.join("\n")}` : "\nAucun écart.",
  );
  const valide = afficherPoints("Points attendus dans le corps :", verifierPoints(corps));

  const fichier = opt("corps");
  if (fichier) {
    await Bun.write(fichier, `${JSON.stringify(corps, null, 2)}\n`);
    console.log(`\nCorps écrit : ${fichier}`);
  }
  if (!valide) {
    console.error("\nLe corps ne satisfait pas les points attendus : rien n'est enregistré.");
    process.exit(1);
  }
  const deploye = correctifCitationsDeploye(prod);
  const SANS_CORRECTIF =
    "Le site ne rend pas `updatedAt` sur les citations ingérées : il n'a pas le correctif de saveCanonConfig et masquerait toutes les citations absentes du corps. Déployer d'abord.";
  if (!ECRIRE) {
    if (!deploye) console.warn(`\nAttention : ${SANS_CORRECTIF}`);
    console.log("\nSimulation : relancer avec --write pour enregistrer.");
    process.exit(0);
  }
  if (!deploye) {
    console.error(`\n${SANS_CORRECTIF}`);
    process.exit(1);
  }
  if (lignes.length === 0) {
    console.log("\nDéjà aligné : aucun enregistrement.");
    process.exit(0);
  }
  await appel(base, jeton, { method: "PUT", body: JSON.stringify(corps) });
  const { config: apres } = await appel(base, jeton, { method: "GET" });
  const ok = afficherPoints("Production après enregistrement :", verifierPoints(apres));
  const restants = diffDoctrine(resolveCanonConfig(apres), corps);
  console.log(
    restants.length ? `\nÉcarts restants :\n${restants.join("\n")}` : "\nProduction alignée.",
  );
  process.exit(ok && restants.length === 0 ? 0 : 1);
}
