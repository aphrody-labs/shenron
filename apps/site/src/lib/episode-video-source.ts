// SPDX-License-Identifier: Apache-2.0
/** Clear MP4 origin selected by the owner for this catalogue. */
export function isShenronEpisodeVideoURL(url: URL): boolean {
  return (
    url.protocol === "https:" &&
    url.hostname === "cdn.dragonballfr.com" &&
    !url.port &&
    !url.username &&
    !url.password &&
    !url.search &&
    !url.hash &&
    url.pathname === "/media/episodes/beerus-01/optimized-720p.mp4"
  );
}

export function approvedEpisodeVideoURL(source: string | null): URL | null {
  if (!source || !URL.canParse(source)) return null;
  const url = new URL(source);
  return isShenronEpisodeVideoURL(url) ||
    (url.protocol === "https:" &&
      url.hostname === "27.mugiwara.one" &&
      !url.port &&
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash &&
      /^\/dbs\/dbs-[1-9]\d*\.mp4$/.test(url.pathname))
    ? url
    : null;
}

/** Keep this origin's missing CORS headers away from native video and subtitle requests. */
export function nativeEpisodeVideoSource(source: string): string {
  const approved = approvedEpisodeVideoURL(source);
  return approved && !isShenronEpisodeVideoURL(approved)
    ? `/api/media/video?${new URLSearchParams({ source: approved.href })}`
    : source;
}
