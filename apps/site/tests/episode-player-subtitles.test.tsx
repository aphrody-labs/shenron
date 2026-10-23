// SPDX-License-Identifier: Apache-2.0
import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import fr from "../messages/fr.json";
import { VideoLecteurs } from "../src/components/episodes/VideoLecteurs";

test("native catalogue players receive every editorial subtitle variant", () => {
  const source = `https://cdn.dragonballfr.com/media/episodes/876/${"a".repeat(64)}/source.mp4`;
  const html = renderToStaticMarkup(
    <NextIntlClientProvider locale="fr" messages={fr} timeZone="UTC">
      <VideoLecteurs
        entityType="episode"
        entityId={876}
        title="Episode title"
        players={[{ name: "Shenron", provider: "shenron", embedUrl: source, lang: "vostfr" }]}
        subtitles={[
          {
            lang: "ja",
            label: "Japanese · Netflix",
            src: "./assets/subtitles/db_episodes/876/ja.srt",
          },
          {
            lang: "ja",
            label: "Japanese · Retimed",
            src: "https://cdn.dragonballfr.com/assets/subtitles/db_episodes/876/retimed/ja.vtt",
          },
        ]}
      />
    </NextIntlClientProvider>,
  );
  expect(html).toContain("<video");
  expect(html).not.toContain("<iframe");
  expect(html).toContain('aria-label="Episode title"');
  expect(html).toContain('crossorigin="anonymous"');
  expect(html.match(/<track /g)).toHaveLength(2);
  expect(html).toContain("Japanese · Netflix");
  expect(html).toContain("Japanese · Retimed");
  expect(html).toContain("/api/subtitles?src=assets%2Fsubtitles%2Fdb_episodes%2F876%2Fja.srt");
});
