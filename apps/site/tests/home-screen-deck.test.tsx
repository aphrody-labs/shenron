import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { HomeSection } from "../src/components/home/HomeSection";
import { HomeScreenDeck } from "../src/components/home/HomeScreenDeck";

test("editorial content is visible without opening a disclosure", () => {
  const html = renderToStaticMarkup(
    <HomeSection id="sagas" title="Sagas" moreHref="/wiki/sagas" moreLabel="All sagas">
      <a href="/wiki/sagas/namek">Namek</a>
    </HomeSection>,
  );
  expect(html).toContain('aria-labelledby="accueil-sagas-titre"');
  expect(html).toContain('href="/wiki/sagas/namek"');
  expect(html).not.toContain("<details");
  expect(html).not.toContain("<summary");
});

test("the screen deck preserves content order and filters absent sections", () => {
  const html = renderToStaticMarkup(
    <HomeScreenDeck>
      <h1>Dragon Ball</h1>
      {null}
      {false}
      {[<article key="news">News</article>, <article key="games">Games</article>]}
    </HomeScreenDeck>,
  );
  expect(html.match(/data-screen=/g)).toHaveLength(3);
  expect(html.indexOf("News")).toBeLessThan(html.indexOf("Games"));
  expect(html).toContain('aria-label="Suivant"');
  expect(html).toContain('aria-label="Arrêter l’animation"');
  expect(html).toContain('href="/wiki/gifs"');
  expect(html).not.toContain("dbz-button");
});
