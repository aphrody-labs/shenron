// SPDX-License-Identifier: Apache-2.0
import type { Game } from "@/lib/db-universe";

export type PlatformGroup =
  | "all"
  | "playstation"
  | "nintendo"
  | "xbox"
  | "pc"
  | "mobile"
  | "arcade";
export type SortOption = "rating-desc" | "date-desc" | "date-asc" | "title-asc";
type RatingData = { average: number; count: number };

function normalizeSearch(text: string): string {
  return text.normalize("NFKD").replace(/\p{M}/gu, "").toLocaleLowerCase();
}

export function matchPlatform(platforms: string | null | undefined, group: PlatformGroup): boolean {
  if (group === "all") return true;
  if (!platforms) return false;
  const text = normalizeSearch(platforms);
  switch (group) {
    case "playstation":
      return /\b(?:play\s?station(?:\s?[1-5])?|ps\s?[1-5]|ps\s?one|psx|psp|ps\s?vita|vita)\b/u.test(
        text,
      );
    case "nintendo":
      return /\b(?:nintendo(?:\s?64)?|switch(?:\s?2)?|wii(?:\s?u)?|game\s?cube|n64|snes|nes|super\s?famicom|famicom|sfc|fc|nintendo\s?ds|ds|2ds|3ds|gba|gbc|gb|game\s?boy(?:\s?(?:advance|color))?|virtual\s?boy)\b/u.test(
        text,
      );
    case "xbox":
      return /\b(?:xbox|xsx|xss|xbo|x360|xb1)\b/u.test(text);
    case "pc":
      // NEC's PC Engine is a console, unrelated to the Windows/Steam group.
      return /\b(?:pc|windows|steam)\b/u.test(text.replace(/\bpc\s?engine\b/gu, ""));
    case "mobile":
      return /\b(?:ios|android|mobile|iphone|ipad)\b/u.test(text);
    case "arcade":
      return /\barcade\b/u.test(text);
  }
}

export function cleanExcerpt(text: string | null | undefined, max = 170): string {
  if (!text) return "";
  const clean = text
    .replace(/_?\(Sources?\s*:[^)]*\)_?/gi, "")
    .replace(/[*_#>`]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return clean.length > max ? `${clean.slice(0, max).trimEnd()}…` : clean;
}

export function selectGames(
  games: readonly Game[],
  ratings: Readonly<Record<string, RatingData>>,
  options: { query: string; platform: PlatformGroup; sort: SortOption; locale: string },
): Game[] {
  const query = normalizeSearch(options.query.trim());
  const collator = new Intl.Collator(options.locale, { sensitivity: "base", numeric: true });
  const compareTitle = (a: Game, b: Game) => collator.compare(a.title, b.title) || a.id - b.id;
  const compareDate = (a: Game, b: Game, direction: "asc" | "desc") => {
    const aDate = a.release_date;
    const bDate = b.release_date;
    const aKnown = aDate !== null && Number.isFinite(aDate);
    const bKnown = bDate !== null && Number.isFinite(bDate);
    if (!aKnown || !bKnown) return aKnown === bKnown ? 0 : aKnown ? -1 : 1;
    return direction === "asc" ? aDate - bDate : bDate - aDate;
  };
  return games
    .filter((game) => {
      if (!matchPlatform(game.platforms, options.platform)) return false;
      if (!query) return true;
      return [
        game.title,
        game.title_ja,
        game.developer,
        game.publisher,
        game.description,
        game.platforms,
      ].some((value) => value && normalizeSearch(value).includes(query));
    })
    .toSorted((a, b) => {
      if (options.sort === "title-asc") return compareTitle(a, b);
      if (options.sort === "rating-desc") {
        const aRating = ratings[String(a.id)];
        const bRating = ratings[String(b.id)];
        const aCount = aRating?.count ?? 0;
        const bCount = bRating?.count ?? 0;
        const aAverage = aCount > 0 ? aRating!.average : 0;
        const bAverage = bCount > 0 ? bRating!.average : 0;
        return (
          bAverage - aAverage || bCount - aCount || compareDate(a, b, "desc") || compareTitle(a, b)
        );
      }
      return compareDate(a, b, options.sort === "date-asc" ? "asc" : "desc") || compareTitle(a, b);
    });
}
