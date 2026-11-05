// SPDX-License-Identifier: Apache-2.0
/**
 * Images tierces servies depuis l'origine du site.
 *
 * Un `<img>` vers `cdn.discordapp.com` ou `upload.wikimedia.org` fait poser des
 * cookies tiers par l'hôte (`__cf_bm` pour Discord, `WMF-Uniq` pour Wikimedia) : le
 * navigateur les signale (audit Lighthouse `third-party-cookies`, Bonnes pratiques
 * 77). Le serveur du site va chercher l'image lui-même, la garde en mémoire et la
 * ressert sans cookie. Ces fonctions sont pures (sans `server-only`) : le composant
 * `Avatar` les appelle côté navigateur comme côté serveur.
 *
 * Les chemins gardent l'extension du fichier d'origine (`.webp`, `.jpg`) : le CDN
 * de bord met en cache par extension sans qu'une règle de cache soit nécessaire.
 */

const SNOWFLAKE = /^\d{15,21}$/;
const AVATAR_HASH = /^(?:a_)?[0-9a-f]{32}$/;
const AVATAR_SIZES = [32, 64, 128] as const;
export type AvatarSize = (typeof AVATAR_SIZES)[number];

export function snapAvatarSize(wanted: number): AvatarSize {
  return AVATAR_SIZES.find((size) => size >= wanted) ?? 128;
}

/** `/api/avatar/<user>/<hash>.webp?s=64` pour un avatar Discord personnalisé, ou `/api/avatar/default/<n>.png`. */
export function discordAvatarProxyPath(url: string, size: AvatarSize): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.hostname !== "cdn.discordapp.com") return null;
  const custom = /^\/avatars\/(\d+)\/([\w-]+)\.(?:png|jpe?g|gif|webp)$/.exec(parsed.pathname);
  if (custom?.[1] && custom[2] && SNOWFLAKE.test(custom[1]) && AVATAR_HASH.test(custom[2])) {
    return `/api/avatar/${custom[1]}/${custom[2]}.webp?s=${size}`;
  }
  const fallback = /^\/embed\/avatars\/([0-5])\.png$/.exec(parsed.pathname);
  return fallback?.[1] ? `/api/avatar/default/${fallback[1]}.png` : null;
}

/** URL Discord à interroger pour `/api/avatar/<user>/<file>`, ou `null` si les segments sont invalides. */
export function discordAvatarUpstream(
  user: string,
  file: string,
  size: string | null,
): string | null {
  if (user === "default") {
    const match = /^([0-5])\.png$/.exec(file);
    return match ? `https://cdn.discordapp.com/embed/avatars/${match[1]}.png` : null;
  }
  const match = /^(.+)\.webp$/.exec(file);
  const hash = match?.[1];
  if (!hash || !SNOWFLAKE.test(user) || !AVATAR_HASH.test(hash)) return null;
  const wanted = Number(size ?? 64);
  if (!AVATAR_SIZES.includes(wanted as AvatarSize)) return null;
  return `https://cdn.discordapp.com/avatars/${user}/${hash}.webp?size=${wanted}&animated=false`;
}

const WIKIMEDIA_HOSTS = ["upload.wikimedia.org", "thumb.wikimedia.org"] as const;
const WIKIMEDIA_EXT = /\.(?:jpe?g|png|webp|gif|svg)$/i;
const WIKIMEDIA_SEGMENT = /^[\w%.,()'~!*+-]{1,300}$/;

/** `/api/ext-image/<upload|thumb>/<chemin Wikimedia>` pour un fichier Wikimedia, sinon `null`. */
export function wikimediaProxyPath(url: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== "https:") return null;
  const host = WIKIMEDIA_HOSTS.find((candidate) => candidate === parsed.hostname);
  if (!host || !WIKIMEDIA_EXT.test(parsed.pathname)) return null;
  const path = parsed.pathname.replace(/^\/+/, "");
  const segments = path.split("/");
  if (segments.length < 3 || segments.length > 12) return null;
  if (!segments.every((segment) => WIKIMEDIA_SEGMENT.test(segment) && segment !== "..")) {
    return null;
  }
  return `/api/ext-image/${host === "upload.wikimedia.org" ? "upload" : "thumb"}/${path}`;
}

/** URL Wikimedia d'origine pour les segments de `/api/ext-image/...`, ou `null` si hors liste blanche. */
export function wikimediaUpstream(segments: readonly string[]): string | null {
  const [kind, ...rest] = segments;
  if (kind !== "upload" && kind !== "thumb") return null;
  if (rest.length < 3 || rest.length > 12) return null;
  if (!rest.every((segment) => WIKIMEDIA_SEGMENT.test(segment) && segment !== "..")) return null;
  const last = rest[rest.length - 1] ?? "";
  if (!WIKIMEDIA_EXT.test(last)) return null;
  return `https://${kind}.wikimedia.org/${rest.join("/")}`;
}

/**
 * Remplace une URL Wikimedia par son chemin first-party ; toute autre valeur (y compris `null`)
 * est rendue telle quelle.
 */
export function firstPartyImage<T extends string | null | undefined>(url: T): T | string {
  if (!url) return url;
  return wikimediaProxyPath(url) ?? url;
}
