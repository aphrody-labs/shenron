// SPDX-License-Identifier: Apache-2.0
export type PortalPublication = {
  id: string;
  title: string;
  href: string;
  date: number;
  image?: string;
};

/** Select genuine, illustrated releases against the server loader's single clock sample. */
export function recentPortalPublications(items: readonly PortalPublication[], now: number) {
  if (!Number.isFinite(now)) return [];
  return items
    .filter(
      (entry) =>
        Number.isFinite(entry.date) &&
        entry.date > 0 &&
        entry.date <= now &&
        entry.title.trim().length > 0 &&
        Boolean(entry.image?.trim()) &&
        entry.href.startsWith("/wiki/"),
    )
    .toSorted((a, b) => b.date - a.date || a.id.localeCompare(b.id))
    .slice(0, 3);
}
