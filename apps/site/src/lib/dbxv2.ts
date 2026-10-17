import "server-only";
/**
 * Server-side access to the private DBXV2 tools of the admin area. Nothing here is reachable
 * without the site gate (`dbxv2SiteGate`) AND an admin session (every caller runs
 * `requireAdmin()` first). The private package is loaded at run time through a hidden dynamic
 * import: the bundler never sees it, so no build artifact contains it, and a production or public
 * runtime cannot load it at all.
 *
 * The browser only ever receives short-lived signed URLs of the loopback proxy, never the token.
 */
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { dbxv2SiteGate } from "@/lib/dbxv2-gate";

/** The slice of the private package this module relies on (structural, no static import). */
export interface Dbxv2Module {
  dbxv2Status(env: NodeJS.ProcessEnv): { enabled: boolean };
  openDbxv2DbFromEnv(env: NodeJS.ProcessEnv, options?: object): Dbxv2DbLike;
  createDbxv2Proxy(options: {
    upstream: { baseUrl: string; token: string };
    ttlSeconds?: number;
  }): Dbxv2ProxyLike;
  parseRef(input: string | { cpk: string; path: string }): { cpk: string; path: string };
}

export interface Dbxv2DbLike {
  search(
    query: string,
    options?: { limit?: number; lang?: string },
  ): Promise<{ hits: Dbxv2HitLike[]; mode: string }>;
  files(query?: {
    q?: string;
    format?: string;
    kind?: string;
    cpk?: string;
    limit?: number;
    offset?: number;
  }): Dbxv2FileLike[];
  characters(): { cpk: string; id: number; shortName: string }[];
  messages(nameId: string): { lang: string; base: string; nameId: string; text: string }[];
  stats(): { files: number; characters: number; messages: number };
}

export interface Dbxv2HitLike {
  title: string;
  kind: string;
  lang: string | null;
  heading: string | null;
  snippet: string;
  score: number;
}

export interface Dbxv2FileLike {
  cpk: string;
  path: string;
  format: string;
  kind: string;
  category: string;
  size: number;
}

export interface Dbxv2ProxyLike {
  sign(
    kind: PreviewKind,
    ref: { cpk: string; path: string },
    params?: { index?: number; cue?: number },
    ttlSeconds?: number,
  ): string;
}

export type PreviewKind = "png" | "wav" | "video" | "model.glb";

export type Dbxv2FailureCode = "disabled" | "unavailable" | "invalid" | "unsupported" | "failed";

export class Dbxv2SiteError extends Error {
  constructor(readonly code: Dbxv2FailureCode) {
    super(code);
  }
}

/** Preview kind of a file format, or null when the viewers cannot show it. */
export function previewKindOf(format: string): PreviewKind | null {
  switch (format.toLowerCase()) {
    case "emb":
    case "png":
    case "dds":
    case "tex":
      return "png";
    case "acb":
    case "awb":
    case "hca":
    case "adx":
    case "wav":
      return "wav";
    case "usm":
    case "mp4":
    case "webm":
      return "video";
    case "emd":
    case "glb":
      return "model.glb";
    default:
      return null;
  }
}

const SIGNED_TTL_SECONDS = 300;

export interface Dbxv2Service {
  stats(): ReturnType<Dbxv2DbLike["stats"]>;
  search(input: { q: string; lang?: "fr" | "en" | "ja"; limit?: number }): Promise<{
    mode: string;
    hits: Dbxv2HitLike[];
  }>;
  files(input: {
    q?: string;
    format?: string;
    cpk?: string;
    limit?: number;
    offset?: number;
  }): Dbxv2FileLike[];
  characters(): { cpk: string; id: number; shortName: string }[];
  messages(nameId: string): { lang: string; text: string }[];
  /** Signed, short-lived loopback URL for one resource. */
  preview(input: { ref: string; kind: PreviewKind; index?: number; cue?: number }): {
    kind: PreviewKind;
    url: string;
    expiresInSeconds: number;
  };
}

/** Builds the service on an already loaded module; exported for tests. */
export function createDbxv2Service(
  mod: Dbxv2Module,
  env: NodeJS.ProcessEnv,
  proxyFactory: Dbxv2Module["createDbxv2Proxy"] = mod.createDbxv2Proxy,
): Dbxv2Service {
  if (!mod.dbxv2Status(env).enabled) throw new Dbxv2SiteError("disabled");
  const baseUrl = env.DBXV2_SERVER_URL!.trim();
  const token = env.DBXV2_TOKEN!;
  const db = mod.openDbxv2DbFromEnv(env);
  const proxy = proxyFactory({
    upstream: { baseUrl, token },
    ttlSeconds: SIGNED_TTL_SECONDS,
  });
  const clamp = (n: number | undefined, fallback: number, max: number) =>
    Math.min(Math.max(Math.trunc(n ?? fallback), 1), max);
  return {
    stats: () => db.stats(),
    async search({ q, lang, limit }) {
      const query = q.trim().slice(0, 200);
      if (query.length < 2) throw new Dbxv2SiteError("invalid");
      const result = await db.search(query, { limit: clamp(limit, 20, 50), lang });
      return { mode: result.mode, hits: result.hits };
    },
    files: ({ q, format, cpk, limit, offset }) =>
      db.files({
        q: q?.trim().slice(0, 200) || undefined,
        format: format?.trim().slice(0, 16) || undefined,
        cpk: cpk?.trim().slice(0, 64) || undefined,
        limit: clamp(limit, 50, 200),
        offset: Math.max(0, Math.trunc(offset ?? 0)),
      }),
    characters: () => db.characters(),
    messages: (nameId) =>
      db.messages(nameId.trim().slice(0, 200)).map(({ lang, text }) => ({ lang, text })),
    preview({ ref, kind, index, cue }) {
      let parsed;
      try {
        parsed = mod.parseRef(ref);
      } catch {
        throw new Dbxv2SiteError("invalid");
      }
      const params =
        kind === "png" && index !== undefined
          ? { index }
          : kind === "wav" && cue !== undefined
            ? { cue }
            : undefined;
      return {
        kind,
        url: proxy.sign(kind, parsed, params, SIGNED_TTL_SECONDS),
        expiresInSeconds: SIGNED_TTL_SECONDS,
      };
    },
  };
}

/** Location of the private package (never bundled): the monorepo checkout next to the site. */
function privatePackageEntry(): string | null {
  for (const base of [process.cwd(), resolve(process.cwd(), "../..")]) {
    const entry = resolve(base, "packages/dbxv2/src/index.ts");
    if (existsSync(entry)) return pathToFileURL(entry).href;
  }
  return null;
}

type Cached = { service: Dbxv2Service } | { error: Dbxv2SiteError };
const KEY = Symbol.for("shenron.dbxv2.service");

/** The process-wide service, created lazily; throws `Dbxv2SiteError` with a stable code. */
export async function getDbxv2Service(): Promise<Dbxv2Service> {
  if (!dbxv2SiteGate().enabled) throw new Dbxv2SiteError("disabled");
  const holder = globalThis as unknown as Record<symbol, Cached | undefined>;
  const known = holder[KEY];
  if (known) {
    if ("service" in known) return known.service;
    throw known.error;
  }
  try {
    const entry = privatePackageEntry();
    if (!entry) throw new Dbxv2SiteError("unavailable");
    const mod = (await import(
      /* webpackIgnore: true */ /* turbopackIgnore: true */ entry
    )) as Dbxv2Module;
    const service = createDbxv2Service(mod, process.env);
    holder[KEY] = { service };
    return service;
  } catch (error) {
    const wrapped = error instanceof Dbxv2SiteError ? error : new Dbxv2SiteError("unavailable");
    // Not cached: the owner may start the server or fix the environment without a restart.
    throw wrapped;
  }
}
