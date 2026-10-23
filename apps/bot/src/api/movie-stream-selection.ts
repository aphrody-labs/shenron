// SPDX-License-Identifier: Apache-2.0
export type MovieStreamRow = {
  video_url?: string | null;
  stream_url?: string | null;
  players?: string | null;
};
export type MovieStreamPlayer = { provider?: string; embedUrl?: string; lang?: string };

/** Untagged stored streams cannot establish the audio of an explicit version. */
export function movieStreamCandidates(row: MovieStreamRow, language?: "vf" | "vostfr") {
  let players: MovieStreamPlayer[] = [];
  try {
    const parsed: unknown = JSON.parse(row.players ?? "[]");
    if (Array.isArray(parsed)) {
      players = parsed.filter(
        (player): player is MovieStreamPlayer =>
          player !== null &&
          typeof player === "object" &&
          typeof player.embedUrl === "string" &&
          (!language || player.lang === language),
      );
    }
  } catch {
    // Malformed legacy metadata has no playable candidates.
  }
  const stored = language ? null : row.video_url || row.stream_url || null;
  return { stored, players };
}
