// SPDX-License-Identifier: Apache-2.0
import "server-only";

/**
 * Cache mémoire des images tierces proxifiées (`/api/avatar`, `/api/ext-image`).
 *
 * Borné en nombre d'entrées et en octets (LRU), avec dédoublonnage des requêtes en
 * vol : cent visiteurs simultanés sur une même image ne font qu'un aller-retour vers
 * l'hôte d'origine. Une absence (404) est retenue 5 minutes pour ne pas marteler
 * l'hôte. Aucun en-tête de l'hôte (surtout pas `Set-Cookie`) n'est relayé.
 */
export interface CachedImage {
  status: 200 | 404 | 502;
  body: Uint8Array | null;
  type: string;
  expires: number;
}

interface Options {
  maxBytes: number;
  ttlMs: number;
  userAgent: string;
}

const MAX_ENTRIES = 600;
const MAX_TOTAL_BYTES = 24 * 1024 * 1024;
const NEGATIVE_TTL_MS = 5 * 60 * 1000;
const ERROR_TTL_MS = 30 * 1000;
const ALLOWED_TYPES = /^image\/(?:jpeg|png|webp|gif|svg\+xml)$/;

const entries = new Map<string, CachedImage>();
const inflight = new Map<string, Promise<CachedImage>>();
let totalBytes = 0;

function store(key: string, value: CachedImage): void {
  const previous = entries.get(key);
  if (previous) totalBytes -= previous.body?.byteLength ?? 0;
  entries.delete(key);
  entries.set(key, value);
  totalBytes += value.body?.byteLength ?? 0;
  for (const [oldest, old] of entries) {
    if (entries.size <= MAX_ENTRIES && totalBytes <= MAX_TOTAL_BYTES) break;
    entries.delete(oldest);
    totalBytes -= old.body?.byteLength ?? 0;
  }
}

async function load(url: string, options: Options): Promise<CachedImage> {
  const now = Date.now();
  try {
    const response = await fetch(url, {
      headers: { "user-agent": options.userAgent, accept: "image/*" },
      redirect: "error",
      signal: AbortSignal.timeout(6_000),
    });
    if (response.status === 404 || response.status === 403 || response.status === 400) {
      return { status: 404, body: null, type: "", expires: now + NEGATIVE_TTL_MS };
    }
    const type = (response.headers.get("content-type") ?? "").split(";")[0]?.trim() ?? "";
    if (!response.ok || !ALLOWED_TYPES.test(type)) {
      return { status: 502, body: null, type: "", expires: now + ERROR_TTL_MS };
    }
    const declared = Number(response.headers.get("content-length") ?? 0);
    if (declared > options.maxBytes) {
      return { status: 502, body: null, type: "", expires: now + NEGATIVE_TTL_MS };
    }
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength > options.maxBytes) {
      return { status: 502, body: null, type: "", expires: now + NEGATIVE_TTL_MS };
    }
    return { status: 200, body: bytes, type, expires: now + options.ttlMs };
  } catch {
    return { status: 502, body: null, type: "", expires: now + ERROR_TTL_MS };
  }
}

export async function fetchCachedImage(url: string, options: Options): Promise<CachedImage> {
  const hit = entries.get(url);
  if (hit && hit.expires > Date.now()) {
    // Rafraîchit la position LRU.
    entries.delete(url);
    entries.set(url, hit);
    return hit;
  }
  const pending = inflight.get(url);
  if (pending) return pending;
  const request = load(url, options)
    .then((value) => {
      store(url, value);
      return value;
    })
    .finally(() => inflight.delete(url));
  inflight.set(url, request);
  return request;
}

/** Réponse HTTP d'une image proxifiée : cache navigateur et CDN, jamais de cookie. */
export function imageResponse(image: CachedImage, edgeSeconds: number): Response {
  if (image.status !== 200 || !image.body) {
    return new Response(null, {
      status: image.status,
      headers: { "cache-control": image.status === 404 ? "public, max-age=300" : "no-store" },
    });
  }
  const headers: Record<string, string> = {
    "content-type": image.type,
    "cache-control": `public, max-age=86400, s-maxage=${edgeSeconds}, stale-while-revalidate=86400`,
    "x-content-type-options": "nosniff",
    "cross-origin-resource-policy": "same-site",
  };
  if (image.type === "image/svg+xml") {
    headers["content-security-policy"] = "default-src 'none'; style-src 'unsafe-inline'; sandbox";
  }
  return new Response(image.body as BodyInit, { status: 200, headers });
}
