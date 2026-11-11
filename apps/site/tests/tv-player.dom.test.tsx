// SPDX-License-Identifier: Apache-2.0
import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { TvPlayer, type VideoSourceOption } from "../src/components/tv/TvPlayer";

const testSources: VideoSourceOption[] = [
  {
    id: "cdn-1080p",
    name: "1080p FHD",
    type: "direct",
    url: "https://dragonballfr.com/api/episodes/875/video",
  },
  {
    id: "embed-alt",
    name: "Lecteur 2",
    type: "iframe",
    url: "https://vidmoly.biz/embed-test.html",
  },
];

test("TvPlayer renders native video with accessible controls and ambient mode", () => {
  const html = renderToStaticMarkup(
    <TvPlayer
      title="Le dieu de la Destruction"
      seriesTitle="Dragon Ball Super: Beerus"
      episodeNumber={1}
      sources={testSources}
      poster="/images/poster.webp"
    />,
  );

  expect(html).toContain("<video");
  expect(html).toContain('src="https://dragonballfr.com/api/episodes/875/video"');
  expect(html).toContain('aria-label="Position de lecture"');
  expect(html).toContain('aria-label="Lecture (k)"');
  expect(html).toContain('aria-label="Mode ambiant"');
  expect(html).toContain("1080p FHD");
});

test("TvPlayer renders embed iframe when an iframe source is selected", () => {
  const iframeSources: VideoSourceOption[] = [
    {
      id: "embed-1",
      name: "Vidmoly",
      type: "iframe",
      url: "https://vidmoly.biz/embed-kshbhm2m121e.html",
    },
  ];

  const html = renderToStaticMarkup(
    <TvPlayer
      title="Le Grand Depart"
      seriesTitle="Dragon Ball"
      episodeNumber={1}
      sources={iframeSources}
    />,
  );

  expect(html).toContain("<iframe");
  expect(html).toContain('src="https://vidmoly.biz/embed-kshbhm2m121e.html"');
});
