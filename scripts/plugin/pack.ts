#!/usr/bin/env bun
/**
 * Paquet portable du plugin « shenron » : pour un assistant sans outils (Gemini
 * web app, Gem : fichiers ou archive téléversés), pour le dossier `dbfr` du
 * Drive, et comme corpus d'entraînement (agent home + plugin).
 *
 *   bun scripts/plugin/pack.ts                         # var/plugin-pack/
 *   bun scripts/plugin/pack.ts --sortie DIR
 *   bun scripts/plugin/pack.ts --drive gdrive:dbfr     # + rclone sync, puis rclone check
 *
 * Contenu (rien de privé : plugin suivi par Git, agent home PUBLIC, SVG générés) :
 *   shenron-plugin/              le plugin, plus agent-home/ et assets/
 *   shenron-plugin.zip           la même arborescence, archive ZIP (UTF-8, deflate)
 *   shenron-gemini.md            un seul fichier : GEMINI.md, agent home, toutes les
 *                                pages du plugin et les déclarations d'auteur intégrales
 *   shenron-chunks.jsonl         corpus découpé `{id, title, text, doc_id, source_path, url?}`,
 *                                entrée de `aphrody shenron train triples`
 *   manifest.json                empreintes SHA-256, version, révision
 */
import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { deflateRawSync } from "node:zlib";
import { RACINE, sha256 } from "./build-references";
import { comparer } from "./faits";

export interface Fichier {
  /** Chemin dans le paquet (`shenron-plugin/…`). */
  chemin: string;
  contenu: Uint8Array;
}

const RACINE_PAQUET = "shenron-plugin";
const texte = (s: string) => new TextEncoder().encode(s);
const lireTexte = (f: Fichier) => new TextDecoder().decode(f.contenu);

function git(args: string[]): string {
  const r = Bun.spawnSync(["git", ...args], { cwd: RACINE, stdout: "pipe", stderr: "pipe" });
  return r.exitCode === 0 ? r.stdout.toString().trim() : "";
}

/** Fichiers suivis ou non ignorés par Git sous `dossier` (contenu de l'arbre de travail). */
async function suivis(dossier: string): Promise<string[]> {
  const liste = git(["ls-files", "--cached", "--others", "--exclude-standard", "--", dossier])
    .split("\n")
    .filter(Boolean);
  const presents = await Promise.all(
    liste.map(async (p) => ((await Bun.file(join(RACINE, p)).exists()) ? p : null)),
  );
  return presents.filter((p): p is string => p !== null).toSorted(comparer);
}

/** Les SVG de référence, sortis de la géométrie embarquée (`toriyama.js`). */
async function assets(): Promise<Fichier[]> {
  const t = await import(join(RACINE, "plugin/skills/toriyama-svg/scripts/toriyama.js"));
  const sorties: [string, string][] = [
    ...[1, 2, 3, 4, 5, 6, 7].map((n): [string, string] => [
      `dragon-ball-${n}-etoile${n > 1 ? "s" : ""}.svg`,
      t.svgSphere(n),
    ]),
    ["kinto-un.svg", t.kintoUn.svgIllustration()],
    ["kinto-un-icone.svg", t.kintoUn.svgIcone()],
    ["kinto-un-icone-petite.svg", t.kintoUn.svgIcone({ volutes: false })],
    ["kinto-un-maskable.svg", t.kintoUn.svgIcone({ coins: 0, echelle: 0.8 })],
    ["kinto-un-monochrome.svg", t.kintoUn.svgMonochrome()],
    ["banc-nuage.svg", t.couverture.svgBancNuage()],
    ["etoile-couverture.svg", t.svgEtoile(50)],
  ];
  return sorties.map(([nom, svg]) => ({
    chemin: `${RACINE_PAQUET}/assets/${nom}`,
    contenu: texte(svg),
  }));
}

export async function fichiersDuPaquet(): Promise<Fichier[]> {
  const sortie: Fichier[] = [];
  for (const p of await suivis("plugin")) {
    sortie.push({
      chemin: `${RACINE_PAQUET}/${p.slice("plugin/".length)}`,
      contenu: await Bun.file(join(RACINE, p)).bytes(),
    });
  }
  for (const p of await suivis("agent-home")) {
    sortie.push({
      chemin: `${RACINE_PAQUET}/${p}`,
      contenu: await Bun.file(join(RACINE, p)).bytes(),
    });
  }
  sortie.push(...(await assets()));
  return sortie.toSorted((a, b) => comparer(a.chemin, b.chemin));
}

// ── ZIP ─────────────────────────────────────────────────────────────────────

/** Archive ZIP déterministe (date fixe 2026-01-01, noms UTF-8, deflate). */
export function zip(fichiers: Fichier[]): Uint8Array {
  const DATE = ((2026 - 1980) << 9) | (1 << 5) | 1;
  const locaux: Uint8Array[] = [];
  const centraux: Uint8Array[] = [];
  let decalage = 0;
  for (const f of fichiers) {
    const nom = texte(f.chemin);
    const comprime = new Uint8Array(deflateRawSync(f.contenu, { level: 9 }));
    const crc = Bun.hash.crc32(f.contenu);
    const local = new Uint8Array(30 + nom.length + comprime.length);
    const l = new DataView(local.buffer);
    l.setUint32(0, 0x04034b50, true);
    l.setUint16(4, 20, true);
    l.setUint16(6, 0x0800, true);
    l.setUint16(8, 8, true);
    l.setUint16(10, 0, true);
    l.setUint16(12, DATE, true);
    l.setUint32(14, crc, true);
    l.setUint32(18, comprime.length, true);
    l.setUint32(22, f.contenu.length, true);
    l.setUint16(26, nom.length, true);
    local.set(nom, 30);
    local.set(comprime, 30 + nom.length);
    const central = new Uint8Array(46 + nom.length);
    const c = new DataView(central.buffer);
    c.setUint32(0, 0x02014b50, true);
    c.setUint16(4, 20, true);
    c.setUint16(6, 20, true);
    c.setUint16(8, 0x0800, true);
    c.setUint16(10, 8, true);
    c.setUint16(14, DATE, true);
    c.setUint32(16, crc, true);
    c.setUint32(20, comprime.length, true);
    c.setUint32(24, f.contenu.length, true);
    c.setUint16(28, nom.length, true);
    c.setUint32(42, decalage, true);
    central.set(nom, 46);
    locaux.push(local);
    centraux.push(central);
    decalage += local.length;
  }
  const tailleCentrale = centraux.reduce((n, c) => n + c.length, 0);
  const fin = new Uint8Array(22);
  const e = new DataView(fin.buffer);
  e.setUint32(0, 0x06054b50, true);
  e.setUint16(8, fichiers.length, true);
  e.setUint16(10, fichiers.length, true);
  e.setUint32(12, tailleCentrale, true);
  e.setUint32(16, decalage, true);
  const tout = new Uint8Array(decalage + tailleCentrale + 22);
  let k = 0;
  for (const m of [...locaux, ...centraux, fin]) {
    tout.set(m, k);
    k += m.length;
  }
  return tout;
}

// ── Fichier unique pour un assistant sans outils ─────────────────────────────

const ORDRE = [
  "GEMINI.md",
  "agent-home/IDENTITY.md",
  "agent-home/SOUL.md",
  "agent-home/AGENTS.md",
  "references/execution.md",
  "skills/dragon-ball/SKILL.md",
  "skills/dragon-ball/references/faits.md",
  "skills/dragon-ball-canon/SKILL.md",
  "skills/dragon-ball-canon/references/doctrine.md",
  "skills/dragon-ball-japonais/SKILL.md",
  "skills/dragon-ball-japonais/references/lexique.md",
  "skills/dragon-ball-japonais/references/traduction.md",
  "skills/dragon-ball-japonais/references/lexique-canonique.md",
  "skills/databooks-ocr/SKILL.md",
  "skills/databooks-ocr/references/corrections.md",
  "skills/toriyama-svg/SKILL.md",
  "skills/toriyama-svg/references/sources.md",
  "skills/toriyama-svg/references/geometrie.md",
  "skills/toriyama-svg/references/animation.md",
  "skills/toriyama-svg/references/mesures/kinto-un-analyse-visuelle.md",
  "skills/toriyama-svg/references/mesures/couverture-analyse-visuelle.md",
  "skills/shenron-admin/SKILL.md",
  "agents/dbfr-wiki.md",
  "agents/dbfr-traducteur.md",
  "agents/dbfr-ocr.md",
];

export function fichierUnique(fichiers: Fichier[]): string {
  const parChemin = new Map(fichiers.map((f) => [f.chemin.slice(RACINE_PAQUET.length + 1), f]));
  const md = [...parChemin.keys()].filter((p) => p.endsWith(".md"));
  const ordre = [
    ...ORDRE.filter((p) => parChemin.has(p)),
    ...md.filter((p) => !ORDRE.includes(p)).toSorted(comparer),
  ];
  const parties = [
    "# Shenron — connaissances du plugin en un seul fichier",
    "",
    "Assemblage des pages du plugin « shenron » (dragonballfr.com) et de l'agent home public,",
    "pour un assistant qui lit des fichiers sans pouvoir lancer de script. Commencer par la",
    "section « Fichier : GEMINI.md ». Un lien relatif `chemin/fichier.md` renvoie à la section",
    "« Fichier : chemin/fichier.md » de ce document.",
  ];
  for (const p of ordre) {
    parties.push("", "---", "", `# Fichier : ${p}`, "", lireTexte(parChemin.get(p)!).trimEnd());
  }
  const faits = parChemin.get("skills/dragon-ball/references/faits.json");
  if (faits) {
    const j = JSON.parse(lireTexte(faits)) as {
      revision: string;
      date: string;
      donnees: {
        declarations_auteur: {
          id: string;
          source: string;
          texte: string;
          texte_fr?: string;
          attribution: string;
        }[];
      };
    };
    parties.push(
      "",
      "---",
      "",
      "# Fichier : skills/dragon-ball/references/faits.json — déclarations d'auteur intégrales",
      "",
      `Instantané ${j.revision} du ${j.date}. Texte original puis traduction française.`,
    );
    for (const c of j.donnees.declarations_auteur) {
      parties.push(
        "",
        `## ${c.id}`,
        "",
        `Source : ${c.source}. ${c.attribution}.`,
        "",
        `> ${c.texte.replace(/\n+/g, "\n> ")}`,
      );
      if (c.texte_fr) parties.push("", `Traduction : ${c.texte_fr}`);
    }
  }
  return `${parties.join("\n")}\n`;
}

// ── Corpus d'entraînement ───────────────────────────────────────────────────

export interface Morceau {
  id: string;
  title: string;
  text: string;
  doc_id: string;
  source_path: string;
  url?: string;
}

const MAX_MORCEAU = 2400;

function decouper(texteBrut: string): string[] {
  if (texteBrut.length <= MAX_MORCEAU) return [texteBrut];
  const morceaux: string[] = [];
  let courant = "";
  for (const paragraphe of texteBrut.split(/\n{2,}/)) {
    if (courant && courant.length + paragraphe.length > MAX_MORCEAU) {
      morceaux.push(courant.trim());
      courant = "";
    }
    if (paragraphe.length > MAX_MORCEAU) {
      const lignes = paragraphe.split("\n");
      for (const ligne of lignes) {
        if (courant && courant.length + ligne.length > MAX_MORCEAU) {
          morceaux.push(courant.trim());
          courant = "";
        }
        courant += `${ligne}\n`;
      }
    } else courant += `${paragraphe}\n\n`;
  }
  if (courant.trim()) morceaux.push(courant.trim());
  return morceaux;
}

/** Une page Markdown → un morceau par section `##`/`###`, découpé au besoin. */
function morceauxMarkdown(chemin: string, md: string): Morceau[] {
  const sansCommentaire = md.replace(/<!--[\s\S]*?-->\n*/g, "");
  const titrePage = sansCommentaire.match(/^# (.+)$/m)?.[1]?.trim() ?? chemin;
  const sections = sansCommentaire.split(/\n(?=#{2,3} )/);
  const sortie: Morceau[] = [];
  sections.forEach((section, i) => {
    const titre = section.match(/^#{1,3} (.+)$/m)?.[1]?.trim() ?? titrePage;
    decouper(section.trim()).forEach((t, j) => {
      if (t.length < 30) return;
      sortie.push({
        id: `${chemin}#${i}.${j}`,
        title: titre === titrePage ? titrePage : `${titrePage} — ${titre}`,
        text: t,
        doc_id: chemin,
        source_path: chemin,
      });
    });
  });
  return sortie;
}

function enLignes(valeur: unknown, prefixe = ""): string[] {
  if (valeur === null || valeur === undefined) return [];
  if (Array.isArray(valeur)) return valeur.flatMap((v, i) => enLignes(v, `${prefixe}[${i}]`));
  if (typeof valeur === "object") {
    return Object.entries(valeur as Record<string, unknown>).flatMap(([k, v]) =>
      enLignes(v, prefixe ? `${prefixe}.${k}` : k),
    );
  }
  return [`${prefixe} : ${String(valeur)}`];
}

/** `faits.json` → un morceau par enregistrement, avec sa source et son URL. */
function morceauxFaits(chemin: string, json: string): Morceau[] {
  const j = JSON.parse(json) as {
    revision: string;
    date: string;
    donnees: Record<string, unknown>;
  };
  const sortie: Morceau[] = [];
  for (const [theme, valeur] of Object.entries(j.donnees)) {
    const liste = Array.isArray(valeur) ? valeur : valeur ? [valeur] : [];
    liste.forEach((e, i) => {
      const lignes = enLignes(e);
      const url = lignes.map((l) => /(https:\/\/\S+)/.exec(l)?.[1]).find(Boolean);
      const nom =
        (e as Record<string, unknown>).nom ??
        (e as Record<string, unknown>).personnage ??
        (e as Record<string, unknown>).id ??
        i;
      const corps = [`Thème : ${theme} (instantané ${j.revision}, ${j.date})`, ...lignes].join(
        "\n",
      );
      decouper(corps).forEach((t, k) => {
        sortie.push({
          id: `${chemin}#${theme}.${i}.${k}`,
          title: `Faits Dragon Ball — ${theme} — ${String(nom)}`,
          text: t,
          doc_id: `${chemin}#${theme}`,
          source_path: chemin,
          ...(url ? { url } : {}),
        });
      });
    });
  }
  return sortie;
}

export function corpus(fichiers: Fichier[]): Morceau[] {
  const sortie: Morceau[] = [];
  for (const f of fichiers) {
    const chemin = f.chemin.slice(RACINE_PAQUET.length + 1);
    if (chemin.endsWith(".md")) sortie.push(...morceauxMarkdown(chemin, lireTexte(f)));
    else if (chemin.endsWith("faits.json")) sortie.push(...morceauxFaits(chemin, lireTexte(f)));
  }
  return sortie;
}

// ── Écriture et synchronisation ─────────────────────────────────────────────

export async function construire(sortie: string) {
  const fichiers = await fichiersDuPaquet();
  const archive = zip(fichiers);
  const unique = fichierUnique(fichiers);
  const morceaux = corpus(fichiers);
  const jsonl = `${morceaux.map((m) => JSON.stringify(m)).join("\n")}\n`;
  const version = (
    (await Bun.file(join(RACINE, "plugin/.claude-plugin/plugin.json")).json()) as {
      version: string;
    }
  ).version;
  const manifeste = {
    _genere: "bun scripts/plugin/pack.ts — ne pas éditer",
    plugin: "shenron",
    version,
    revision: git(["log", "-1", "--format=%h", "--", "plugin", "agent-home"]) || "inconnue",
    date: git(["log", "-1", "--format=%cs", "--", "plugin", "agent-home"]) || "inconnue",
    usage: {
      gemini:
        "téléverser shenron-gemini.md (un fichier) ou shenron-plugin.zip, puis demander de suivre GEMINI.md",
      entrainement:
        "aphrody shenron train triples --input shenron-chunks.jsonl --gold <gold.jsonl> --out triples.jsonl",
    },
    fichiers: Object.fromEntries(fichiers.map((f) => [f.chemin, sha256(lireTexte(f))])),
    sorties: {
      "shenron-plugin.zip": new Bun.CryptoHasher("sha256").update(archive).digest("hex"),
      "shenron-gemini.md": sha256(unique),
      "shenron-chunks.jsonl": sha256(jsonl),
    },
    morceaux: morceaux.length,
  };
  await rm(join(sortie, RACINE_PAQUET), { recursive: true, force: true });
  for (const f of fichiers) await Bun.write(join(sortie, f.chemin), f.contenu);
  await Bun.write(join(sortie, "shenron-plugin.zip"), archive);
  await Bun.write(join(sortie, "shenron-gemini.md"), unique);
  await Bun.write(join(sortie, "shenron-chunks.jsonl"), jsonl);
  await Bun.write(join(sortie, "manifest.json"), `${JSON.stringify(manifeste, null, 2)}\n`);
  return {
    fichiers: fichiers.length,
    octetsZip: archive.length,
    octetsUnique: unique.length,
    morceaux: morceaux.length,
  };
}

/** `rclone sync` vers le Drive puis `rclone check` : la preuve que le dossier distant est identique. */
export function synchroniser(sortie: string, cible: string): void {
  const remote = cible.split(":")[0];
  const remotes = Bun.spawnSync(["rclone", "listremotes"], {
    stdout: "pipe",
    stderr: "pipe",
  }).stdout.toString();
  if (!remote || !remotes.split("\n").includes(`${remote}:`)) {
    throw new Error(
      `remote rclone « ${remote}: » absent (remotes : ${remotes.trim().replace(/\n/g, " ") || "aucun"}). ` +
        `Le créer une fois : rclone config create ${remote || "gdrive"} drive scope=drive (connexion Google), puis relancer.`,
    );
  }
  for (const cmd of [
    ["rclone", "sync", sortie, cible, "--checksum"],
    ["rclone", "check", sortie, cible, "--one-way"],
  ]) {
    const r = Bun.spawnSync(cmd, { stdout: "inherit", stderr: "inherit" });
    if (r.exitCode !== 0) throw new Error(`${cmd.slice(0, 2).join(" ")} a échoué (${r.exitCode})`);
  }
}

if (import.meta.main) {
  const args = Bun.argv.slice(2);
  const option = (nom: string) => {
    const i = args.indexOf(nom);
    return i >= 0 ? args[i + 1] : undefined;
  };
  const sortie = option("--sortie") ?? join(RACINE, "var", "plugin-pack");
  await mkdir(sortie, { recursive: true });
  const bilan = await construire(sortie);
  console.log(
    `${sortie} : ${bilan.fichiers} fichiers, zip ${bilan.octetsZip} o, shenron-gemini.md ${bilan.octetsUnique} o, ${bilan.morceaux} morceaux`,
  );
  const drive = option("--drive") ?? process.env.SHENRON_DRIVE_DBFR;
  if (drive) {
    try {
      synchroniser(sortie, drive);
      console.log(`✓ synchronisé et vérifié : ${drive}`);
    } catch (e) {
      console.error(`✗ synchronisation Drive : ${(e as Error).message}`);
      process.exit(2);
    }
  }
}
