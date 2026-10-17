import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import fr from "../messages/fr.json";
import en from "../messages/en.json";
import ja from "../messages/ja.json";
import { MangaChapter3D } from "../src/components/manga/MangaChapter3D";

const pages = [
  "https://cdn.dragonballfr.com/assets/manga/DBFC/ch516/001.jpg",
  "https://cdn.dragonballfr.com/assets/manga/DBFC/ch516/002.jpg",
];

test("the chapter page offers its first page as a named 3D scene, localised", () => {
  const html = renderToStaticMarkup(
    <NextIntlClientProvider locale="fr" messages={fr} timeZone="UTC">
      <MangaChapter3D pages={pages} />
    </NextIntlClientProvider>,
  );
  expect(html).toContain(fr.mangaScene3d.title);
  expect(html).toContain('<canvas role="img" aria-label="Planche 1 en relief"');
  expect(html).toContain("Planche 1 sur 2");
  expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Planche précédente/);
});

test("a chapter without pages renders nothing", () => {
  const html = renderToStaticMarkup(
    <NextIntlClientProvider locale="fr" messages={fr} timeZone="UTC">
      <MangaChapter3D pages={[]} />
    </NextIntlClientProvider>,
  );
  expect(html).toBe("");
});

test("the three dictionaries carry the same scene keys", () => {
  const keys = (m: { mangaScene3d: Record<string, string> }) =>
    Object.keys(m.mangaScene3d).toSorted();
  expect(keys(en)).toEqual(keys(fr));
  expect(keys(ja)).toEqual(keys(fr));
});
