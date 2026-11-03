// SPDX-License-Identifier: Apache-2.0
export interface WikiDraftSource {
  title: string;
  url: string;
  snippet: string;
  score: number | null;
  kind: string;
}

/** Sources are data: never turn an arbitrary retrieved scheme into an editor link. */
export function wikiSourceUrl(value: string): string | null {
  if (value.includes("\\") || Array.from(value).some((character) => character.charCodeAt(0) < 32)) {
    return null;
  }
  try {
    if (value.startsWith("/") && !value.startsWith("//")) {
      const url = new URL(value, "https://dragonballfr.com");
      return `${url.pathname}${url.search}${url.hash}`;
    }
    const url = new URL(value);
    if (
      ["fandom.com", "wikia.com"].some(
        (domain) => url.hostname === domain || url.hostname.endsWith(`.${domain}`),
      )
    ) {
      return null;
    }
    return ["https:", "http:"].includes(url.protocol) && !url.username && !url.password
      ? url.href
      : null;
  } catch {
    return null;
  }
}

function label(value: string): string {
  return value
    .replace(/[\\[\]<>]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function wikiDraftSourcesMarkdown(
  sources: readonly Pick<WikiDraftSource, "title" | "url">[],
) {
  const seen = new Set<string>();
  return sources
    .map((source) => {
      const url = wikiSourceUrl(source.url);
      if (!url || seen.has(url)) return "";
      seen.add(url);
      return `[${label(source.title) || url}](<${url.replace(/>/g, "%3E")}>)`;
    })
    .filter(Boolean)
    .join(" · ");
}

/** Extraction is an explicit fallback; it never pretends to be generated prose. */
export function buildWikiExtractDraft(sources: readonly WikiDraftSource[]): string {
  const seen = new Set<string>();
  const paragraphs: string[] = [];
  for (const source of sources) {
    const text = source.snippet.replace(/\s+/g, " ").trim();
    const key = text.toLowerCase();
    if (text.length > 20 && !seen.has(key)) {
      seen.add(key);
      paragraphs.push(text);
    }
  }
  if (paragraphs.length === 0) return "";
  const references = wikiDraftSourcesMarkdown(sources);
  return `${paragraphs.join("\n\n")}${references ? `\n\n${references}` : ""}`;
}
