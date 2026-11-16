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
import {
  PUBLIC_TEMPLATE_DOCUMENTS,
  templateProblems,
} from "@shenron/db/agent-homes/public-template";

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
  /**
   * Gzipped tarball of `bundle` under `shenron/` (`pluginArchiveEntries`); absent when the
   * host gave no archiver: `/api/public/plugin/archive.tar.gz` is then not served.
   */
  archive?(bundle: PluginBundle): Promise<Uint8Array<ArrayBuffer>>;
}

/**
 * Builds a gzipped tarball from `path → text` entries. Injected by the Bun host
 * (`new Bun.Archive(entries, { compress: "gzip" }).bytes()`): this module stays portable.
 */
export type PluginArchiver = (entries: Record<string, string>) => Promise<Uint8Array<ArrayBuffer>>;

export interface Rendered {
  body: string;
  contentType: string;
}

const MANIFEST = ".claude-plugin/plugin.json";
const SKIPPED = new Set([".gitignore", ".DS_Store"]);
/**
 * Files never served nor archived, even if one lands in `plugin/` by mistake: secrets,
 * local settings and databases (the plugin only carries public Markdown, JSON and scripts).
 */
const PRIVATE =
  /^(?:\.env(?:\..*)?|.*\.(?:pem|key|p12|pfx|sqlite3?|db|local\.md|local\.json)|\.npmrc|id_[a-z0-9]+)$/i;

/** `true` for a file name the plugin must never publish. */
export function isPrivatePluginFile(name: string): boolean {
  return PRIVATE.test(name);
}

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
    if (isPrivatePluginFile(entry.name)) continue;
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

/** Folder of the bundle (and of the archive under `shenron/`) carrying the public agent home. */
export const PLUGIN_AGENT_HOME_DIR = "agent-home";

const fileOf = (path: string, buffer: Buffer): PluginFile => ({
  path,
  bytes: buffer.byteLength,
  sha256: createHash("sha256").update(buffer).digest("hex"),
  text: buffer.toString("utf8"),
});

/**
 * The public agent home template as plugin files under `agent-home/`, after the guard of every
 * public artifact (`templateProblems`: no private entry, `USER.md` with no user filled in).
 */
export function agentHomeFiles(): PluginFile[] {
  const problems = templateProblems(PUBLIC_TEMPLATE_DOCUMENTS);
  if (problems.length)
    throw new Error(`agent home template cannot be published: ${problems.join("; ")}`);
  return Object.entries(PUBLIC_TEMPLATE_DOCUMENTS).map(([name, text]) =>
    fileOf(`${PLUGIN_AGENT_HOME_DIR}/${name}`, Buffer.from(text, "utf8")),
  );
}

/**
 * Lit tout le plugin sous `root`. `agentHome` y ajoute le gabarit public d'agent home sous
 * `agent-home/` (servi, indexé et archivé comme le reste).
 */
export async function readPluginBundle(
  root: string,
  o: { agentHome?: boolean } = {},
): Promise<PluginBundle> {
  const paths = (await listFiles(root))
    .filter((path) => !(o.agentHome && path.startsWith(`${PLUGIN_AGENT_HOME_DIR}/`)))
    .toSorted();
  const read: PluginFile[] = await Promise.all(
    paths.map(async (path) => fileOf(path, await readFile(join(root, path)))),
  );
  const files = o.agentHome
    ? [...read, ...agentHomeFiles()].toSorted((a, b) =>
        a.path < b.path ? -1 : a.path > b.path ? 1 : 0,
      )
    : read;
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
export function createPluginPort(
  root: string,
  o: { ttlMs?: number; archiver?: PluginArchiver; agentHome?: boolean } = {},
): PluginPort {
  const ttl = o.ttlMs ?? 10_000;
  let cached: { at: number; bundle: Promise<PluginBundle> } | null = null;
  const archiver = o.archiver;
  let archived: { sha256: string; bytes: Promise<Uint8Array<ArrayBuffer>> } | null = null;
  return {
    ...(archiver
      ? {
          archive(bundle: PluginBundle) {
            // Built once per revision of the bundle.
            if (archived?.sha256 === bundle.sha256) return archived.bytes;
            const entry = { sha256: bundle.sha256, bytes: archiver(pluginArchiveEntries(bundle)) };
            archived = entry;
            entry.bytes.catch(() => {
              if (archived === entry) archived = null;
            });
            return entry.bytes;
          },
        }
      : {}),
    load() {
      const now = Date.now();
      if (!cached || now - cached.at > ttl) {
        const bundle = readPluginBundle(root, { agentHome: o.agentHome });
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

const LOOPBACK_HOST = /^(?:localhost|127(?:\.\d+){3}|\[::1\]|::1|0\.0\.0\.0)(?::\d+)?$/i;

/** `true` when `origin` (`scheme://host[:port]`) names a loopback host. */
export function isLoopbackOrigin(origin: string): boolean {
  try {
    return LOOPBACK_HOST.test(new URL(origin).host);
  } catch {
    return false;
  }
}

/**
 * Public origin for the absolute links of the plugin (index, exports, archive).
 *
 * 1. `configured` (the site passes its `SITE_URL`, `@shenron/config/public-urls`) wins;
 * 2. otherwise, on a request that reached the process through a loopback origin (reverse
 *    proxy in front of it), `X-Forwarded-Host` and `X-Forwarded-Proto` give the public
 *    host; they are ignored on a direct request, where a client could forge them;
 * 3. otherwise the request origin itself (desktop or standalone binary served locally).
 */
export function pluginPublicOrigin(request: Request, configured?: string | null): string {
  const fixed = configured?.trim().replace(/\/+$/, "");
  if (fixed) return fixed;
  const own = new URL(request.url).origin;
  if (!isLoopbackOrigin(own)) return own;
  const host = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  if (!host || !/^[a-z0-9.-]+(?::\d+)?$/i.test(host) || LOOPBACK_HOST.test(host)) return own;
  const proto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim().toLowerCase();
  return `${proto === "http" ? "http" : "https"}://${host}`;
}

export interface PluginUrls {
  index: string;
  exports: Record<PluginFormat, string>;
  /** Gzipped tarball of the whole plugin, rooted at `shenron/`. */
  archive: string;
  /** One-shot install and configuration prompt for agy (`install/agy.md`, rendered). */
  agyPrompt: string;
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
    archive: `${base}/archive.tar.gz`,
    agyPrompt: `${base}/agy.md`,
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
    archive: urls.archive,
    install: {
      claude: "claude plugin marketplace add <repository> && claude plugin install shenron@shenron",
      agy: `mkdir -p ~/.shenron-plugin && curl -fsSL ${urls.archive} | tar -xz -C ~/.shenron-plugin && agy plugin install ~/.shenron-plugin/${PLUGIN_ARCHIVE_ROOT}`,
      agyPrompt: urls.agyPrompt,
      agyFull: `agy -i "$(curl -fsSL ${urls.agyPrompt})"`,
    },
    skills: bundle.entries
      .filter((e) => e.kind === "skill")
      .map((e) => Object.assign({}, e, { url: urls.file(e.path) })),
    agents: bundle.entries
      .filter((e) => e.kind === "agent")
      .map((e) => Object.assign({}, e, { url: urls.file(e.path) })),
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

// ── Archive ───────────────────────────────────────────────────────────────────

/** Root folder of the archive: `tar -xz` yields `shenron/`, ready for `agy plugin install`. */
export const PLUGIN_ARCHIVE_ROOT = "shenron";

export const PLUGIN_ARCHIVE_CONTENT_TYPE = "application/gzip";

/** Entries of the archive: exactly the files of `bundle` (same guard as the index), under `shenron/`. */
export function pluginArchiveEntries(bundle: PluginBundle): Record<string, string> {
  const entries: Record<string, string> = {};
  for (const file of bundle.files) entries[`${PLUGIN_ARCHIVE_ROOT}/${file.path}`] = file.text;
  return entries;
}

// ── agy install prompt ────────────────────────────────────────────────────────

/** Source of the agy prompt inside the plugin; `{{name}}` placeholders are filled when served. */
export const PLUGIN_AGY_PROMPT = "install/agy.md";

/**
 * The agy install prompt for `origin`: placeholders `{{origin}}`, `{{archive}}`, `{{prompt}}`,
 * `{{mcp}}`, `{{version}}`, `{{revision}}` filled, the leading maintainer comment dropped.
 * `null` when the plugin carries no prompt.
 */
export function renderAgyPrompt(bundle: PluginBundle, origin: string): Rendered | null {
  const source = findPluginFile(bundle, PLUGIN_AGY_PROMPT);
  if (!source) return null;
  const urls = pluginApiUrls(origin);
  const values: Record<string, string> = {
    origin: origin.replace(/\/+$/, ""),
    archive: urls.archive,
    prompt: urls.agyPrompt,
    mcp: `${origin.replace(/\/+$/, "")}/mcp`,
    version: bundle.version,
    revision: bundle.sha256.slice(0, 12),
  };
  const body = source.text
    .replace(/^<!--[\s\S]*?-->\s*/, "")
    .replace(/\{\{(\w+)\}\}/g, (all, name: string) => values[name] ?? all);
  return { body, contentType: MIME.md! };
}

/** Le fichier `path` du plugin, ou `null` (chemin inconnu : aucune lecture hors de l'index). */
export function findPluginFile(bundle: PluginBundle, path: string): PluginFile | null {
  const clean = path.replace(/^\/+/, "");
  return bundle.files.find((f) => f.path === clean) ?? null;
}
