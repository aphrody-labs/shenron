// SPDX-License-Identifier: Apache-2.0
/** Observed media metadata; decoding and transport remain owned by Bun and the host. */
export const VIDEO_LANGUAGE_ORDER = ["vf", "vostfr", "vost"] as const;
export type VideoLanguage = (typeof VIDEO_LANGUAGE_ORDER)[number];
export interface VideoEmbed {
  name: string;
  provider: string;
  embedUrl: string;
  lang?: VideoLanguage;
}
export interface VideoSubtitle {
  lang: string;
  label: string;
  src: string;
}

export function normalizeVideoLanguage(value: unknown): VideoLanguage | null {
  return VIDEO_LANGUAGE_ORDER.find((language) => value === language) ?? null;
}

/** Unknown metadata cannot establish an audio or subtitle version. */
export function videoLanguages(players: unknown): VideoLanguage[] {
  if (!Array.isArray(players)) return [];
  const present = new Set(players.map((player) => normalizeVideoLanguage(player?.lang)));
  return VIDEO_LANGUAGE_ORDER.filter((language) => present.has(language));
}

export function resolveVideoSelection(
  players: { lang?: unknown }[],
  selected: string,
): VideoLanguage | "ext" {
  const versions = videoLanguages(players);
  const hasUnknown = players.some((player) => normalizeVideoLanguage(player.lang) === null);
  if (selected === "ext" && hasUnknown) return "ext";
  const version = normalizeVideoLanguage(selected);
  return version && versions.includes(version) ? version : (versions[0] ?? "ext");
}

export function playersForVideoLanguage<T extends { lang?: unknown }>(
  players: T[],
  version: VideoLanguage | null,
): T[] {
  return players.filter((player) => normalizeVideoLanguage(player.lang) === version);
}

function publicMediaUrl(value: unknown): string | null {
  if (typeof value !== "string" || !URL.canParse(value.trim())) return null;
  const url = new URL(value.trim());
  if (!["https:", "http:"].includes(url.protocol) || url.username || url.password) return null;
  return url.href;
}

/** Preserve source order and explicit versions; remove malformed and duplicate embeds. */
export function normalizeVideoPlayers(raw: unknown): VideoEmbed[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const players: VideoEmbed[] = [];
  for (const value of raw) {
    if (!value || typeof value !== "object") continue;
    const embedUrl = publicMediaUrl(value.embedUrl);
    if (!embedUrl || typeof value.name !== "string" || typeof value.provider !== "string") continue;
    const name = value.name.trim();
    const provider = value.provider.trim();
    if (!name || !provider) continue;
    const lang = normalizeVideoLanguage(value.lang);
    const key = `${lang ?? "unknown"}:${embedUrl}`;
    if (seen.has(key)) continue;
    seen.add(key);
    players.push({ name, provider, embedUrl, ...(lang ? { lang } : {}) });
  }
  return players;
}

/** External tracks do not establish the language of the video itself. */
export function normalizeVideoSubtitles(raw: unknown): VideoSubtitle[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const subtitles: VideoSubtitle[] = [];
  for (const value of raw) {
    if (!value || typeof value !== "object" || typeof value.src !== "string") continue;
    if (typeof value.lang !== "string" || !/^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/.test(value.lang))
      continue;
    if (typeof value.label !== "string" || !value.label.trim()) continue;
    const src =
      publicMediaUrl(value.src) ??
      (/^(?:\.\/|\/)?assets\/subtitles\/[^?#\\]+\.(?:vtt|srt)$/i.test(value.src.trim()) &&
      !value.src.split("/").includes("..")
        ? value.src.trim()
        : null);
    if (!src) continue;
    const key = `${value.lang}:${src}`;
    if (seen.has(key)) continue;
    seen.add(key);
    subtitles.push({ lang: value.lang, label: value.label.trim(), src });
  }
  return subtitles;
}

export function episodePlaybackMetadata(input: { players?: unknown; subtitles?: unknown }) {
  const players = normalizeVideoPlayers(input.players);
  const subtitles = normalizeVideoSubtitles(input.subtitles);
  const versions = videoLanguages(players);
  return {
    players,
    subtitles,
    versions,
    playerCount: players.length,
    hasVf: versions.includes("vf"),
    hasVostfr: versions.includes("vostfr"),
    hasVost: versions.includes("vost"),
  };
}
