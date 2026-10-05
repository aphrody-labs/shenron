#!/usr/bin/env bun
// SPDX-License-Identifier: Apache-2.0
/**
 * Polices du site, servies par le CDN et non plus par `next/font`.
 *
 * Le build Next n'a plus rien à télécharger ni à traiter : les fichiers woff2 vivent dans
 * `public/fonts/<famille>/` (publiés sur cdn.dragonballfr.com avec le reste de `public/`), la
 * feuille `src/app/fonts.css` les déclare en `@font-face` (tranches `unicode-range` : le
 * navigateur ne charge que les plages utilisées, décisif pour Noto Sans JP) et pose les
 * variables `--font-*` que lit le thème. Les URL sont absolues depuis la racine : servies
 * depuis la feuille du CDN (`assetPrefix`), elles se résolvent sur le CDN ; en
 * développement, sur `public/`.
 *
 *   bun scripts/fonts.ts           # télécharge depuis Google Fonts, met à jour le verrou
 *   bun scripts/fonts.ts --offline # régénère depuis le verrou (aucun réseau)
 *   bun scripts/fonts.ts --check   # hors ligne : CSS et fichiers à jour (porte CI)
 *
 * Les replis métriques (`size-adjust`, `ascent-override`…) sont ceux que `next/font`
 * calculait (build du 2026-10-05) : aucun décalage de mise en page au chargement.
 */
import { createHash } from "node:crypto";
import { mkdir, readdir, rm } from "node:fs/promises";
import { join } from "node:path";

const SITE = join(import.meta.dir, "..");
const PUBLIC = join(SITE, "public", "fonts");
const CSS = join(SITE, "src", "app", "fonts.css");
const PRELOADS = join(SITE, "src", "lib", "font-preloads.ts");
const LOCK = join(SITE, "scripts", "fonts.lock.json");
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36";

interface Family {
  name: string;
  slug: string;
  query: string;
  /** Sous-ensembles gardés (commentaire Google `/* latin *\/`) ; `null` = tous. */
  subsets: readonly string[] | null;
  /** Sous-ensembles préchargés (style normal seulement). */
  preload: readonly string[];
  fallback: string;
}

const FAMILIES: readonly Family[] = [
  {
    name: "Google Sans Flex",
    slug: "google-sans-flex",
    query: "Google+Sans+Flex:opsz,wdth,wght,ROND@6..144,25..151,1..1000,0..100",
    subsets: ["latin", "latin-ext"],
    preload: ["latin"],
    fallback:
      'src: local("Arial"); ascent-override: 94.61%; descent-override: 28.01%; line-gap-override: 0%; size-adjust: 102.1%;',
  },
  {
    name: "Newsreader",
    slug: "newsreader",
    query: "Newsreader:ital,opsz,wght@0,6..72,200..800;1,6..72,200..800",
    subsets: ["latin", "latin-ext"],
    preload: [],
    fallback:
      'src: local("Times New Roman"); ascent-override: 69.68%; descent-override: 25.12%; line-gap-override: 0%; size-adjust: 105.48%;',
  },
  {
    name: "JetBrains Mono",
    slug: "jetbrains-mono",
    query: "JetBrains+Mono:wght@400;500",
    subsets: ["latin"],
    preload: [],
    fallback:
      'src: local("Arial"); ascent-override: 75.79%; descent-override: 22.29%; line-gap-override: 0%; size-adjust: 134.59%;',
  },
  {
    name: "Noto Sans JP",
    slug: "noto-sans-jp",
    query: "Noto+Sans+JP:wght@100..900",
    subsets: null,
    preload: [],
    fallback:
      'src: local("Arial"); ascent-override: 110.73%; descent-override: 27.49%; line-gap-override: 0%; size-adjust: 104.76%;',
  },
];

/** Variables lues par `@shenron/ui/styles.css` (`--font-sans`, `--font-serif`…). */
const VARIABLES = `:root {
  --font-sans: "Google Sans Flex", "Google Sans Flex Fallback", system-ui, arial, sans-serif;
  --font-serif-src: "Newsreader", "Newsreader Fallback";
  --font-editorial: "Newsreader", "Newsreader Fallback", "Iowan Old Style", Charter, Georgia, serif;
  --font-mono-src: "JetBrains Mono", "JetBrains Mono Fallback";
  --font-jp: "Noto Sans JP", "Noto Sans JP Fallback", sans-serif;
}
`;

interface Face {
  subset: string;
  style: string;
  css: string;
  url: string;
}
type Lock = Record<string, { css: string; files: Record<string, string> }>;

const args = new Set(process.argv.slice(2));
const check = args.has("--check");
const offline = check || args.has("--offline");

function faces(css: string): Face[] {
  const out: Face[] = [];
  // Commentaire de sous-ensemble facultatif : Noto Sans JP livre ses 124 tranches sans.
  const re = /(?:\/\*\s*([^*]+?)\s*\*\/\s*)?(@font-face\s*\{[^}]*\})/g;
  let index = 0;
  for (const m of css.matchAll(re)) {
    const block = m[2]!;
    const subset = m[1] ?? `tranche-${index}`;
    index++;
    const url = /url\((https:[^)]+)\)/.exec(block)?.[1];
    if (!url) continue;
    out.push({
      subset,
      style: /font-style:\s*(\w+)/.exec(block)?.[1] ?? "normal",
      css: block,
      url,
    });
  }
  return out;
}

const sha = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex").slice(0, 16);

const lock: Lock = (await Bun.file(LOCK).exists()) ? await Bun.file(LOCK).json() : {};
const nextLock: Lock = {};
const cssParts: string[] = [
  "/* Généré par apps/site/scripts/fonts.ts : ne pas éditer. Polices servies par le CDN. */",
  VARIABLES,
];
const preloads: string[] = [];
const wanted = new Set<string>();

for (const family of FAMILIES) {
  let source: string;
  if (offline) {
    const entry = lock[family.slug];
    if (!entry) throw new Error(`${family.name} absent du verrou : lancer scripts/fonts.ts`);
    source = entry.css;
  } else {
    const res = await fetch(
      `https://fonts.googleapis.com/css2?family=${family.query}&display=swap`,
      { headers: { "user-agent": UA } },
    );
    if (!res.ok) throw new Error(`${family.name} : Google Fonts ${res.status}`);
    source = await res.text();
  }
  const files: Record<string, string> = {};
  cssParts.push(`@font-face {\n  font-family: "${family.name} Fallback";\n  ${family.fallback}\n}`);
  for (const face of faces(source)) {
    if (family.subsets && !family.subsets.includes(face.subset)) continue;
    let name = lock[family.slug]?.files[face.url];
    const known = name ? Bun.file(join(PUBLIC, family.slug, name)) : null;
    if (!name || !(await known!.exists())) {
      if (offline) throw new Error(`${family.name} : fichier manquant pour ${face.url}`);
      const bytes = new Uint8Array(await (await fetch(face.url)).arrayBuffer());
      name = `${sha(bytes)}.woff2`;
      await mkdir(join(PUBLIC, family.slug), { recursive: true });
      await Bun.write(join(PUBLIC, family.slug, name), bytes);
    }
    files[face.url] = name;
    const path = `/fonts/${family.slug}/${name}`;
    wanted.add(join(family.slug, name));
    cssParts.push(
      `/* ${face.subset} */\n${face.css.replace(face.url, path).replace(/font-family: '([^']+)'/, 'font-family: "$1"')}`,
    );
    if (face.style === "normal" && family.preload.includes(face.subset)) preloads.push(path);
  }
  nextLock[family.slug] = { css: source, files };
}

const css = `${cssParts.join("\n\n")}\n`;
const ts = `// Généré par apps/site/scripts/fonts.ts : ne pas éditer.\n/** Fichiers de police préchargés par le layout racine (chemins sous \`public/\`, servis par le CDN). */\nexport const FONT_PRELOADS: readonly string[] = ${JSON.stringify(preloads)};\n`;

if (check) {
  const stale: string[] = [];
  if (
    (await Bun.file(CSS)
      .text()
      .catch(() => "")) !== css
  )
    stale.push("src/app/fonts.css");
  if (
    (await Bun.file(PRELOADS)
      .text()
      .catch(() => "")) !== ts
  )
    stale.push("src/lib/font-preloads.ts");
  for (const file of wanted)
    if (!(await Bun.file(join(PUBLIC, file)).exists())) stale.push(`public/fonts/${file}`);
  if (stale.length) {
    console.error(
      `polices à régénérer (bun scripts/fonts.ts --offline) :\n  ${stale.join("\n  ")}`,
    );
    process.exit(1);
  }
  console.log(`polices : ${wanted.size} fichiers, CSS à jour`);
} else {
  await Bun.write(CSS, css);
  await Bun.write(PRELOADS, ts);
  await Bun.write(LOCK, `${JSON.stringify(nextLock, null, 2)}\n`);
  // Fichiers des familles gérées qui ne sont plus référencés.
  for (const family of FAMILIES) {
    const dir = join(PUBLIC, family.slug);
    for (const name of await readdir(dir).catch(() => [] as string[]))
      if (!wanted.has(join(family.slug, name))) await rm(join(dir, name));
  }
  console.log(`polices : ${wanted.size} fichiers, ${preloads.length} préchargés`);
}
