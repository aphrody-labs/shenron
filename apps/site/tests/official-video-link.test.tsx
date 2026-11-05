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

test("an external embed renders a click-to-load facade, no iframe and no host before the click", () => {
  const html = render("fr", [
    {
      name: "Lecteur",
      provider: "video",
      embedUrl: "https://player.example/embed/1",
    },
  ]);
  expect(html).not.toContain("<iframe");
  expect(html).not.toContain("player.example");
  expect(html).toContain("Charger le lecteur 1");
  expect(html).not.toContain(videoFr.officialProviderNote);
});

test("a published Shenron MP4 renders native video and preserves alternate sources", () => {
  const source = `https://cdn.dragonballfr.com/media/episodes/876/${"a".repeat(64)}/source.mp4`;
  const html = render("fr", [
    { name: "Shenron", provider: "shenron", embedUrl: source },
    { name: "Alternate", provider: "vidmoly", embedUrl: "https://vidmoly.example/embed/1" },
  ]);
  expect(html).toContain("<video");
  expect(html).toContain(source);
  expect(html).not.toContain("<iframe");
  expect(html).toContain("Alternate");
  expect(html).not.toContain("Vérification du lecteur");
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

test("tracking variants of the same watch page create one selector", () => {
  const html = render("fr", [
    {
      name: "Episode",
      provider: "Crunchyroll",
      embedUrl: "https://www.crunchyroll.com/watch/G123?ref=a",
    },
    {
      name: "Episode",
      provider: "Crunchyroll",
      embedUrl: "https://www.crunchyroll.com/watch/G123?ref=b",
    },
  ]);
  expect(html.match(/href="https:\/\/www\.crunchyroll\.com\/watch\/G123"/g)).toHaveLength(1);
  expect(html).not.toContain("ref=a");
  expect(html).not.toContain("ref=b");
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

test("external embeds are sandboxed without popups or top navigation and keep an accessible name", () => {
  const html = render("fr", [
    { name: "VF · Lecteur", provider: "vidmoly", embedUrl: "https://vidmoly.example/embed/1" },
  ]);
  const sandbox = /sandbox="([^"]*)"/.exec(html)?.[1] ?? "";
  expect(sandbox.split(" ")).toEqual(
    expect.arrayContaining(["allow-scripts", "allow-same-origin", "allow-presentation"]),
  );
  expect(sandbox).not.toContain("allow-popups");
  expect(sandbox).not.toContain("allow-top-navigation");
  expect(html).toMatch(/<iframe[^>]*title="[^"]+"/);
  expect(html).toContain('aria-live="polite"');
});

test("plain http embeds never reach an iframe on the https site", () => {
  const html = render("fr", [
    { name: "Lecteur", provider: "video", embedUrl: "http://player.example/embed/1" },
  ]);
  expect(html).not.toContain("<iframe");
});

test("the language and player selectors are pressed-state button groups", () => {
  const html = render("fr", [
    { name: "VF 1", provider: "vidmoly", embedUrl: "https://a.example/1", lang: "vf" } as Player,
    {
      name: "VOSTFR 1",
      provider: "vidmoly",
      embedUrl: "https://a.example/2",
      lang: "vostfr",
    } as Player,
  ]);
  expect((html.match(/role="group"/g) ?? []).length).toBeGreaterThanOrEqual(2);
  expect(html).toContain('aria-pressed="true"');
  expect(html).toContain('aria-pressed="false"');
});
