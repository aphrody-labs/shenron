/** References to entries of a CPK and the resource kinds served by the private server. */
import { Dbxv2ConfigError } from "./errors";

export interface Dbxv2Ref {
  readonly cpk: string;
  /** Path inside the CPK, forward slashes, no leading slash. */
  readonly path: string;
}

export type Dbxv2RefInput = Dbxv2Ref | string;

export type Dbxv2ResourceKind = "raw" | "png" | "wav" | "video" | "model.json" | "model.glb";

export interface Dbxv2ResourceParams {
  /** `png`: entry index inside the EMB. */
  readonly index?: number;
  /** `wav`: sub-sound index inside the ACB. */
  readonly cue?: number;
  /** `model.*`: explicit sibling EMB / ESK paths. */
  readonly emb?: string;
  readonly esk?: string;
}

export const DBXV2_RESOURCE_KINDS: readonly Dbxv2ResourceKind[] = [
  "raw",
  "png",
  "wav",
  "video",
  "model.json",
  "model.glb",
];

const CPK_NAME = /^[A-Za-z0-9_]+$/;

/** Parses `"<cpk>/<path>"` or validates an object reference. */
export function parseRef(input: Dbxv2RefInput): Dbxv2Ref {
  let cpk: string;
  let path: string;
  if (typeof input === "string") {
    const cut = input.indexOf("/");
    if (cut < 0)
      throw new Dbxv2ConfigError(`invalid DBXV2 reference "${input}": expected cpk/path`);
    cpk = input.slice(0, cut);
    path = input.slice(cut + 1);
  } else {
    cpk = input.cpk;
    path = input.path;
  }
  if (!CPK_NAME.test(cpk)) throw new Dbxv2ConfigError(`invalid CPK name "${cpk}"`);
  if (!path || path.startsWith("/") || path.includes("\0") || path.split("/").includes(".."))
    throw new Dbxv2ConfigError(`invalid CPK entry path "${path}"`);
  return { cpk, path };
}

export function formatRef(ref: Dbxv2Ref): string {
  return `${ref.cpk}/${ref.path}`;
}

const encodePath = (path: string): string => path.split("/").map(encodeURIComponent).join("/");

const intParam = (name: string, value: number | undefined, query: URLSearchParams): void => {
  if (value === undefined) return;
  if (!Number.isInteger(value) || value < 0)
    throw new Dbxv2ConfigError(`${name} must be a non-negative integer`);
  query.set(name, String(value));
};

/** Query parameters accepted by each kind (anything else is dropped). Keys are sorted. */
export function resourceQuery(
  kind: Dbxv2ResourceKind,
  params: Dbxv2ResourceParams = {},
): URLSearchParams {
  const query = new URLSearchParams();
  if (kind === "png") intParam("index", params.index, query);
  if (kind === "wav") intParam("cue", params.cue, query);
  if (kind === "model.json" || kind === "model.glb") {
    if (params.emb !== undefined) query.set("emb", params.emb);
    if (params.esk !== undefined) query.set("esk", params.esk);
  }
  query.sort();
  return query;
}

/** Server path (no origin, no query) of a resource, e.g. `/cpk/CHARA/png/a/b.emb`. */
export function resourcePath(kind: Dbxv2ResourceKind, input: Dbxv2RefInput): string {
  const { cpk, path } = parseRef(input);
  const base = `/cpk/${cpk}`;
  switch (kind) {
    case "raw":
      return `${base}/raw/${encodePath(path)}`;
    case "png":
      return `${base}/png/${encodePath(path)}`;
    case "wav":
      return `${base}/wav/${encodePath(path)}`;
    case "video":
      return `${base}/video/${encodePath(path)}`;
    case "model.json":
      return `${base}/model/${encodePath(path)}.json`;
    case "model.glb":
      return `${base}/model/${encodePath(path)}.glb`;
  }
}
