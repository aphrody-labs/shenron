import type { VariantEvidence } from "@/db/bot-schema";

const WIKI_ARTWORK_HOSTS = new Set([
  "cdn.dragonballfr.com",
  "dragon-ball-official.com",
  "www.dragon-ball-official.com",
  "en.dragon-ball-official.com",
  "fr.dragon-ball-official.com",
  "jp.dragon-ball-official.com",
  "shonenjump.com",
  "www.shonenjump.com",
  "shueisha.co.jp",
  "www.shueisha.co.jp",
  "vjump.shueisha.co.jp",
  "toei-anim.co.jp",
  "www.toei-anim.co.jp",
  "lineup.toei.co.jp",
  "toei-animation.com",
  "www.toei-animation.com",
]);

export function safePrimaryUrl(value: string): string | null {
  try {
    const url = new URL(value);
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.port ||
      url.href !== value ||
      !WIKI_ARTWORK_HOSTS.has(url.hostname) ||
      /(?:^|\.)fandom\.com$/i.test(url.hostname)
    )
      return null;
    for (const key of url.searchParams.keys())
      if (/token|secret|auth|password|signature|credential|api.?key/i.test(key)) return null;
    if (
      url.hostname === "cdn.dragonballfr.com" &&
      !/^\/assets\/(?:manga|dbz\/officiel-|wiki\/episodes\/|wiki\/variants\/)/.test(url.pathname)
    )
      return null;
    return url.href;
  } catch {
    return null;
  }
}

export function verifiedCharacterVariantImage(
  image: string | null,
  evidence: VariantEvidence | null,
): string | null {
  const legacyArtwork = evidence as
    | (VariantEvidence & { imageArtwork?: { kind?: unknown } })
    | null;
  if (legacyArtwork?.imageArtwork?.kind === "generated") return null;
  const hasImageReference = (evidence?.editorialReferences ?? []).some(
    (reference) => reference.fields.includes("image") && safePrimaryUrl(reference.url) !== null,
  );
  return hasImageReference && image ? safePrimaryUrl(image) : null;
}
