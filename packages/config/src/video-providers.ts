// SPDX-License-Identifier: Apache-2.0

/** Public provider page only. Playback capabilities and rights are resolved separately. */
export function officialCrunchyrollWatchURL(value: string | null | undefined): string | null {
  if (!value || !URL.canParse(value)) return null;
  const url = new URL(value);
  if (
    url.protocol !== "https:" ||
    (url.hostname !== "crunchyroll.com" && url.hostname !== "www.crunchyroll.com") ||
    url.port ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  ) {
    return null;
  }
  return /^\/(?:[a-z]{2}(?:-[a-z]{2})?\/)?watch\/[A-Za-z0-9]+(?:\/[A-Za-z0-9._~%-]+)?\/?$/i.test(
    url.pathname,
  )
    ? url.href
    : null;
}
