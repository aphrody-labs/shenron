import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import fr from "../messages/fr.json";
import en from "../messages/en.json";
import ja from "../messages/ja.json";
import { GifLibrary } from "../src/components/gifs/GifLibrary";
import {
  GIF_ASSET_BASE,
  GIF_SOURCE_SHA256,
  gifPage,
  gifQuery,
  parseGifIndex,
} from "../src/lib/gif-catalog-contract";

test("GIF library starts with static dimensioned previews and localized explicit animation controls", () => {
  const index = parseGifIndex({
    schema: "shenron-public-gifs/v1",
    revision: "a".repeat(64),
    episodeId: 875,
    sourceSha256: GIF_SOURCE_SHA256,
    qualified: true,
    items: [
      {
        id: "sample",
        gifUrl: `${GIF_ASSET_BASE}gifs/sample.gif`,
        posterUrl: `${GIF_ASSET_BASE}storyboard/frame-0360.webp`,
        width: 640,
        height: 360,
        bytes: 1000,
        sha256: "b".repeat(64),
        posterSha256: "c".repeat(64),
        startSeconds: 360,
        durationSeconds: 5.08,
      },
    ],
  });
  for (const locale of ["fr", "en", "ja"] as const) {
    const html = renderToStaticMarkup(
      <NextIntlClientProvider locale={locale} messages={{ fr, en, ja }[locale]} timeZone="UTC">
        <GifLibrary data={gifPage(index, gifQuery({}))} />
      </NextIntlClientProvider>,
    );
    expect(html).toContain({ fr, en, ja }[locale].gifLibrary.animate);
    expect(html).toContain('aria-pressed="false"');
    expect(html).toContain('width="640" height="360"');
    expect(html).toContain('href="/api/gifs/875-sample/download?revision=');
    expect(html).toContain('href="/wiki/episodes/875"');
    expect(html).not.toContain('src="' + index.items[0]!.gifUrl + '"');
    expect(html).not.toContain("Beerus");
  }
});

test("unpublished media and catalogue failures show distinct honest states", () => {
  const data = gifPage(null, gifQuery({}));
  const render = (error: boolean) =>
    renderToStaticMarkup(
      <NextIntlClientProvider locale="fr" messages={fr} timeZone="UTC">
        <GifLibrary data={data} error={error} />
      </NextIntlClientProvider>,
    );
  expect(render(false)).toContain(fr.gifLibrary.empty);
  expect(render(true)).toContain(fr.gifLibrary.unavailable);
  expect(render(false)).not.toContain("<img");
});
