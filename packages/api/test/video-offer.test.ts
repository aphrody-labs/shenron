import { describe, expect, test } from "bun:test";
import { latestOfficialCrunchyrollWatchOffer } from "../src/contract/video";

const available = {
  provider: "crunchyroll",
  available: true,
  url: "https://www.crunchyroll.com/watch/GX9UQH/episode-1",
  checkedAt: 1_800_000_000,
  langs: ["vostfr"],
};

describe("latestOfficialCrunchyrollWatchOffer", () => {
  test("returns the latest official page and observed languages", () => {
    expect(latestOfficialCrunchyrollWatchOffer([available])).toEqual({
      url: available.url,
      checkedAt: available.checkedAt,
      languages: ["vostfr"],
    });
  });

  test("a later withdrawal or unsafe URL suppresses older offers", () => {
    expect(
      latestOfficialCrunchyrollWatchOffer([
        available,
        { ...available, available: false, checkedAt: available.checkedAt + 1 },
      ]),
    ).toBeNull();
    expect(
      latestOfficialCrunchyrollWatchOffer([
        available,
        { ...available, url: `${available.url}?token=private`, checkedAt: available.checkedAt + 1 },
      ]),
    ).toBeNull();
  });

  test("ignores other providers and unverified observations", () => {
    expect(latestOfficialCrunchyrollWatchOffer([{ ...available, provider: "adn" }])).toBeNull();
    expect(latestOfficialCrunchyrollWatchOffer([{ ...available, checkedAt: 0 }])).toBeNull();
  });
});
