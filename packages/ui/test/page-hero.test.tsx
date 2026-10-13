import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { PageHero } from "../src/layout/PageHero";

test("image heroes have compact minimum heights and retain long content without fixed-height clipping", () => {
  const lead = "A complete verified synopsis. ".repeat(30);
  const html = renderToStaticMarkup(
    <PageHero eyebrow="Series" title="A long catalogue title" lead={lead} image="/cover.webp" />,
  );
  expect(html).toContain("min-h-[180px] md:min-h-[220px]");
  expect(html).toContain(lead);
  expect(html).toContain("A long catalogue title");
  expect(html.match(/<section class="([^"]*)"/)?.[1]).not.toMatch(/(?:^|\s)h-\[/);
  expect(html).not.toContain("line-clamp");
  expect(html).toContain("1.625rem");
});

test("large image and plain variants preserve actions and compact spacing", () => {
  const html = renderToStaticMarkup(
    <PageHero
      eyebrow="Library"
      title="Reference"
      height="lg"
      image="/cover.webp"
      right={<a href="/read">Read</a>}
    />,
  );
  expect(html).toContain("min-h-[200px] md:min-h-[240px]");
  expect(html).toContain('href="/read"');
  const plain = renderToStaticMarkup(<PageHero eyebrow="Library" title="Reference" />);
  expect(plain).toContain("py-5 md:py-6");
  expect(plain).not.toContain("<img");
});
