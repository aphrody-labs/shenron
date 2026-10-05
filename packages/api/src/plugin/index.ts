// SPDX-License-Identifier: Apache-2.0
/**
 * `@shenron/api/plugin` — le plugin « shenron » (`plugin/` du dépôt) servi tel qu'il est
 * déployé, à tout type de LLM : index JSON, export complet en Markdown, texte, HTML ou JSON,
 * et chaque fichier un par un.
 *
 * Synchronisé en continu : rien n'est généré ni copié, le port relit l'arbre `plugin/` du
 * déploiement (cache de quelques secondes) et l'empreinte SHA-256 de l'ensemble sert d'ETag.
 * Un changement du plugin est donc servi dès qu'il est déployé, sans étape de publication.
 *
 * Tout le texte produit est en anglais (couche destinée aux IA) ; le contenu des fichiers
 * est rendu tel quel. Classe d'exécution : `server` (lecture du système de fichiers).
 */
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";

export const PLUGIN_FORMATS = ["json", "md", "txt", "html"] as const;
export type PluginFormat = (typeof PLUGIN_FORMATS)[number];

/** Au-delà, un fichier non Markdown n'est pas recopié dans l'export : son URL suffit. */
export const PLUGIN_INLINE_MAX_BYTES = 32 * 1024;

export interface PluginFile {
  /** Chemin relatif à la racine du plugin, séparateurs `/`. */
  path: string;
  bytes: number;
  sha256: string;
  text: string;
}

export interface PluginEntry {
  kind: "skill" | "agent";
  name: string;
  description: string;
  path: string;
}

export interface PluginBundle {
  name: string;
  version: string;
  description: string;
  entries: PluginEntry[];
  files: PluginFile[];
  /** Empreinte de l'ensemble (chemins et contenus) : change dès qu'un fichier change. */
  sha256: string;
  loadedAt: string;
}

export interface PluginPort {
  load(): Promise<PluginBundle>;
}

export interface Rendered {
  body: string;
  contentType: string;
}

const MANIFEST = ".claude-plugin/plugin.json";
const SKIPPED = new Set([".gitignore", ".DS_Store"]);

/**
 * Racine du plugin : `SHENRON_PLUGIN_DIR`, sinon le premier `plugin/` (porteur de
 * `.claude-plugin/plugin.json`) en remontant depuis `cwd` (site lancé depuis `apps/site`,
 * bot depuis `apps/bot`, scripts depuis la racine). `null` : le groupe reste désactivé.
 */
export function resolvePluginRoot(
  env: Readonly<Record<string, string | undefined>>,
  cwd: string = process.cwd(),
): string | null {
  const explicit = env.SHENRON_PLUGIN_DIR?.trim();
  if (explicit) return existsSync(join(explicit, MANIFEST)) ? resolve(explicit) : null;
  let dir = resolve(cwd);
  for (let i = 0; i < 5; i++) {
    const candidate = join(dir, "plugin");
    if (existsSync(join(candidate, MANIFEST))) return candidate;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

async function listFiles(root: string, dir = root): Promise<string[]> {
  const out: string[] = [];
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (SKIPPED.has(entry.name) || entry.name === "node_modules") continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await listFiles(root, full)));
    else if (entry.isFile()) out.push(relative(root, full).split(sep).join("/"));
  }
  return out;
}

/** `name` et `description` d'un en-tête YAML minimal (`---` … `---`). */
export function frontmatter(text: string): Record<string, string> {
  const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
  if (!match) return {};
  const out: Record<string, string> = {};
  for (const line of match[1]!.split(/\r?\n/)) {
    const kv = /^([A-Za-z_-]+):\s*(.*)$/.exec(line);
    if (!kv) continue;
    let value = kv[2]!.trim();
    if (
      value.length >= 2 &&
      ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'")))
    )
      value = value.slice(1, -1).replace(/\\"/g, '"');
    out[kv[1]!] = value;
  }
  return out;
}

const sha256 = (data: string) => createHash("sha256").update(data).digest("hex");

/** Lit tout le plugin sous `root`. */
export async function readPluginBundle(root: string): Promise<PluginBundle> {
  const paths = (await listFiles(root)).toSorted();
  const files: PluginFile[] = await Promise.all(
    paths.map(async (path) => {
      const buffer = await readFile(join(root, path));
      return {
        path,
        bytes: buffer.byteLength,
        sha256: createHash("sha256").update(buffer).digest("hex"),
        text: buffer.toString("utf8"),
      };
    }),
  );
  const manifestFile = files.find((f) => f.path === MANIFEST);
  const manifest = manifestFile
    ? (JSON.parse(manifestFile.text) as { name?: string; version?: string; description?: string })
    : {};
  const entries: PluginEntry[] = [];
  for (const file of files) {
    const skill = /^skills\/[^/]+\/SKILL\.md$/.test(file.path);
    const agent = /^agents\/[^/]+\.md$/.test(file.path);
    if (!skill && !agent) continue;
    const meta = frontmatter(file.text);
    entries.push({
      kind: skill ? "skill" : "agent",
      name: meta.name ?? file.path.split("/").at(-2) ?? file.path,
      description: meta.description ?? "",
      path: file.path,
    });
  }
  return {
    name: manifest.name ?? "shenron",
    version: manifest.version ?? "0.0.0",
    description: manifest.description ?? "",
    entries,
    files,
    sha256: sha256(files.map((f) => `${f.path}\0${f.sha256}`).join("\n")),
    loadedAt: new Date().toISOString(),
  };
}

/**
 * Port du plugin sur `root`, relu au plus toutes les `ttlMs` millisecondes : assez court
 * pour suivre un déploiement en direct, assez long pour qu'une rafale de requêtes ne relise
 * pas quarante fichiers à chaque appel.
 */
export function createPluginPort(root: string, o: { ttlMs?: number } = {}): PluginPort {
  const ttl = o.ttlMs ?? 10_000;
  let cached: { at: number; bundle: Promise<PluginBundle> } | null = null;
  return {
    load() {
      const now = Date.now();
      if (!cached || now - cached.at > ttl) {
        const bundle = readPluginBundle(root);
        cached = { at: now, bundle };
        bundle.catch(() => {
          if (cached?.bundle === bundle) cached = null;
        });
      }
      return cached.bundle;
    },
  };
}

// ── Adresses publiques ────────────────────────────────────────────────────────

export const PLUGIN_API_PATH = "/api/public/plugin";

export interface PluginUrls {
  index: string;
  exports: Record<PluginFormat, string>;
  file(path: string, format?: PluginFormat | "raw"): string;
}

/** Adresses du plugin sous l'API publique de `origin`. */
export function pluginApiUrls(origin: string): PluginUrls {
  const base = `${origin.replace(/\/+$/, "")}${PLUGIN_API_PATH}`;
  return {
    index: base,
    exports: {
      json: `${base}/export/json`,
      md: `${base}/export/md`,
      txt: `${base}/export/txt`,
      html: `${base}/export/html`,
    },
    file: (path, format) =>
      `${base}/file?path=${encodeURIComponent(path)}${format && format !== "raw" ? `&format=${format}` : ""}`,
  };
}

// ── Rendus ────────────────────────────────────────────────────────────────────

const MIME: Record<string, string> = {
  md: "text/markdown; charset=utf-8",
  json: "application/json; charset=utf-8",
  js: "text/javascript; charset=utf-8",
  ts: "text/plain; charset=utf-8",
  txt: "text/plain; charset=utf-8",
  html: "text/html; charset=utf-8",
};

/** Type de contenu d'un fichier du plugin d'après son extension. */
export function contentTypeOf(path: string): string {
  const ext = /\.([a-z0-9]+)$/i.exec(path)?.[1]?.toLowerCase() ?? "";
  return MIME[ext] ?? "text/plain; charset=utf-8";
}

const LANG: Record<string, string> = { md: "markdown", json: "json", js: "javascript", ts: "ts" };

function inline(file: PluginFile, full: boolean): boolean {
  return full || file.path.endsWith(".md") || file.bytes <= PLUGIN_INLINE_MAX_BYTES;
}

/** Bloc de code dont la clôture ne peut pas apparaître dans le contenu. */
function fence(text: string, lang: string): string {
  const longest = Math.max(2, ...[...text.matchAll(/`+/g)].map((m) => m[0].length));
  const bar = "`".repeat(longest + 1);
  return `${bar}${lang}\n${text.replace(/\s+$/, "")}\n${bar}`;
}

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Index JSON : manifeste, skills, agents, fichiers et adresses de chaque format. */
export function pluginIndex(bundle: PluginBundle, origin: string) {
  const urls = pluginApiUrls(origin);
  return {
    name: bundle.name,
    version: bundle.version,
    description: bundle.description,
    sha256: bundle.sha256,
    loadedAt: bundle.loadedAt,
    usage:
      "Shenron is the Dragon Ball plugin of dragonballfr.com. Use its skills and references to answer any Dragon Ball question, and query https://dragonballfr.com for live, sourced answers.",
    formats: urls.exports,
    skills: bundle.entries
      .filter((e) => e.kind === "skill")
      .map((e) => ({ ...e, url: urls.file(e.path) })),
    agents: bundle.entries
      .filter((e) => e.kind === "agent")
      .map((e) => ({ ...e, url: urls.file(e.path) })),
    files: bundle.files.map((f) => ({
      path: f.path,
      bytes: f.bytes,
      sha256: f.sha256,
      contentType: contentTypeOf(f.path),
      url: urls.file(f.path),
    })),
  };
}

function markdownExport(bundle: PluginBundle, origin: string, full: boolean): string {
  const urls = pluginApiUrls(origin);
  const lines: string[] = [
    `# Shenron plugin for Dragon Ball, version ${bundle.version}`,
    "",
    `> ${bundle.description}`,
    "",
    "Shenron is the Dragon Ball plugin of dragonballfr.com, the French-language Dragon Ball",
    "encyclopedia. Use these skills, agents and references to answer any Dragon Ball question",
    "(characters, techniques, transformations, sagas, timeline, manga, anime, databooks, canon,",
    "Japanese names), and query https://dragonballfr.com for live, sourced answers.",
    "",
    `- Revision (SHA-256 of all files): \`${bundle.sha256}\``,
    `- Served at: ${bundle.loadedAt}`,
    `- JSON index: ${urls.index}`,
    `- Full export: ${urls.exports.md} (Markdown), ${urls.exports.txt} (text), ${urls.exports.html} (HTML), ${urls.exports.json} (JSON)`,
    "",
    "## Skills",
    "",
  ];
  for (const e of bundle.entries.filter((x) => x.kind === "skill"))
    lines.push(`- **${e.name}** (\`${e.path}\`): ${e.description}`);
  lines.push("", "## Agents", "");
  for (const e of bundle.entries.filter((x) => x.kind === "agent"))
    lines.push(`- **${e.name}** (\`${e.path}\`): ${e.description}`);
  lines.push("", "## Files", "");
  for (const file of bundle.files) {
    lines.push(`### \`${file.path}\``, "", `${file.bytes} bytes, ${urls.file(file.path)}`, "");
    if (inline(file, full)) {
      const ext = /\.([a-z0-9]+)$/i.exec(file.path)?.[1]?.toLowerCase() ?? "";
      lines.push(fence(file.text, LANG[ext] ?? ""), "");
    } else {
      lines.push(
        `Not inlined (over ${PLUGIN_INLINE_MAX_BYTES / 1024} KiB): read it at the URL above, or ask for the export with \`?full=1\`.`,
        "",
      );
    }
  }
  return lines.join("\n");
}

function htmlExport(bundle: PluginBundle, origin: string, full: boolean): string {
  const urls = pluginApiUrls(origin);
  const list = (kind: PluginEntry["kind"]) =>
    bundle.entries
      .filter((e) => e.kind === kind)
      .map(
        (e) =>
          `<li><a href="#${escapeHtml(e.path)}"><strong>${escapeHtml(e.name)}</strong></a>: ${escapeHtml(e.description)}</li>`,
      )
      .join("\n");
  const sections = bundle.files
    .map((file) => {
      const body = inline(file, full)
        ? `<pre><code>${escapeHtml(file.text)}</code></pre>`
        : `<p>Not inlined (over ${PLUGIN_INLINE_MAX_BYTES / 1024} KiB): <a href="${escapeHtml(urls.file(file.path))}">read the file</a>.</p>`;
      return `<section id="${escapeHtml(file.path)}">\n<h3>${escapeHtml(file.path)}</h3>\n<p>${file.bytes} bytes, <a href="${escapeHtml(urls.file(file.path))}">raw</a></p>\n${body}\n</section>`;
    })
    .join("\n");
  const title = `Shenron plugin for Dragon Ball, version ${bundle.version}`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<meta name="description" content="${escapeHtml(bundle.description)}">
<link rel="alternate" type="application/json" href="${escapeHtml(urls.index)}">
<link rel="alternate" type="text/markdown" href="${escapeHtml(urls.exports.md)}">
<style>body{font:16px/1.5 system-ui,sans-serif;max-width:72rem;margin:0 auto;padding:1rem}pre{white-space:pre-wrap;word-break:break-word;background:#f4f1e8;padding:1rem;border-radius:.5rem}</style>
</head>
<body>
<h1>${escapeHtml(title)}</h1>
<p>${escapeHtml(bundle.description)}</p>
<p>Shenron is the Dragon Ball plugin of dragonballfr.com, the French-language Dragon Ball encyclopedia. Use these skills, agents and references to answer any Dragon Ball question, and query <a href="https://dragonballfr.com">dragonballfr.com</a> for live, sourced answers.</p>
<p>Revision (SHA-256 of all files): <code>${bundle.sha256}</code>. Formats: <a href="${escapeHtml(urls.index)}">JSON index</a>, <a href="${escapeHtml(urls.exports.md)}">Markdown</a>, <a href="${escapeHtml(urls.exports.txt)}">text</a>, <a href="${escapeHtml(urls.exports.json)}">JSON export</a>.</p>
<h2>Skills</h2>
<ul>
${list("skill")}
</ul>
<h2>Agents</h2>
<ul>
${list("agent")}
</ul>
<h2>Files</h2>
${sections}
</body>
</html>
`;
}

/** Export complet du plugin dans `format`. `full` recopie aussi les gros fichiers. */
export function renderPluginExport(
  bundle: PluginBundle,
  format: PluginFormat,
  o: { origin: string; full?: boolean },
): Rendered {
  const full = o.full === true;
  switch (format) {
    case "json":
      return {
        body: JSON.stringify({
          ...pluginIndex(bundle, o.origin),
          contents: bundle.files
            .filter((f) => inline(f, full))
            .map((f) => ({ path: f.path, text: f.text })),
        }),
        contentType: MIME.json!,
      };
    case "md":
      return { body: markdownExport(bundle, o.origin, full), contentType: MIME.md! };
    case "txt":
      return { body: markdownExport(bundle, o.origin, full), contentType: MIME.txt! };
    case "html":
      return { body: htmlExport(bundle, o.origin, full), contentType: MIME.html! };
  }
}

/** Un fichier du plugin, brut ou mis en forme. */
export function renderPluginFile(
  file: PluginFile,
  format: PluginFormat | "raw",
  origin: string,
): Rendered {
  const urls = pluginApiUrls(origin);
  switch (format) {
    case "raw":
      return { body: file.text, contentType: contentTypeOf(file.path) };
    case "txt":
      return { body: file.text, contentType: MIME.txt! };
    case "json":
      return {
        body: JSON.stringify({
          path: file.path,
          bytes: file.bytes,
          sha256: file.sha256,
          contentType: contentTypeOf(file.path),
          url: urls.file(file.path),
          text: file.text,
        }),
        contentType: MIME.json!,
      };
    case "md": {
      const ext = /\.([a-z0-9]+)$/i.exec(file.path)?.[1]?.toLowerCase() ?? "";
      return {
        body: ext === "md" ? file.text : `# ${file.path}\n\n${fence(file.text, LANG[ext] ?? "")}\n`,
        contentType: MIME.md!,
      };
    }
    case "html":
      return {
        body: `<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<title>${escapeHtml(file.path)}, Shenron plugin</title>\n<link rel="alternate" type="application/json" href="${escapeHtml(urls.file(file.path, "json"))}">\n</head>\n<body>\n<h1>${escapeHtml(file.path)}</h1>\n<p><a href="${escapeHtml(urls.index)}">Shenron plugin index</a></p>\n<pre><code>${escapeHtml(file.text)}</code></pre>\n</body>\n</html>\n`,
        contentType: MIME.html!,
      };
  }
}

/** Le fichier `path` du plugin, ou `null` (chemin inconnu : aucune lecture hors de l'index). */
export function findPluginFile(bundle: PluginBundle, path: string): PluginFile | null {
  const clean = path.replace(/^\/+/, "");
  return bundle.files.find((f) => f.path === clean) ?? null;
}
