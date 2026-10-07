export const FAVORITE_KINDS = [
  "episode",
  "movie",
  "chapter",
  "databook",
  "character",
  "saga",
  "game",
] as const;
export type FavoriteKind = (typeof FAVORITE_KINDS)[number];
export interface Favorite {
  kind: FavoriteKind;
  id: string;
  title: string;
  href: string;
  image?: string | null;
  caption?: string | null;
  at: number;
}
export const FAVORITES_MAX = 200;
export const FAVORITES_BODY_MAX = 512 * 1024;

/** Accept only a same-origin internal path, including after URL normalization. */
export function sanitizeInternalPath(value: unknown, maxLength = 512): string | null {
  if (typeof value !== "string") return null;
  const raw = value.trim();
  if (!raw || raw.length > maxLength || !raw.startsWith("/") || raw.includes("\\")) {
    return null;
  }

  const base = "https://dbfr.invalid";
  try {
    const parsed = new URL(raw, base);
    if (parsed.origin !== base) return null;
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return null;
  }
}

const KINDS = new Set<string>(FAVORITE_KINDS);

/** Normalize untrusted records before storing or returning them. */
export function sanitizeFavorites(input: unknown): Favorite[] {
  if (!Array.isArray(input)) return [];
  const str = (v: unknown, max: number): string | null =>
    typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null;

  const out: Favorite[] = [];
  const seen = new Set<string>();
  for (const raw of input.slice(0, FAVORITES_MAX)) {
    if (!raw || typeof raw !== "object") continue;
    const f = raw as Record<string, unknown>;
    const kind = str(f.kind, 20);
    const id = str(f.id, 64);
    const title = str(f.title, 200);
    const href = sanitizeInternalPath(f.href, 300);
    if (!kind || !KINDS.has(kind) || !id || !title || !href) continue;
    const key = `${kind}:${id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      kind: kind as FavoriteKind,
      id,
      title,
      href,
      image: str(f.image, 300),
      caption: str(f.caption, 120),
      at: typeof f.at === "number" && Number.isFinite(f.at) ? f.at : Date.now(),
    });
  }
  return out;
}
