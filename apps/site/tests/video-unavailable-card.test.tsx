import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import { VideoUnavailableCard } from "../src/components/episodes/VideoUnavailableCard";
import fr from "../messages/video-ui/fr.json";
import en from "../messages/video-ui/en.json";
import ja from "../messages/video-ui/ja.json";

function render(locale: string, poster?: string) {
  return renderToStaticMarkup(
    <NextIntlClientProvider locale={locale} messages={{}} timeZone="UTC">
      <VideoUnavailableCard title="Episode" kind="episode" poster={poster} />
    </NextIntlClientProvider>,
  );
}

test("an unavailable episode preserves its illustration alongside the explicit state", () => {
  const poster = "https://cdn.dragonballfr.com/assets/ext/db_episodes/1.jpg";
  for (const [locale, messages] of Object.entries({ fr, en, ja })) {
    const html = render(locale, poster);
    expect(html).toContain(`src="${poster}"`);
    expect(html).toContain('alt=""');
    expect(html).toContain('href="/wiki/contribute?type=episode"');
    expect(html).toContain(messages.unavailableHeading);
    expect(html).toContain(messages.unavailableNote);
    expect(html).not.toContain("<video");
    expect(html).not.toContain("<button");
    expect(html).not.toContain("<iframe");
  }
});

test("an unavailable item without artwork still has its state and contribution link", () => {
  const html = render("fr");
  expect(html).not.toContain("<img");
  expect(html).toContain("Episode");
  expect(html).toContain('href="/wiki/contribute?type=episode"');
});
