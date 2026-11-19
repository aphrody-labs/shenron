// SPDX-License-Identifier: Apache-2.0
import { describe, expect, test } from "bun:test";
import { SITE_URL } from "../src/lib/config";
import { seriesJsonLd } from "../src/lib/series-jsonld";

const base = { code: "DBZ", label: "Dragon Ball Z", total: 291, siteUrl: SITE_URL };

describe("seriesJsonLd", () => {
  test("passes the real total and series identity through", () => {
    const node = seriesJsonLd({ ...base, years: "1989-1996" });
    expect(node["@type"]).toBe("TVSeries");
    expect(node.name).toBe("Dragon Ball Z");
    expect(node.numberOfEpisodes).toBe(291);
    expect(node.inLanguage).toBe("fr");
  });

  test("a YYYY-YYYY range gives startDate and endDate", () => {
    const node = seriesJsonLd({ ...base, years: "1989-1996" });
    expect(node.startDate).toBe("1989");
    expect(node.endDate).toBe("1996");
  });

  test("a single year gives startDate only", () => {
    const node = seriesJsonLd({ ...base, code: "DBS_BEERUS", years: "2026" });
    expect(node.startDate).toBe("2026");
    expect("endDate" in node).toBe(false);
  });

  test("missing or malformed years omit both dates", () => {
    for (const years of [undefined, "", "89-96", "1989-"]) {
      const node = seriesJsonLd({ ...base, code: "SDBH", years });
      expect("startDate" in node).toBe(false);
      expect("endDate" in node).toBe(false);
    }
  });

  test("urls are absolute under the site url", () => {
    const node = seriesJsonLd({
      ...base,
      siteUrl: `${SITE_URL}/`,
      firstEpisodeId: 12,
      firstEpisodeNumber: 3,
      image: "/banners/dbz.jpg",
    });
    expect(node.url).toBe(`${SITE_URL}/wiki/episodes/series/DBZ`);
    expect(node.image).toBe(`${SITE_URL}/banners/dbz.jpg`);
    expect(node.episode).toEqual({
      "@type": "TVEpisode",
      episodeNumber: "3",
      url: `${SITE_URL}/wiki/episodes/12`,
    });
  });

  test("the episode number comes from the row and is omitted when unknown", () => {
    for (const firstEpisodeNumber of [null, undefined, 0]) {
      const node = seriesJsonLd({ ...base, firstEpisodeId: 12, firstEpisodeNumber });
      expect(node.episode).toEqual({
        "@type": "TVEpisode",
        url: `${SITE_URL}/wiki/episodes/12`,
      });
    }
  });

  test("an absolute backdrop is kept as is and no image or episode is invented", () => {
    const withCdn = seriesJsonLd({ ...base, image: "https://cdn.dragonballfr.com/a.jpg" });
    expect(withCdn.image).toBe("https://cdn.dragonballfr.com/a.jpg");
    const bare = seriesJsonLd(base);
    expect("image" in bare).toBe(false);
    expect("episode" in bare).toBe(false);
  });
});
