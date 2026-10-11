// SPDX-License-Identifier: Apache-2.0
export type AdnVideo = {
  id: number;
  title: string;
  shortNumber: string | null;
  url: string;
  embeddedUrl: string | null;
  languages: string[] | null;
  available: boolean;
  duration: number | null;
};

export function adnLanguages(values: string[] | null | undefined): ("vf" | "vostfr")[] {
  const known = new Set((values ?? []).map((value) => value.toLowerCase()));
  return [
    ...(known.has("vf") ? ["vf" as const] : []),
    ...(known.has("vostf") || known.has("vostfr") ? ["vostfr" as const] : []),
  ];
}

export function videoNumber(value: string | null): number | null {
  if (value === null || !/^\d+$/.test(value.trim())) return null;
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0 ? number : null;
}

export function mergeAdnOffer<T extends { provider: string }>(
  current: unknown,
  offer: T | null,
): T[] {
  const other = Array.isArray(current)
    ? current.filter(
        (entry): entry is T => !!entry && typeof entry === "object" && entry.provider !== "adn",
      )
    : [];
  return offer ? [offer, ...other] : other;
}

export async function collectAdnVideos(
  show: number,
  read: (url: string) => Promise<unknown>,
  api: string,
): Promise<AdnVideo[]> {
  const videos: AdnVideo[] = [];
  const ids = new Set<number>();
  for (let offset = 0; offset < 2000; offset += 100) {
    const response = await read(`${api}/video/show/${show}?offset=${offset}&limit=100`);
    const page =
      response && typeof response === "object" && "videos" in response ? response.videos : null;
    if (!Array.isArray(page)) throw new Error(`ADN show ${show}: invalid catalogue response`);
    for (const value of page) {
      if (
        !value ||
        typeof value !== "object" ||
        !Number.isSafeInteger(value.id) ||
        ids.has(value.id) ||
        typeof value.available !== "boolean" ||
        typeof value.url !== "string" ||
        (value.shortNumber !== null && typeof value.shortNumber !== "string") ||
        (value.languages !== null &&
          (!Array.isArray(value.languages) ||
            value.languages.some((language: unknown) => typeof language !== "string")))
      )
        throw new Error(`ADN show ${show}: invalid or repeated video`);
      const destination = new URL(value.url);
      if (
        destination.protocol !== "https:" ||
        destination.username ||
        destination.password ||
        !/^(?:[^.]+\.)*animationdigitalnetwork\.(?:com|fr)$/.test(destination.hostname)
      )
        throw new Error(`ADN show ${show}: unexpected offer destination`);
      ids.add(value.id);
      videos.push(value as AdnVideo);
    }
    if (page.length < 100) return videos;
  }
  throw new Error(`ADN show ${show}: pagination budget reached; snapshot incomplete`);
}
