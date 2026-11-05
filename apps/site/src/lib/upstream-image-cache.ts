// SPDX-License-Identifier: Apache-2.0
import "server-only";

/**
 * Cache mémoire des images tierces proxifiées (`/api/avatar`, `/api/ext-image`).
 *
 * Borné en nombre d'entrées et en octets (LRU), avec dédoublonnage des requêtes en
 * vol : cent visiteurs simultanés sur une même image ne font qu'un aller-retour vers
 * l'hôte d'origine. Les absences (404) et erreurs (502) sont retenues dans un second
 * cache, plus petit, pour qu'un flot de clés distinctes ne puisse pas évincer les images
 * valides. La clé est l'URL normalisée (`new URL(...).href`). La taille est contrôlée
 * pendant la lecture du corps (annulation dès `maxBytes` dépassé), le nombre de fetchs
 * amont simultanés est plafonné et chaque IP a un budget de fetchs amont non cachés.
 * Aucun en-tête de l'hôte (surtout pas `Set-Cookie`) n'est relayé.
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
  /** Fetchs amont simultanés (défaut 8). */
  maxConcurrent?: number;
  /** Requêtes en attente d'un créneau avant refus (défaut 256). */
  maxQueue?: number;
}

const MAX_ENTRIES = 600;
const MAX_NEGATIVE_ENTRIES = 100;
const MAX_TOTAL_BYTES = 24 * 1024 * 1024;
const NEGATIVE_TTL_MS = 5 * 60 * 1000;
const ERROR_TTL_MS = 30 * 1000;
const ALLOWED_TYPES = /^image\/(?:jpeg|png|webp|gif|svg\+xml)$/;

const entries = new Map<string, CachedImage>();
const negatives = new Map<string, CachedImage>();
const inflight = new Map<string, Promise<CachedImage>>();
let totalBytes = 0;

/** Clé unique par ressource : URL normalisée, casse des échappements `%xx` uniformisée. */
export function cacheKey(url: string): string {
  try {
    return new URL(url).href.replace(/%[0-9a-f]{2}/gi, (m) => m.toUpperCase());
  } catch {
    return url;
  }
}

function store(key: string, value: CachedImage): void {
  if (value.status !== 200) {
    negatives.delete(key);
    negatives.set(key, value);
    while (negatives.size > MAX_NEGATIVE_ENTRIES) {
      const oldest = negatives.keys().next().value;
      if (oldest === undefined) break;
      negatives.delete(oldest);
    }
    return;
  }
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

/** Lit au plus `maxBytes` octets ; `null` (et annulation du flux amont) dès que la limite est dépassée. */
async function readBounded(response: Response, maxBytes: number): Promise<Uint8Array | null> {
  const reader = response.body?.getReader();
  if (!reader) return new Uint8Array(0);
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => undefined);
      return null;
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

let active = 0;
const waiters: Array<() => void> = [];

async function acquire(max: number, maxQueue: number): Promise<boolean> {
  if (active < max) {
    active++;
    return true;
  }
  if (waiters.length >= maxQueue) return false;
  await new Promise<void>((resolve) => waiters.push(resolve));
  return true; // le créneau a été transmis par release()
}

function release(): void {
  const next = waiters.shift();
  if (next) next();
  else active--;
}

async function load(url: string, options: Options): Promise<CachedImage> {
  const now = Date.now();
  if (!(await acquire(options.maxConcurrent ?? 8, options.maxQueue ?? 256))) {
    return { status: 502, body: null, type: "", expires: now + ERROR_TTL_MS };
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 6_000);
  try {
    const response = await fetch(url, {
      headers: { "user-agent": options.userAgent, accept: "image/*" },
      redirect: "error",
      signal: controller.signal,
    });
    if (response.status === 404 || response.status === 403 || response.status === 400) {
      await response.body?.cancel().catch(() => undefined);
      return { status: 404, body: null, type: "", expires: now + NEGATIVE_TTL_MS };
    }
    const type = (response.headers.get("content-type") ?? "").split(";")[0]?.trim() ?? "";
    if (!response.ok || !ALLOWED_TYPES.test(type)) {
      await response.body?.cancel().catch(() => undefined);
      return { status: 502, body: null, type: "", expires: now + ERROR_TTL_MS };
    }
    const declared = Number(response.headers.get("content-length") ?? 0);
    if (declared > options.maxBytes) {
      await response.body?.cancel().catch(() => undefined);
      return { status: 502, body: null, type: "", expires: now + NEGATIVE_TTL_MS };
    }
    const bytes = await readBounded(response, options.maxBytes);
    if (!bytes) return { status: 502, body: null, type: "", expires: now + NEGATIVE_TTL_MS };
    return { status: 200, body: bytes, type, expires: now + options.ttlMs };
  } catch {
    controller.abort();
    return { status: 502, body: null, type: "", expires: now + ERROR_TTL_MS };
  } finally {
    clearTimeout(timer);
    release();
  }
}

function lookup(key: string): CachedImage | undefined {
  const hit = entries.get(key);
  if (hit && hit.expires > Date.now()) {
    // Rafraîchit la position LRU.
    entries.delete(key);
    entries.set(key, hit);
    return hit;
  }
  const miss = negatives.get(key);
  return miss && miss.expires > Date.now() ? miss : undefined;
}

/** Vrai si la ressource se sert sans aller-retour amont (cache valide ou requête déjà en vol). */
export function isCached(url: string): boolean {
  const key = cacheKey(url);
  return lookup(key) !== undefined || inflight.has(key);
}

export async function fetchCachedImage(url: string, options: Options): Promise<CachedImage> {
  const key = cacheKey(url);
  const hit = lookup(key);
  if (hit) return hit;
  const pending = inflight.get(key);
  if (pending) return pending;
  const request = load(key, options)
    .then((value) => {
      store(key, value);
      return value;
    })
    .finally(() => inflight.delete(key));
  inflight.set(key, request);
  return request;
}

// --- Limite de débit par IP, pour les requêtes qui déclenchent un fetch amont ---

const RATE_WINDOW_MS = 60_000;
const RATE_MAX_UPSTREAM = 30;
const RATE_MAX_BUCKETS = 5_000;
const buckets = new Map<string, { start: number; count: number }>();

/**
 * Débite un fetch amont pour `ip`. `false` au-delà de 30 par minute. Seaux en mémoire
 * bornés (5 000 IP, les plus anciens écartés).
 */
export function takeUpstreamToken(ip: string, now = Date.now()): boolean {
  let bucket = buckets.get(ip);
  if (!bucket || now - bucket.start >= RATE_WINDOW_MS) {
    bucket = { start: now, count: 0 };
  }
  buckets.delete(ip);
  buckets.set(ip, bucket);
  while (buckets.size > RATE_MAX_BUCKETS) {
    const oldest = buckets.keys().next().value;
    if (oldest === undefined) break;
    buckets.delete(oldest);
  }
  if (bucket.count >= RATE_MAX_UPSTREAM) return false;
  bucket.count++;
  return true;
}

/** IP du client : `cf-connecting-ip` (posé par Cloudflare), sinon `x-real-ip` / dernier `x-forwarded-for`. */
export function imageClientIp(request: Request): string {
  const cf = request.headers.get("cf-connecting-ip")?.trim();
  if (cf) return cf;
  const real = request.headers.get("x-real-ip")?.trim();
  if (real) return real;
  const parts = (request.headers.get("x-forwarded-for") ?? "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  return parts[parts.length - 1] ?? "unknown";
}

/**
 * Sert une image proxifiée : cache d'abord (sans débit), sinon un jeton de débit par IP
 * avant tout fetch amont (429 au-delà).
 */
export async function serveProxiedImage(
  request: Request,
  upstream: string,
  options: Options,
  edgeSeconds: number,
): Promise<Response> {
  if (!isCached(upstream) && !takeUpstreamToken(imageClientIp(request))) {
    return new Response(null, {
      status: 429,
      headers: { "retry-after": "60", "cache-control": "no-store" },
    });
  }
  return imageResponse(await fetchCachedImage(upstream, options), edgeSeconds);
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
