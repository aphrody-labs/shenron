// SPDX-License-Identifier: Apache-2.0
type Reading = { title: string | null; chapter_number: number };

export function readingLabel(reading: Reading): string {
  const title = reading.title?.trim();
  return title && /^(?:tome|volume)\s*\d+$/i.test(title)
    ? title
    : `Chapitre ${reading.chapter_number}`;
}

export function readingTitle(reading: Reading): string {
  const title = reading.title?.trim();
  const label = readingLabel(reading);
  return !title || /^(?:chapitre|chapter|tome|volume)\s*\d+$/i.test(title)
    ? label
    : `${label} — ${title}`;
}
