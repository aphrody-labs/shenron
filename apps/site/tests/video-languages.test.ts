import { describe, expect, test } from "bun:test";
import type { Availability } from "../src/db/bot-schema";
import { normalizeAvailability } from "../src/lib/video-languages";

const offer: Availability = {
  provider: "crunchyroll",
  label: "Crunchyroll",
  url: "https://www.crunchyroll.com/watch/GX9UQH/episode-1",
  embedUrl: "https://player.crunchyroll.com/embed/unsafe",
  langs: ["vostfr"],
  available: true,
  checkedAt: 1_800_000_000,
};

describe("Crunchyroll availability", () => {
  test("keeps a qualified official page without promoting a player embed", () => {
    expect(normalizeAvailability([offer])).toEqual([{ ...offer, embedUrl: null }]);
  });

  test("a later withdrawal or private URL removes the older offer", () => {
    expect(
      normalizeAvailability([
        offer,
        { ...offer, available: false, checkedAt: offer.checkedAt + 1 },
      ]),
    ).toBeNull();
    expect(
      normalizeAvailability([
        offer,
        { ...offer, url: `${offer.url}?token=private`, checkedAt: offer.checkedAt + 1 },
      ]),
    ).toBeNull();
  });
});
