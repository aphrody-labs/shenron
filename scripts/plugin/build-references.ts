#!/usr/bin/env bun
/**
 * Instantanés hors ligne du plugin Claude Code « shenron ».
 *
 * Le plugin s'installe seul depuis le sous-dossier `plugin/` : ni le site, ni
 * l'API, ni le RAG, ni le code du dépôt ne voyagent avec lui. Ce script copie
 * dans `plugin/` ce que le code du dépôt sait déjà, sous une forme autonome :
 *
 *   - canon : `canon-engine.ts` empaqueté en `canon.js` + doctrine lisible ;
 *   - lexique : `data/lexicon/terms.json` + moteur `@aphrody/shenron-lexicon` (`lexique.js`) ;
 *   - Toriyama : géométrie de `packages/ui/src/toriyama-svg/` (`toriyama.js`)
 *     et analyses visuelles de `docs/reference/*-analyse-visuelle.md` ;
 *   - faits : référence publique sourcée tirée des données embarquées du dépôt.
 *
 * Chaque sortie porte un en-tête « généré, ne pas éditer » et la révision Git
 * de ses sources ; `plugin/references/instantane.json` en tient le registre
 * (empreintes SHA-256 des sources et des sorties).
 *
 *   bun scripts/plugin/build-references.ts                # régénère
 *   bun scripts/plugin/build-references.ts --check        # échoue en cas de dérive
 *   bun scripts/plugin/build-references.ts --sources-depuis HEAD
 *        # lit les sources hors `scripts/plugin/` dans une révision Git
 *        # (utile quand l'arbre de travail porte le travail d'un autre agent)
 */
import { mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, posix, relative, resolve } from "node:path";
import type { BunPlugin } from "bun";
import { comparer, genererFaits } from "./faits";

export const RACINE = resolve(import.meta.dir, "..", "..");
const GENERATEUR = "scripts/plugin/build-references.ts";
export const MANIFESTE = "plugin/references/instantane.json";

export interface Options {
  check: boolean;
  depuis: string | null;
}

/** Une sortie générée : chemin relatif à la racine, contenu, sources. */
export interface Sortie {
  chemin: string;
  contenu: string;
  /** Sources de données : fixent la révision citée. */
  donnees: string[];
  /** Sources de code (empaquetées ou générateur de section) : empreintes seulement. */
  code: string[];
  /** Produit par `Bun.build` : l'octet exact dépend de la version de Bun. */
  paquet?: boolean;
}

interface EntreeManifeste {
  revision: string;
  date: string;
  sources: Record<string, string>;
  sha256: string;
  paquet?: boolean;
}

interface Manifeste {
  _genere: string;
  bun: string;
  sorties: Record<string, EntreeManifeste>;
}

// ── Lecture des sources ─────────────────────────────────────────────────────

const cache = new Map<string, string>();

function git(args: string[], cwd = RACINE): { ok: boolean; sortie: string } {
  const r = Bun.spawnSync(["git", ...args], { cwd, stdout: "pipe", stderr: "pipe" });
  return { ok: r.exitCode === 0, sortie: r.stdout.toString() };
}

/** Read committed content through a pinned submodule instead of treating its files as dirty. */
function gitSource(path: string, revision: string): { ok: boolean; sortie: string } {
  const direct = git(["show", revision + ":" + path]);
  if (direct.ok) return direct;
  const segments = path.split("/");
  for (let length = 1; length < segments.length; length++) {
    const prefix = segments.slice(0, length).join("/");
    const entry = git(["ls-tree", revision, "--", prefix]);
    const match = entry.sortie.match(/^160000 commit ([a-f0-9]+)\t/);
    if (entry.ok && match) {
      return git(["show", match[1] + ":" + segments.slice(length).join("/")], join(RACINE, prefix));
    }
  }
  return direct;
}

/** Texte d'une source : arbre de travail, ou révision Git hors `scripts/plugin/`. */
export async function lire(chemin: string, o: Options): Promise<string> {
  const cle = `${o.depuis ?? ""}:${chemin}`;
  const connu = cache.get(cle);
  if (connu !== undefined) return connu;
  let texte: string;
  if (o.depuis && !chemin.startsWith("scripts/plugin/")) {
    const r = gitSource(chemin, o.depuis);
    if (!r.ok) throw new Error(`source absente de ${o.depuis} : ${chemin}`);
    texte = r.sortie;
  } else {
    texte = await Bun.file(join(RACINE, chemin)).text();
  }
  cache.set(cle, texte);
  return texte;
}

export const sha256 = (texte: string) => new Bun.CryptoHasher("sha256").update(texte).digest("hex");

/** Révision et date du dernier commit touchant les sources de données. */
function revisionDe(donnees: string[], o: Options): { revision: string; date: string } {
  const ref = o.depuis ?? "HEAD";
  const r = git(["log", "-1", "--format=%h%x09%cs", ref, "--", ...donnees]);
  const [revision, date] = r.ok && r.sortie.trim() ? r.sortie.trim().split("\t") : [];
  if (!revision) return { revision: "non commitée", date: "inconnue" };
  if (!o.depuis) {
    const modifie = donnees.some((d) => {
      const tete = gitSource(d, "HEAD");
      return !tete.ok || tete.sortie !== cache.get(`:${d}`);
    });
    if (modifie) return { revision: `${revision}+modifications`, date: date ?? "inconnue" };
  }
  return { revision, date: date ?? "inconnue" };
}

// ── Empaquetage ─────────────────────────────────────────────────────────────

/** Empaquette `entree` (cible Bun, ESM) en lisant chaque source par `lire`. */
async function empaqueter(
  entree: string,
  o: Options,
  define: Record<string, string> = {},
): Promise<{ texte: string; sources: string[] }> {
  const lecteur: BunPlugin = {
    name: "sources-shenron",
    setup(build) {
      build.onLoad({ filter: /\.(ts|tsx|js|json)$/ }, async (args) => {
        const chemin = relative(RACINE, args.path).split("\\").join("/");
        const contenu = await lire(chemin, o);
        const loader = chemin.endsWith(".json")
          ? "json"
          : chemin.endsWith(".tsx")
            ? "tsx"
            : chemin.endsWith(".js")
              ? "js"
              : "ts";
        return { contents: contenu, loader };
      });
    },
  };
  const r = await Bun.build({
    entrypoints: [join(RACINE, entree)],
    target: "bun",
    format: "esm",
    root: RACINE,
    metafile: true,
    define,
    plugins: [lecteur],
  });
  if (!r.success) throw new Error(`empaquetage de ${entree} : ${r.logs.map(String).join("\n")}`);
  const sources = Object.keys(r.metafile?.inputs ?? {})
    .map((p) => relative(RACINE, resolve(RACINE, p)).split("\\").join("/"))
    .toSorted();
  return { texte: await r.outputs[0]!.text(), sources };
}

// ── En-têtes ────────────────────────────────────────────────────────────────

export interface Contexte {
  revision: string;
  date: string;
  sources: string[];
}

export function enteteMarkdown(c: Contexte): string {
  return `<!-- Généré par ${GENERATEUR} — ne pas éditer. Sources : ${c.sources.join(", ")}. -->

> **Instantané hors ligne** — sources du dépôt Shenron (${c.sources.map((s) => `\`${s}\``).join(", ")}),
> révision \`${c.revision}\` du ${c.date}. Citer cette révision et cette date avec toute
> réponse tirée d'ici ; une source vivante plus récente peut avoir changé.

`;
}

function enteteJs(texte: string, c: Contexte): string {
  const corps = texte.startsWith("// @bun") ? texte.slice(texte.indexOf("\n") + 1) : texte;
  return `// @bun
// Généré par ${GENERATEUR} — ne pas éditer.
// Sources : ${c.sources.join(", ")}
// Révision : ${c.revision} (${c.date})
${corps}`;
}

export function json(c: Contexte, donnees: unknown, extra: Record<string, unknown> = {}): string {
  return `${JSON.stringify(
    {
      _genere: `Généré par ${GENERATEUR} — ne pas éditer.`,
      sources: c.sources,
      revision: c.revision,
      date: c.date,
      ...extra,
      donnees,
    },
    null,
    1,
  )}\n`;
}

/** Réécrit les liens relatifs d'un document du dépôt : hors `plugin/`, ils seraient morts. */
export function liensVersDepot(markdown: string, document: string): string {
  return markdown.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (tout, texte: string, cible: string) => {
    if (/^(https?:|mailto:|#)/.test(cible)) return tout;
    const [chemin] = cible.split("#");
    const depot = posix.normalize(posix.join(posix.dirname(document), chemin!));
    const nu = texte.replace(/^`|`$/g, "");
    return nu === depot || depot.endsWith(nu) ? `\`${depot}\`` : `${texte} (\`${depot}\`)`;
  });
}

// ── Sections ────────────────────────────────────────────────────────────────

type Section = (o: Options, ctx: (donnees: string[]) => Promise<Contexte>) => Promise<Sortie[]>;

/** Importe un module empaqueté (texte) depuis un fichier temporaire. */
async function importer<T>(texte: string, nom: string): Promise<T> {
  const dossier = join(tmpdir(), `shenron-plugin-${process.pid}`);
  await mkdir(dossier, { recursive: true });
  const fichier = join(dossier, `${nom}-${sha256(texte).slice(0, 12)}.js`);
  await Bun.write(fichier, texte);
  return (await import(fichier)) as T;
}

const sectionCanon: Section = async (o, ctx) => {
  const moteur = "apps/site/src/lib/canon-engine.ts";
  const c = await ctx([moteur]);
  const { texte, sources } = await empaqueter("scripts/plugin/src/canon.ts", o, {
    __INSTANTANE__: JSON.stringify({ revision: c.revision, date: c.date, source: moteur }),
  });
  const module = await importer<typeof import("./src/canon")>(
    enteteJs(texte, { ...c, sources }),
    "canon",
  );
  const code = sources.filter((s) => s !== moteur);
  return [
    {
      chemin: "plugin/skills/dragon-ball-canon/scripts/canon.js",
      contenu: enteteJs(texte, { ...c, sources }),
      donnees: [moteur],
      code,
      paquet: true,
    },
    {
      chemin: "plugin/skills/dragon-ball-canon/references/doctrine.md",
      contenu: doctrineMarkdown(module.DEFAULT_CANON_CONFIG, c),
      donnees: [moteur],
      code: [GENERATEUR],
    },
  ];
};

type Config = (typeof import("./src/canon"))["DEFAULT_CANON_CONFIG"];

const cellule = (s: string) => s.replace(/\|/g, "\\|").replace(/\n+/g, " ");

export function doctrineMarkdown(config: Config, c: Contexte): string {
  const l: string[] = [
    "# Doctrine de canonicité Shenron",
    "",
    enteteMarkdown(c).trimEnd(),
    "",
    "Doctrine **livrée avec le dépôt** (défauts de `canon-engine.ts`). La doctrine de",
    "production se retouche dans `/admin/canon` du site et peut s'en écarter ; le corpus",
    "de références (`canon_references`), les planches et les fiches vivent en base et",
    "ne sont pas embarqués. Le verdict d'une question se calcule hors ligne par",
    '`bun scripts/canon.js "question"` (même moteur que `GET /api/canon?q=`).',
    "",
    "Ordre de décision du moteur : 1. sujet tranché (`entry:<id>`, mots-clés et titre) ;",
    "2. famille de formulations (`heuristic:<id>`, rang présumé) ; 3. `fallback` (non tranché).",
    "Le `score` exprime l'autorité du rang ou du sujet, **pas une probabilité** : chaque",
    "sujet porte son propre score, le score du rang ne sert que de défaut.",
    "",
    "## Rangs",
    "",
    "| Rang | Libellé | Score par défaut |",
    "| --- | --- | --- |",
    ...config.tiers.map((t) => `| \`${t.id}\` | ${cellule(t.label)} | ${t.score} |`),
    "",
  ];
  for (const t of config.tiers) {
    l.push(
      `### ${t.id}`,
      "",
      t.definition,
      "",
      "Inclut (doctrine générale, à confronter au sujet tranché) :",
      "",
    );
    for (const i of t.inclut) l.push(`- ${i}`);
    l.push("");
  }
  l.push("## Règles générales", "");
  for (const r of config.doctrine) l.push(`- ${r}`);
  l.push("", "## Sources admises", "");
  for (const s of config.sourcesAdmises) l.push(`- ${s}`);
  l.push("", "## Sources refusées", "");
  for (const s of config.sourcesInterdites) l.push(`- ${s}`);
  l.push(
    "",
    "## Familles de formulations (rang présumé, jamais un verdict établi)",
    "",
    "| Identifiant | Libellé | Rang | Score | Mots-clés |",
    "| --- | --- | --- | --- | --- |",
    ...config.heuristics.map(
      (h) =>
        `| \`${h.id}\` | ${cellule(h.label)} | \`${h.tier}\` | ${h.score} | ${cellule(h.keywords.join(", "))} |`,
    ),
    "",
    "## Repli (`fallback`)",
    "",
    `Rang \`${config.fallback.tier}\`, score ${config.fallback.score} : ${config.fallback.verdict} ${config.fallback.explanation}`,
    "Un `fallback` n'établit aucun rang : répondre « non établi ».",
    "",
    `## Sujets tranchés (${config.entries.length})`,
    "",
    "| Identifiant | Sujet | Catégorie | Rang | Score |",
    "| --- | --- | --- | --- | --- |",
    ...config.entries.map(
      (e) => `| \`${e.id}\` | ${cellule(e.title)} | ${e.category} | \`${e.tier}\` | ${e.score} |`,
    ),
    "",
  );
  for (const e of config.entries) {
    l.push(`### ${e.title}`, "");
    l.push(
      `- Identifiant : \`${e.id}\` · catégorie ${e.category} · rang \`${e.tier}\` · score ${e.score}`,
    );
    l.push(`- Verdict : ${e.verdict}`);
    l.push(`- Explication : ${e.explanation}`);
    if (e.toriyamaQuote) {
      const q = e.toriyamaQuote;
      l.push(
        `- Citation : « ${q.text} » — ${q.source || "source non précisée"}${q.year ? `, ${q.year}` : ""}`,
      );
    }
    if (e.sources.length) {
      l.push("- Sources :");
      for (const s of e.sources) l.push(`  - ${s}`);
    } else l.push("- Sources : aucune (verdict non sourcé dans la doctrine)");
    l.push(`- Mots-clés : ${e.keywords.join(", ")}`);
    l.push(
      `- Page du site : https://dragonballfr.com/wiki/canon?q=${encodeURIComponent(e.title)}`,
      "",
    );
  }
  return `${l.join("\n").trimEnd()}\n`;
}

const sectionLexique: Section = async (o, ctx) => {
  const donnees = "data/lexicon/terms.json";
  const c = await ctx([donnees]);
  const { terms } = JSON.parse(await lire(donnees, o)) as {
    terms: { id: string; kind: string; ja: string; fr: string; en: string }[];
  };
  const { texte, sources } = await empaqueter("scripts/plugin/src/lexique.ts", o);
  const parType = new Map<string, typeof terms>();
  for (const t of terms.toSorted(
    (a, b) => comparer(a.fr.toLowerCase(), b.fr.toLowerCase()) || comparer(a.ja, b.ja),
  )) {
    parType.set(t.kind, [...(parType.get(t.kind) ?? []), t]);
  }
  const anglais = terms.filter((t) => t.en).length;
  const md: string[] = [
    "# Lexique canonique japonais → français → anglais",
    "",
    enteteMarkdown({ ...c, sources: [donnees] }).trimEnd(),
    "",
    `${terms.length} termes (${anglais} avec leur forme anglaise établie) : graphie japonaise, forme française`,
    "du wiki dragonballfr.com et forme anglaise officielle quand une source du dépôt l'établit (« — » :",
    "non établie, ne pas l'inventer). Le lexique sert au masquage avant traduction ; il n'est pas",
    "exhaustif et l'absence d'un terme ne prouve aucune faute. Recherche et masquage :",
    "`bun scripts/lexique.js`.",
    "",
  ];
  for (const [type, liste] of [...parType].toSorted(([a], [b]) => comparer(a, b))) {
    md.push(
      `## ${type} (${liste.length})`,
      "",
      "| Japonais | Forme française | Forme anglaise |",
      "| --- | --- | --- |",
    );
    for (const t of liste)
      md.push(`| ${cellule(t.ja)} | ${cellule(t.fr)} | ${cellule(t.en || "—")} |`);
    md.push("");
  }
  return [
    {
      chemin: "plugin/skills/dragon-ball-japonais/references/lexique-canonique.json",
      contenu: json({ ...c, sources: [donnees] }, terms, {
        champs: {
          id: "identifiant stable (slug anglais)",
          kind: "type de terme (character, technique, place…)",
          ja: "graphie japonaise",
          fr: "forme française (wiki)",
          en: "forme anglaise officielle (vide : non établie)",
          romaji: "romanisation Hepburn (facultative)",
          aliases: "autres graphies attestées par langue",
          sources: "provenance des champs",
        },
      }),
      donnees: [donnees],
      code: [GENERATEUR],
    },
    {
      chemin: "plugin/skills/dragon-ball-japonais/references/lexique-canonique.md",
      contenu: `${md.join("\n").trimEnd()}\n`,
      donnees: [donnees],
      code: [GENERATEUR],
    },
    {
      chemin: "plugin/skills/dragon-ball-japonais/scripts/lexique.js",
      contenu: enteteJs(texte, { ...c, sources }),
      donnees: [donnees],
      code: sources,
      paquet: true,
    },
  ];
};

const sectionToriyama: Section = async (o, ctx) => {
  const { texte, sources } = await empaqueter("scripts/plugin/src/toriyama.ts", o);
  const geometrie = sources.filter((s) => s.startsWith("packages/"));
  const cGeo = await ctx(geometrie);
  const sorties: Sortie[] = [
    {
      chemin: "plugin/skills/toriyama-svg/scripts/toriyama.js",
      contenu: enteteJs(texte, { ...cGeo, sources }),
      donnees: geometrie,
      code: sources.filter((s) => !geometrie.includes(s)),
      paquet: true,
    },
  ];
  const documents = o.depuis
    ? git(["ls-tree", "--name-only", o.depuis, "docs/reference/"])
        .sortie.split("\n")
        .filter((p) => p.endsWith("-analyse-visuelle.md"))
    : (
        await Array.fromAsync(
          new Bun.Glob("docs/reference/*-analyse-visuelle.md").scan({ cwd: RACINE }),
        )
      ).map((p) => p.split("\\").join("/"));
  for (const doc of documents.toSorted()) {
    const c = await ctx([doc]);
    const brut = await lire(doc, o);
    const titre = brut.match(/^# .*$/m)?.[0] ?? `# ${doc}`;
    const corps = liensVersDepot(brut.replace(/^# .*\n+/m, ""), doc);
    const note =
      "Les outils cités ici (`sharp`, Pillow, `mesurer.py`) sont ceux de la mesure d'origine ; la skill\n" +
      "les remplace par `scripts/mesurer.ts`, `rendu.ts` et `icones.ts` (Bun seul, même algorithme).\n" +
      "Les chemins `apps/`, `packages/` et `docs/` désignent le dépôt Shenron, absent d'une\n" +
      "installation du plugin seul.\n\n";
    sorties.push({
      chemin: `plugin/skills/toriyama-svg/references/mesures/${posix.basename(doc)}`,
      contenu: `${titre}\n\n${enteteMarkdown(c)}${note}${corps.trimEnd()}\n`,
      donnees: [doc],
      code: [GENERATEUR],
    });
  }
  return sorties;
};

async function charger<T>(entree: string, o: Options): Promise<{ module: T; sources: string[] }> {
  const { texte, sources } = await empaqueter(entree, o);
  return { module: await importer<T>(texte, posix.basename(entree, ".ts")), sources };
}

const sectionFaits: Section = async (o, ctx) =>
  genererFaits(o, ctx, { lire, json, enteteMarkdown, charger });

const SECTIONS: Section[] = [sectionCanon, sectionLexique, sectionToriyama, sectionFaits];

// ── Registre et vérification ────────────────────────────────────────────────

async function lireManifeste(o: Options): Promise<Manifeste | null> {
  const f = Bun.file(join(RACINE, MANIFESTE));
  if (!(await f.exists())) return null;
  void o;
  return (await f.json()) as Manifeste;
}

async function empreintes(chemins: string[], o: Options): Promise<Record<string, string>> {
  const r: Record<string, string> = {};
  for (const c of [...new Set(chemins)].toSorted()) r[c] = sha256(await lire(c, o));
  return r;
}

const memes = (a: Record<string, string>, b: Record<string, string>) =>
  JSON.stringify(a) === JSON.stringify(b);

export async function generer(
  o: Options,
): Promise<{ sorties: Sortie[]; manifeste: Manifeste; ancien: Manifeste | null }> {
  const ancien = await lireManifeste(o);
  // Le générateur doit être lu une fois pour l'empreinte des sections qui le citent.
  await lire(GENERATEUR, o);
  const sorties: Sortie[] = [];
  const contextes = new Map<string, Contexte>();
  for (const section of SECTIONS) {
    const ctx = async (donnees: string[]): Promise<Contexte> => {
      const cle = donnees.toSorted().join("|");
      const connu = contextes.get(cle);
      if (connu) return connu;
      const sources = await empreintes(donnees, o);
      // Sources inchangées depuis le registre : on garde la révision citée, ce
      // qui rend la sortie stable (CI en clone superficiel, rebase, etc.).
      const precedent = Object.values(ancien?.sorties ?? {}).find(
        (e) =>
          memes(
            Object.fromEntries(Object.entries(e.sources).filter(([k]) => donnees.includes(k))),
            sources,
          ) && donnees.every((d) => d in e.sources),
      );
      // A previously uncommitted snapshot can become a committed source without changing bytes.
      const committed = precedent?.revision.endsWith("+modifications")
        ? revisionDe(donnees, o)
        : null;
      const rev =
        precedent && (!committed || committed.revision.endsWith("+modifications"))
          ? { revision: precedent.revision, date: precedent.date }
          : (committed ?? revisionDe(donnees, o));
      const c = { ...rev, sources: donnees.toSorted() };
      contextes.set(cle, c);
      return c;
    };
    sorties.push(...(await section(o, ctx)));
  }
  const manifeste: Manifeste = {
    _genere: `Généré par ${GENERATEUR} — ne pas éditer. Registre des instantanés hors ligne du plugin.`,
    bun: Bun.version,
    sorties: {},
  };
  for (const s of sorties.toSorted((a, b) => comparer(a.chemin, b.chemin))) {
    const c = contextes.get(s.donnees.toSorted().join("|"));
    manifeste.sorties[s.chemin] = {
      revision: c?.revision ?? "inconnue",
      date: c?.date ?? "inconnue",
      sources: await empreintes([...s.donnees, ...s.code], o),
      sha256: sha256(s.contenu),
      ...(s.paquet ? { paquet: true } : {}),
    };
  }
  return { sorties, manifeste, ancien };
}

const texteManifeste = (m: Manifeste) => `${JSON.stringify(m, null, 2)}\n`;

export async function verifier(o: Options): Promise<string[]> {
  const { sorties, manifeste, ancien } = await generer(o);
  const derives: string[] = [];
  for (const s of sorties) {
    const f = Bun.file(join(RACINE, s.chemin));
    const actuel = (await f.exists()) ? await f.text() : null;
    if (actuel === s.contenu) continue;
    const trace = ancien?.sorties[s.chemin];
    // Un paquet dépend de la version de Bun : on l'accepte si ses sources sont
    // inchangées, s'il n'a pas été retouché et si seule la version diffère.
    if (
      s.paquet &&
      actuel !== null &&
      trace &&
      ancien.bun !== Bun.version &&
      memes(trace.sources, manifeste.sorties[s.chemin]!.sources) &&
      trace.sha256 === sha256(actuel)
    ) {
      manifeste.sorties[s.chemin]!.sha256 = trace.sha256;
      continue;
    }
    derives.push(
      actuel === null ? `${s.chemin} : absent` : `${s.chemin} : diffère de la génération`,
    );
  }
  for (const chemin of Object.keys(ancien?.sorties ?? {})) {
    if (!manifeste.sorties[chemin]) derives.push(`${chemin} : sortie orpheline (plus générée)`);
  }
  if (ancien) manifeste.bun = ancien.bun;
  const attendu = texteManifeste(manifeste);
  const f = Bun.file(join(RACINE, MANIFESTE));
  if (!(await f.exists()) || (await f.text()) !== attendu)
    derives.push(`${MANIFESTE} : registre à régénérer`);
  return derives;
}

export async function ecrire(o: Options): Promise<string[]> {
  const { sorties, manifeste, ancien } = await generer(o);
  const ecrits: string[] = [];
  for (const s of sorties) {
    const cible = join(RACINE, s.chemin);
    const f = Bun.file(cible);
    if ((await f.exists()) && (await f.text()) === s.contenu) continue;
    await mkdir(dirname(cible), { recursive: true });
    await Bun.write(cible, s.contenu);
    ecrits.push(s.chemin);
  }
  for (const chemin of Object.keys(ancien?.sorties ?? {})) {
    if (!manifeste.sorties[chemin]) {
      await rm(join(RACINE, chemin), { force: true });
      ecrits.push(`${chemin} (supprimé)`);
    }
  }
  await mkdir(dirname(join(RACINE, MANIFESTE)), { recursive: true });
  const texte = texteManifeste(manifeste);
  const f = Bun.file(join(RACINE, MANIFESTE));
  if (!(await f.exists()) || (await f.text()) !== texte) {
    await Bun.write(join(RACINE, MANIFESTE), texte);
    ecrits.push(MANIFESTE);
  }
  return ecrits;
}

if (import.meta.main) {
  const args = Bun.argv.slice(2);
  const i = args.indexOf("--sources-depuis");
  const o: Options = {
    check: args.includes("--check"),
    depuis: i >= 0 ? (args[i + 1] ?? "HEAD") : null,
  };
  if (o.check) {
    const derives = await verifier(o);
    if (derives.length) {
      console.error("✗ instantanés du plugin en dérive :");
      for (const d of derives) console.error(`  - ${d}`);
      console.error(`→ bun ${GENERATEUR}`);
      process.exit(1);
    }
    console.log("✓ instantanés du plugin à jour");
  } else {
    const ecrits = await ecrire(o);
    console.log(
      ecrits.length
        ? ecrits.map((e) => `écrit : ${e}`).join("\n")
        : "rien à écrire, instantanés à jour",
    );
  }
  await rm(join(tmpdir(), `shenron-plugin-${process.pid}`), { recursive: true, force: true });
}
