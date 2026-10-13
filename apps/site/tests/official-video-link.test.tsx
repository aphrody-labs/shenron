// SPDX-License-Identifier: Apache-2.0
import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import fr from "../messages/fr.json";
import en from "../messages/en.json";
import ja from "../messages/ja.json";
import videoFr from "../messages/video-ui/fr.json";
import videoEn from "../messages/video-ui/en.json";
import videoJa from "../messages/video-ui/ja.json";
import { VideoLecteurs } from "../src/components/episodes/VideoLecteurs";

const messages = { fr, en, ja };
const videoMessages = { fr: videoFr, en: videoEn, ja: videoJa };
type Player = { name: string; provider: string; embedUrl: string };

function render(locale: "fr" | "en" | "ja", players: Player[]) {
  return renderToStaticMarkup(
    <NextIntlClientProvider locale={locale} messages={messages[locale]} timeZone="UTC">
      <VideoLecteurs players={players} entityType="episode" entityId={875} />
    </NextIntlClientProvider>,
  );
}

test("official Crunchyroll watch pages render a localized outbound link, never an iframe", () => {
  const official = "https://www.crunchyroll.com/fr/watch/GE00389313JAJP/the-god-who-destroys";
  for (const locale of ["fr", "en", "ja"] as const) {
    const html = render(locale, [{ name: "Episode", provider: "Crunchyroll", embedUrl: official }]);
    expect(html).toContain(`href="${official}"`);
    expect(html).toContain("noopener noreferrer");
    expect(html).toContain(videoMessages[locale].officialProviderNote);
    expect(html).not.toContain("<iframe");
  }
});

test("an actual external embed keeps the existing iframe path", () => {
  const html = render("fr", [
    {
      name: "Lecteur",
      provider: "video",
      embedUrl: "https://player.example/embed/1",
    },
  ]);
  expect(html).toContain("<iframe");
  expect(html).not.toContain(videoFr.officialProviderNote);
});

test("official links drop stored query tokens and never embed them", () => {
  const html = render("fr", [
    {
      name: "Episode",
      provider: "Crunchyroll",
      embedUrl: "https://www.crunchyroll.com/watch/GE00389313JAJP?token=private#chapter",
    },
  ]);
  expect(html).toContain('href="https://www.crunchyroll.com/watch/GE00389313JAJP"');
  expect(html).not.toContain("token=private");
  expect(html).not.toContain("<iframe");
});

test("unqualified Crunchyroll destinations never become embeds or outbound links", () => {
  for (const embedUrl of [
    "http://www.crunchyroll.com/watch/GE00389313JAJP",
    "https://www.crunchyroll.com:8443/watch/GE00389313JAJP",
    "https://www.crunchyroll.com/series/G123",
    "https://player.crunchyroll.com/embed/G123",
    "https://user:secret@www.crunchyroll.com/watch/G123",
  ]) {
    const html = render("fr", [{ name: "Episode", provider: "Crunchyroll", embedUrl }]);
    expect(html).not.toContain("<iframe");
    expect(html).not.toContain("href=");
  }
});
