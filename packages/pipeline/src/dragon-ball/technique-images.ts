// SPDX-License-Identifier: Apache-2.0
/** Editorial matching over native image/OCR receipts; this does not parse HTML or approve artwork. */
export type TechniqueImageIdentity = {
  id: number;
  slug: string;
  name: string;
  aliases?: readonly string[];
  visible?: boolean;
};
export type TechniqueImageDocument = {
  sourceUrl: string;
  medium: "manga" | "anime";
  locator: string;
  text: string;
  images: readonly { url: string; caption?: string; width?: number; height?: number }[];
};
export type TechniqueImageCandidate = {
  techniqueId: number;
  slug: string;
  image: string;
  sourceUrl: string;
  medium: "manga" | "anime";
  locator: string;
  matchedAlias: string;
  matchIn: "caption" | "ocr";
  status: "candidate-needs-visual-review";
};
type Folded = { value: string; offsets: number[]; source: string };
const word = /[\p{L}\p{N}]/u;
const cjk = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u;

function fold(value: string): Folded {
  value = value.normalize("NFKC");
  let normalized = "";
  const offsets: number[] = [];
  for (let index = 0; index < value.length; index++) {
    const original = value[index]!.normalize("NFKC");
    const characters = /\p{Script=Latin}/u.test(original)
      ? original.normalize("NFD").replace(/\p{M}/gu, "")
      : original;
    for (const char of characters.toLowerCase()) {
      if (!word.test(char)) continue;
      normalized += char;
      offsets.push(index);
    }
  }
  return { value: normalized, offsets, source: value };
}

/** Never infer image URLs, drop query parameters, or accept game/portrait assets as attack evidence. */
export function eligibleTechniqueImageUrl(value: string, sourceUrl?: string): string | null {
  try {
    const url = new URL(value, sourceUrl);
    let decoded = url.href;
    for (let count = 0; count < 3; count++) {
      try {
        decoded = decodeURIComponent(decoded);
      } catch {
        break;
      }
    }
    if (url.protocol !== "https:" || url.username || url.password || url.port) return null;
    if (/(?:^|[/.])(?:fandom|wikia)\.(?:com|net)(?:[/:?#]|$)/i.test(decoded)) return null;
    if (
      /(?:xenoverse|xv2|portrait|avatar|character[s]?\/|logo|favicon|sprite|icon(?:s)?\/)/i.test(
        decoded,
      )
    )
      return null;
    if (
      [...url.searchParams.keys()].some((key) =>
        /token|auth|sign(?:ature|ed)?|secret|credential|key/i.test(key),
      )
    )
      return null;
    return url.href;
  } catch {
    return null;
  }
}

type Alias = { technique: TechniqueImageIdentity; alias: string; folded: string };
function findMentions(text: string, aliases: readonly Alias[]) {
  const folded = fold(text);
  if (!folded.value) return [];
  const matches: { entry: Alias; start: number; end: number }[] = [];
  for (const entry of aliases) {
    let from = 0;
    while (from < folded.value.length) {
      const start = folded.value.indexOf(entry.folded, from);
      if (start < 0) break;
      const end = start + entry.folded.length;
      from = end;
      const sourceStart = folded.offsets[start]!;
      const sourceEnd = folded.offsets[end - 1]! + 1;
      const first = folded.source[sourceStart]!;
      const last = folded.source[sourceEnd - 1]!;
      if (!cjk.test(first) && sourceStart > 0 && word.test(folded.source[sourceStart - 1]!))
        continue;
      if (
        !cjk.test(last) &&
        sourceEnd < folded.source.length &&
        word.test(folded.source[sourceEnd]!)
      )
        continue;
      matches.push({ entry, start, end });
    }
  }
  // A long named variant excludes its nested base attack, but a separate base mention survives.
  return matches.filter(
    (match) =>
      !matches.some(
        (other) =>
          other.entry.technique.id !== match.entry.technique.id &&
          other.start <= match.start &&
          other.end >= match.end &&
          other.end - other.start > match.end - match.start,
      ),
  );
}

export function discoverTechniqueImages(
  techniques: readonly TechniqueImageIdentity[],
  documents: Iterable<TechniqueImageDocument>,
) {
  const active = techniques.filter((technique) => technique.visible !== false);
  if (new Set(active.map((technique) => technique.id)).size !== active.length)
    throw new Error("Duplicate technique identity");
  const aliases: Alias[] = active.flatMap((technique) =>
    [...new Set([technique.name, ...(technique.aliases ?? [])])]
      .map((alias) => ({ technique, alias, folded: fold(alias).value }))
      .filter((alias) => alias.folded.length >= 3),
  );
  const aliasOwners = new Map<string, Set<number>>();
  for (const entry of aliases) {
    if (!aliasOwners.has(entry.folded)) aliasOwners.set(entry.folded, new Set());
    aliasOwners.get(entry.folded)!.add(entry.technique.id);
  }
  const unambiguous = aliases.filter((entry) => aliasOwners.get(entry.folded)!.size === 1);
  const candidates: TechniqueImageCandidate[] = [];
  const seen = new Set<string>();
  let documentCount = 0;
  let rejectedImages = 0;
  for (const document of documents) {
    documentCount++;
    const sourceUrl = eligibleTechniqueImageUrl(document.sourceUrl);
    if (!sourceUrl || !document.locator.trim()) {
      rejectedImages += document.images.length;
      continue;
    }
    const mentions = findMentions(document.text, unambiguous);
    for (const image of document.images) {
      const url = eligibleTechniqueImageUrl(image.url, sourceUrl);
      if (
        !url ||
        (image.width !== undefined && image.width < 64) ||
        (image.height !== undefined && image.height < 64)
      ) {
        rejectedImages++;
        continue;
      }
      const captionMentions = findMentions(image.caption ?? "", unambiguous);
      for (const mention of captionMentions.length ? captionMentions : mentions) {
        const technique = mention.entry.technique;
        const key = JSON.stringify([technique.id, url, sourceUrl, document.locator]);
        if (seen.has(key)) continue;
        seen.add(key);
        candidates.push({
          techniqueId: technique.id,
          slug: technique.slug,
          image: url,
          sourceUrl,
          medium: document.medium,
          locator: document.locator,
          matchedAlias: mention.entry.alias,
          matchIn: captionMentions.length ? "caption" : "ocr",
          status: "candidate-needs-visual-review",
        });
      }
    }
  }
  const coverage = active.map((technique) => {
    const found = candidates.filter((candidate) => candidate.techniqueId === technique.id);
    const ambiguousAliases = aliases
      .filter(
        (entry) => entry.technique.id === technique.id && aliasOwners.get(entry.folded)!.size > 1,
      )
      .map((entry) => entry.alias);
    return {
      id: technique.id,
      slug: technique.slug,
      name: technique.name,
      candidates: found.length,
      verifiedImages: 0,
      status: found.length ? "visual-review-required" : "no-image-evidence-found",
      ambiguousAliases: [...new Set(ambiguousAliases)],
    };
  });
  return {
    schema: "shenron-technique-image-discovery/v1",
    documentCount,
    rejectedImages,
    candidates,
    coverage,
    verifiedImages: 0,
  };
}

/** Adapt an already parsed native MediaWiki dossier; retain original media URLs and captions. */
export function techniqueDocumentsFromNativeWiki(
  value: {
    url: string;
    titre: string;
    revid?: number | null;
    images: readonly unknown[];
  },
  medium: "manga" | "anime",
): TechniqueImageDocument[] {
  return value.images.flatMap((raw, index) => {
    if (!raw || typeof raw !== "object") return [];
    const image = raw as Record<string, unknown>;
    const url = [image.original_url, image.url, image.src, image.original].find(
      (item) => typeof item === "string",
    );
    if (typeof url !== "string") return [];
    const caption = [image.caption, image.legende, image.alt, image.title]
      .filter((item) => typeof item === "string")
      .join(" · ");
    return [
      {
        sourceUrl: value.url,
        medium,
        locator: `revision:${value.revid ?? "unknown"};image:${index + 1}`,
        text: "",
        images: [
          {
            url,
            caption,
            ...(typeof image.width === "number" ? { width: image.width } : {}),
            ...(typeof image.height === "number" ? { height: image.height } : {}),
          },
        ],
      },
    ];
  });
}
