const MAX_SEGMENTS = 4096;
const SEGMENT_TTL_MS = 10 * 60_000;

type Segment = { url: string; referer: string; expiresAt: number };
const segments = new Map<string, Segment>();

/** Short-lived opaque identifiers keep upstream URLs and headers out of public playlists. */
export function registerHlsSegment(url: string, referer: string): string {
  if (segments.size >= MAX_SEGMENTS) {
    const now = Date.now();
    for (const [key, value] of segments) if (value.expiresAt <= now) segments.delete(key);
    if (segments.size >= MAX_SEGMENTS) segments.delete(segments.keys().next().value!);
  }
  const id = crypto.randomUUID();
  segments.set(id, { url, referer, expiresAt: Date.now() + SEGMENT_TTL_MS });
  return id;
}

export function readHlsSegment(id: string): { url: string; referer: string } | null {
  const segment = segments.get(id);
  if (!segment || segment.expiresAt <= Date.now()) {
    segments.delete(id);
    return null;
  }
  return { url: segment.url, referer: segment.referer };
}
