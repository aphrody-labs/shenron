/**
 * Generation of `dbxv2.d.ts`: ambient modules typed per format for `dbxv2:*?<format>` imports and
 * a union of the known entry paths, read from the private index. The file is written under `var/`
 * (ignored by Git) and is itself refused by the public build guard.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve, sep } from "node:path";
import type { Dbxv2Client } from "./client";
import { Dbxv2ConfigError } from "./errors";
import { DBXV2_DECLARATIONS_FILE, DBXV2_MARKER } from "./guard";
import { formatRef, parseRef, type Dbxv2Ref } from "./refs";

export interface DeclarationOptions {
  /** Past this many paths the union degrades to template literal types (default 20 000). */
  readonly maxLiteralPaths?: number;
}

const EXTENSIONS = {
  png: ["emb"],
  wav: ["acb", "awb"],
  video: ["usm"],
  model: ["emd"],
} as const;

const lit = (value: string): string => JSON.stringify(value);

const unionOf = (items: readonly string[], fallback: string): string =>
  items.length === 0 ? fallback : items.map(lit).join("\n  | ");

/** Text of the declaration file for the given references (already validated). */
export function renderDeclarations(
  refs: readonly Dbxv2Ref[],
  options: DeclarationOptions = {},
): string {
  const max = options.maxLiteralPaths ?? 20_000;
  const all = [...new Set(refs.map(formatRef))].toSorted();
  const literal = all.length <= max;
  const byExt = (exts: readonly string[]): string[] =>
    all.filter((p) => exts.includes(p.slice(p.lastIndexOf(".") + 1).toLowerCase()));
  const pathType = (items: readonly string[]): string =>
    literal ? unionOf(items, "never") : "`${string}/${string}`";

  const lines = [
    `// ${DBXV2_MARKER}: generated from the private DBXV2 index. Never commit, never ship.`,
    "// Regenerate with: bun run --filter @aphrody/shenron-dbxv2 types",
    "",
    "/** Reference to an entry of a CPK: `<cpk>/<path>`. */",
    `type Dbxv2KnownPath =\n  | ${pathType(all)};`,
    `type Dbxv2KnownImage =\n  | ${pathType(byExt(EXTENSIONS.png))};`,
    `type Dbxv2KnownAudio =\n  | ${pathType(byExt(EXTENSIONS.wav))};`,
    `type Dbxv2KnownVideo =\n  | ${pathType(byExt(EXTENSIONS.video))};`,
    `type Dbxv2KnownModel =\n  | ${pathType(byExt(EXTENSIONS.model))};`,
    'type Dbxv2Specifier = `dbxv2:${Dbxv2KnownPath}?${"png" | "wav" | "video" | "model" | "glb" | "raw"}`;',
    "",
  ];
  const resourceModule = (format: string, note: string): string[] => [
    `/** ${note} */`,
    `declare module "dbxv2:*?${format}" {`,
    "  /** Entry reference. */",
    "  export const ref: { readonly cpk: string; readonly path: string };",
    "  /** Short-lived signed loopback URL (no token in it). */",
    "  export const url: string;",
    "  export function blob(signal?: AbortSignal): Promise<Blob>;",
    "  export function arrayBuffer(signal?: AbortSignal): Promise<ArrayBuffer>;",
    "  export default url;",
    "}",
    "",
  ];
  lines.push(
    ...resourceModule("png", "EMB texture as PNG (`?png&index=N` selects another texture)."),
    ...resourceModule("wav", "ACB sub-sound as WAV (`?wav&cue=N`)."),
    ...resourceModule("video", "USM as MP4, WebM or MPEG-2."),
    ...resourceModule("glb", "Assembled EMD as binary glTF."),
    "/** Assembled EMD metadata (geometry and texture sizes), validated at load. */",
    'declare module "dbxv2:*?model" {',
    '  import type { Dbxv2ModelJson } from "@aphrody/shenron-dbxv2/schemas";',
    "  export const ref: { readonly cpk: string; readonly path: string };",
    "  export const jsonUrl: string;",
    "  export const glbUrl: string;",
    "  const model: Dbxv2ModelJson;",
    "  export default model;",
    "}",
    "",
    "/** Decompressed entry bytes. */",
    'declare module "dbxv2:*?raw" {',
    "  export const ref: { readonly cpk: string; readonly path: string };",
    "  export const url: string;",
    "  export function blob(signal?: AbortSignal): Promise<Blob>;",
    "  const bytes: ArrayBuffer;",
    "  export default bytes;",
    "}",
    "",
  );
  return lines.join("\n");
}

/** Every reference of the private server (all CPKs, or those listed), through `find`. */
export async function collectKnownRefs(
  client: Dbxv2Client,
  options: { readonly cpks?: readonly string[]; readonly signal?: AbortSignal } = {},
): Promise<Dbxv2Ref[]> {
  const names = options.cpks ?? (await client.cpks({ signal: options.signal })).map((c) => c.name);
  const refs: Dbxv2Ref[] = [];
  for (const name of names) {
    for await (const entry of client.findAll(name, { signal: options.signal, pageSize: 5000 })) {
      try {
        refs.push(parseRef({ cpk: name, path: entry.path }));
      } catch {
        // an entry name the reference grammar rejects cannot be imported anyway
      }
    }
  }
  return refs;
}

/** Default target: `<cwd>/var/dbxv2/dbxv2.d.ts` (ignored by Git). */
export function defaultDeclarationsPath(cwd: string): string {
  return resolve(cwd, "var", "dbxv2", DBXV2_DECLARATIONS_FILE);
}

/** Writes the declarations; refuses a path outside a `var/` directory unless `allowOutsideVar`. */
export function writeDeclarations(
  outFile: string,
  content: string,
  options: { readonly allowOutsideVar?: boolean } = {},
): string {
  const target = resolve(outFile);
  if (!options.allowOutsideVar && !target.split(sep).includes("var"))
    throw new Dbxv2ConfigError(
      `refusing to write DBXV2 declarations outside a var/ directory: ${target}`,
    );
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, content, "utf8");
  return target;
}
