import "server-only";
import { open, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { Readable } from "node:stream";
import { hasValidApiToken } from "@/lib/api-token";
import {
  DEFAULT_PRIVATE_DOWNLOADS_DIR,
  resolveDataPath,
  type DataPath,
} from "@shenron/config/paths";

/**
 * Admin-only downloads (`/api/private-downloads`): files handed to administrators, such as the
 * Shenron Studio installer that carries the private `shenron-chat-v2` adapter. They are never in
 * a release nor on a public mirror: the operator drops them, flat, into
 * `SHENRON_PRIVATE_DOWNLOADS_DIR` (default {@link DEFAULT_PRIVATE_DOWNLOADS_DIR}) with their line
 * in `SHA256SUMS` (`sha256sum` format).
 *
 * Guard: {@link hasValidApiToken} (admin bearer token, or an address of `SHENRON_ADMIN_IPS`).
 * Any other caller gets the same `404` as a missing file, so nothing leaks about what exists.
 */

export const SUMS_FILE = "SHA256SUMS";
/** Text files an agent reads straight from the URL (served inline); anything else is a download. */
const INLINE_TYPES: Readonly<Record<string, string>> = {
  ".md": "text/markdown; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".json": "application/json; charset=utf-8",
};

function contentTypeOf(name: string): { type: string; inline: boolean } {
  const dot = name.lastIndexOf(".");
  const inline = dot > 0 ? INLINE_TYPES[name.slice(dot).toLowerCase()] : undefined;
  return inline
    ? { type: inline, inline: true }
    : { type: "application/octet-stream", inline: false };
}
const NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,199}$/;

export interface PrivateDownload {
  name: string;
  size: number;
  sha256: string | null;
  url: string;
}

export function privateDownloadsDir(env: NodeJS.ProcessEnv = process.env): DataPath {
  return resolveDataPath("privateDownloadsDir", {
    env,
    legacyDefault: DEFAULT_PRIVATE_DOWNLOADS_DIR,
  });
}

/** `true` for a file name that may be served (flat, no dot file, not the sums file). */
export function isServableName(name: string): boolean {
  return NAME.test(name) && name !== SUMS_FILE && !name.includes("..");
}

/** Parses `SHA256SUMS` (`<hex>  <name>` or `<hex> *<name>`); malformed lines are skipped. */
export function parseSums(text: string): Map<string, string> {
  const sums = new Map<string, string>();
  for (const line of text.split("\n")) {
    const match = /^([0-9a-fA-F]{64}) [ *]?(.+)$/.exec(line.trim());
    if (match && isServableName(match[2]!)) sums.set(match[2]!, match[1]!.toLowerCase());
  }
  return sums;
}

async function readSums(dir: string): Promise<Map<string, string>> {
  try {
    return parseSums(await readFile(join(dir, SUMS_FILE), "utf8"));
  } catch {
    return new Map();
  }
}

export function notFound(): Response {
  return Response.json({ error: "Not found." }, { status: 404, headers: noStore() });
}

function noStore(): Record<string, string> {
  return { "cache-control": "private, no-store", "x-robots-tag": "noindex" };
}

/** Index of the files listed in `SHA256SUMS` that exist on disk. */
export async function listPrivateDownloads(request: Request): Promise<Response> {
  if (!hasValidApiToken(request)) return notFound();
  const dir = privateDownloadsDir().path;
  const sums = await readSums(dir);
  const base = new URL("/api/private-downloads/", request.url);
  const files: PrivateDownload[] = [];
  for (const [name, sha256] of [...sums].sort(([a], [b]) => a.localeCompare(b))) {
    const info = await stat(join(dir, name)).catch(() => null);
    if (info?.isFile())
      files.push({ name, size: info.size, sha256, url: new URL(name, base).toString() });
  }
  return Response.json({ files }, { headers: noStore() });
}

/** Parses a single `bytes=a-b` range against `size`; `null` when absent, `"invalid"` otherwise. */
export function parseRange(
  header: string | null,
  size: number,
): { start: number; end: number } | null | "invalid" {
  if (!header) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match || (match[1] === "" && match[2] === "")) return "invalid";
  let start: number;
  let end: number;
  if (match[1] === "") {
    const suffix = Number(match[2]);
    if (suffix === 0) return "invalid";
    start = Math.max(0, size - suffix);
    end = size - 1;
  } else {
    start = Number(match[1]);
    end = match[2] === "" ? size - 1 : Math.min(Number(match[2]), size - 1);
  }
  if (start > end || start >= size) return "invalid";
  return { start, end };
}

/** Streams one file, with `Range` support so an interrupted download resumes. */
export async function servePrivateDownload(request: Request, name: string): Promise<Response> {
  if (!hasValidApiToken(request) || !isServableName(name)) return notFound();
  const dir = privateDownloadsDir().path;
  const sums = await readSums(dir);
  const sha256 = sums.get(name);
  if (!sha256) return notFound();
  const path = join(dir, name);
  const info = await stat(path).catch(() => null);
  if (!info?.isFile()) return notFound();
  const size = info.size;
  const kind = contentTypeOf(name);
  const headers: Record<string, string> = {
    ...noStore(),
    "accept-ranges": "bytes",
    "content-type": kind.type,
    "content-disposition": `${kind.inline ? "inline" : "attachment"}; filename="${name}"`,
    "x-checksum-sha256": sha256,
    "x-accel-buffering": "no",
    "last-modified": info.mtime.toUTCString(),
    etag: `"${sha256.slice(0, 32)}"`,
  };
  const ifNoneMatch = request.headers.get("if-none-match");
  if (ifNoneMatch && ifNoneMatch.split(",").some((tag) => tag.trim() === headers.etag)) {
    return new Response(null, { status: 304, headers });
  }
  const range = parseRange(request.headers.get("range"), size);
  if (range === "invalid") {
    return new Response(null, {
      status: 416,
      headers: { ...headers, "content-range": `bytes */${size}` },
    });
  }
  const { start, end } = range ?? { start: 0, end: size - 1 };
  headers["content-length"] = String(end - start + 1);
  if (range) headers["content-range"] = `bytes ${start}-${end}/${size}`;
  if (request.method === "HEAD" || size === 0) {
    return new Response(null, { status: range ? 206 : 200, headers });
  }
  const handle = await open(path, "r");
  const stream = handle.createReadStream({ start, end });
  return new Response(Readable.toWeb(stream) as unknown as ReadableStream<Uint8Array>, {
    status: range ? 206 : 200,
    headers,
  });
}
