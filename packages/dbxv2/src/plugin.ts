/**
 * Bun plugin for `dbxv2:<cpk>/<path-in-cpk>?<format>` imports (private, development only).
 *
 *   import url from "dbxv2:CHARA/chara/001.emb?png";      // signed loopback URL (string)
 *   import wav from "dbxv2:BGM/bgm/theme.acb?wav";         // idem, audio/wav
 *   import clip from "dbxv2:MOVIE/op.usm?video";           // idem, mp4/webm/mpeg
 *   import model from "dbxv2:CHARA/chara/001.emd?model";   // validated model JSON (top-level await)
 *   import glb from "dbxv2:CHARA/chara/001.emd?glb";       // signed URL of the binary glTF
 *   import bytes from "dbxv2:CHARA/chara/001.emd?raw";     // ArrayBuffer (top-level await)
 *
 * Extra parameters follow the format: `?png&index=2`, `?wav&cue=1`, `?model&emb=...&esk=...`.
 * Generated modules read the server from the environment at run time: no game byte, URL or token
 * is ever fixed in a module. `Bun.build` is refused for public/production builds.
 */
import { join } from "node:path";
import { Dbxv2ConfigError, Dbxv2DisabledError } from "./errors";
import { dbxv2Status, describeDisabledReason, type Dbxv2EnvInput } from "./env";
import { assertDbxv2BuildAllowed, DBXV2_MARKER, type BuildConfigLike } from "./guard";
import { parseRef, type Dbxv2Ref, type Dbxv2ResourceKind, type Dbxv2ResourceParams } from "./refs";

export const DBXV2_NAMESPACE = "dbxv2";

export type Dbxv2Format = "png" | "wav" | "video" | "model" | "glb" | "raw";

const FORMATS: readonly Dbxv2Format[] = ["png", "wav", "video", "model", "glb", "raw"];

const KIND_OF: Readonly<Record<Dbxv2Format, Dbxv2ResourceKind>> = {
  png: "png",
  wav: "wav",
  video: "video",
  model: "model.json",
  glb: "model.glb",
  raw: "raw",
};

export interface ParsedSpecifier {
  readonly ref: Dbxv2Ref;
  readonly format: Dbxv2Format;
  readonly params: Dbxv2ResourceParams;
}

/** Parses `dbxv2:<cpk>/<path>?<format>[&param=value]`. */
export function parseSpecifier(specifier: string): ParsedSpecifier {
  if (!specifier.startsWith("dbxv2:"))
    throw new Dbxv2ConfigError(`not a dbxv2: specifier: ${specifier}`);
  const body = specifier.slice("dbxv2:".length);
  const cut = body.indexOf("?");
  const refPart = cut < 0 ? body : body.slice(0, cut);
  const query = new URLSearchParams(cut < 0 ? "" : body.slice(cut + 1));
  const ref = parseRef(refPart);
  const formats = FORMATS.filter((f) => query.has(f));
  if (formats.length !== 1) {
    throw new Dbxv2ConfigError(
      `dbxv2:${refPart} needs exactly one format suffix (${FORMATS.map((f) => `?${f}`).join(", ")})`,
    );
  }
  const format = formats[0]!;
  const int = (name: string): number | undefined => {
    const raw = query.get(name);
    if (raw === null) return undefined;
    const n = Number(raw);
    if (!Number.isInteger(n) || n < 0)
      throw new Dbxv2ConfigError(`dbxv2: parameter ${name} must be a non-negative integer`);
    return n;
  };
  const params: Dbxv2ResourceParams = {
    index: int("index"),
    cue: int("cue"),
    emb: query.get("emb") ?? undefined,
    esk: query.get("esk") ?? undefined,
  };
  return { ref, format, params };
}

const defined = <T extends object>(value: T): Partial<T> =>
  Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined)) as Partial<T>;

const RUNTIME_FILE = join(import.meta.dir, "runtime.ts");

/** Source of the module generated for a specifier (a thin wrapper over the runtime). */
export function generateModuleSource(parsed: ParsedSpecifier): string {
  const { ref, format, params } = parsed;
  const head = [
    `/*${DBXV2_MARKER}*/`,
    // Survives bundling (comments do not): the public build guard looks for this literal.
    `globalThis[Symbol.for(${JSON.stringify(DBXV2_MARKER)})] = true;`,
    `import { resource } from ${JSON.stringify(RUNTIME_FILE)};`,
    `const r = resource(${JSON.stringify(ref)}, ${JSON.stringify(KIND_OF[format])}, ${JSON.stringify(defined(params))});`,
    "export const ref = r.ref;",
  ];
  switch (format) {
    case "model":
      return [
        ...head,
        `const glb = resource(${JSON.stringify(ref)}, "model.glb", ${JSON.stringify(defined(params))});`,
        "export const jsonUrl = r.url();",
        "export const glbUrl = glb.url();",
        "export default await r.model();",
      ].join("\n");
    case "raw":
      return [
        ...head,
        "export const url = r.url();",
        "export const blob = (signal) => r.blob(signal);",
        "export default await r.arrayBuffer();",
      ].join("\n");
    default:
      return [
        ...head,
        "export const url = r.url();",
        "export const blob = (signal) => r.blob(signal);",
        "export const arrayBuffer = (signal) => r.arrayBuffer(signal);",
        "export default url;",
      ].join("\n");
  }
}

export interface Dbxv2PluginOptions {
  /** Environment (default `process.env`). */
  readonly env?: Dbxv2EnvInput;
}

/**
 * The plugin object. Under `Bun.build` the build config is checked first: public, production and
 * minified builds are refused. At run time (`Bun.plugin`), a disabled DBXV2 fails the import with
 * the reason and the variables to set.
 */
export function dbxv2Plugin(options: Dbxv2PluginOptions = {}): Bun.BunPlugin {
  return {
    name: "shenron-dbxv2",
    setup(build) {
      const env = options.env ?? (process.env as Dbxv2EnvInput);
      const config = (build as { config?: BuildConfigLike }).config;
      if (config) assertDbxv2BuildAllowed(config, env);
      build.onResolve({ filter: /^dbxv2:/ }, (args) => ({
        path: args.path,
        namespace: DBXV2_NAMESPACE,
      }));
      build.onLoad({ filter: /.*/, namespace: DBXV2_NAMESPACE }, (args) => {
        // Bun hands the namespace load the path without the `dbxv2:` scheme (query kept).
        const parsed = parseSpecifier(
          args.path.startsWith("dbxv2:") ? args.path : `dbxv2:${args.path}`,
        );
        if (config) {
          // Building (development): re-check at load, nothing is resolved against the server.
          assertDbxv2BuildAllowed(config, env);
        } else {
          const status = dbxv2Status(env);
          if (!status.enabled) {
            throw new Dbxv2DisabledError(
              `cannot import dbxv2:${parsed.ref.cpk}/${parsed.ref.path}: ${describeDisabledReason(status.reason)}. ` +
                "Set DBXV2_SERVER_URL and DBXV2_TOKEN to enable the private DBXV2 server.",
            );
          }
        }
        return { contents: generateModuleSource(parsed), loader: "js" };
      });
    },
  };
}

/** Registers the plugin for the current process (`Bun.plugin`). Idempotent per process. */
export function registerDbxv2Plugin(options: Dbxv2PluginOptions = {}): void {
  const flag = Symbol.for("shenron.dbxv2.plugin");
  const holder = globalThis as unknown as Record<symbol, boolean | undefined>;
  if (holder[flag]) return;
  holder[flag] = true;
  Bun.plugin(dbxv2Plugin(options));
}
