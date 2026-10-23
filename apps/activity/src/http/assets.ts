// SPDX-License-Identifier: Apache-2.0
/**
 * Static files of the built client.
 *
 * The Discord proxy strips cache headers from `text/html` responses, so every file but the HTML page
 * carries a content hash in its name and is served `immutable`; the page itself is `no-store` and
 * references those names. Two stores implement the same interface: a directory (`dist/`) and a
 * manifest of files embedded in a compiled binary (`scripts/compile.ts`).
 */
import { isAbsolute, join, normalize, relative, resolve } from "node:path";

export interface Asset {
  /** Request path without the leading slash (`index.html`, `main-3f9a1c2b.js`). */
  readonly path: string;
  readonly type: string;
  readonly bytes: Uint8Array;
  /** Hashed name: safe to cache for a year. */
  readonly immutable: boolean;
}

export interface AssetStore {
  /** The file for a request path (`/` maps to `index.html`), or `null`. */
  read(requestPath: string): Promise<Asset | null>;
  /** Whether the store has the HTML page (health). */
  hasIndex(): Promise<boolean>;
}

const HASHED = /[-.][0-9a-z]{8,}\.[a-z0-9]+$/i;

export function isImmutableName(path: string): boolean {
  return path !== "index.html" && HASHED.test(path);
}

const TYPES: Readonly<Record<string, string>> = {
  html: "text/html; charset=utf-8",
  js: "text/javascript; charset=utf-8",
  mjs: "text/javascript; charset=utf-8",
  css: "text/css; charset=utf-8",
  json: "application/json; charset=utf-8",
  map: "application/json; charset=utf-8",
  svg: "image/svg+xml",
  png: "image/png",
  webp: "image/webp",
  woff2: "font/woff2",
  txt: "text/plain; charset=utf-8",
};

export function contentTypeOf(path: string): string {
  const extension = path.slice(path.lastIndexOf(".") + 1).toLowerCase();
  return TYPES[extension] ?? "application/octet-stream";
}

/**
 * Normalises a request path to a safe relative file path, or `null`. Rejects traversal, backslashes,
 * NUL bytes, absolute and drive paths, and anything with a dot segment.
 */
export function safeAssetPath(requestPath: string): string | null {
  let decoded: string;
  try {
    decoded = decodeURIComponent(requestPath);
  } catch {
    return null;
  }
  if (decoded.includes("\0") || decoded.includes("\\")) return null;
  const trimmed = decoded.replace(/^\/+/, "");
  const path = trimmed === "" ? "index.html" : trimmed;
  if (path.split("/").some((segment) => segment === "" || segment === "." || segment === ".."))
    return null;
  if (isAbsolute(path) || /^[A-Za-z]:/.test(path)) return null;
  return normalize(path).split("\\").join("/");
}

/** Serves a directory; files are read on demand and the small ones kept in memory. */
export function directoryAssets(root: string): AssetStore {
  const base = resolve(root);
  return {
    async read(requestPath) {
      const path = safeAssetPath(requestPath);
      if (path === null) return null;
      const full = resolve(base, path);
      const rel = relative(base, full);
      if (rel.startsWith("..") || isAbsolute(rel)) return null;
      const file = Bun.file(join(base, path));
      if (!(await file.exists())) return null;
      return {
        path,
        type: contentTypeOf(path),
        bytes: new Uint8Array(await file.arrayBuffer()),
        immutable: isImmutableName(path),
      };
    },
    async hasIndex() {
      return Bun.file(join(base, "index.html")).exists();
    },
  };
}

/** Serves files embedded in a compiled binary: `entries` maps a path to a file path or blob. */
export function embeddedAssets(entries: Readonly<Record<string, string>>): AssetStore {
  return {
    async read(requestPath) {
      const path = safeAssetPath(requestPath);
      if (path === null) return null;
      const source = entries[path];
      if (source === undefined) return null;
      const file = Bun.file(source);
      return {
        path,
        type: contentTypeOf(path),
        bytes: new Uint8Array(await file.arrayBuffer()),
        immutable: isImmutableName(path),
      };
    },
    async hasIndex() {
      return entries["index.html"] !== undefined;
    },
  };
}

const COMPRESSIBLE = /^(?:text\/|application\/json|image\/svg)/;
const gzipCache = new Map<string, Uint8Array>();

/** Gzip of an asset when worthwhile (text, over 1 KiB); cached because assets never change. */
export function gzipped(asset: Asset): Uint8Array | null {
  if (asset.bytes.length < 1024 || !COMPRESSIBLE.test(asset.type)) return null;
  const key = `${asset.path}:${asset.bytes.length}`;
  let packed = gzipCache.get(key);
  if (!packed) {
    packed = Bun.gzipSync(asset.bytes as Uint8Array<ArrayBuffer>);
    if (gzipCache.size > 64) gzipCache.clear();
    gzipCache.set(key, packed);
  }
  return packed;
}
