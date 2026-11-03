// SPDX-License-Identifier: Apache-2.0
import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { WikiMeasuredArtwork } from "../src/components/wiki/WikiMeasuredArtwork";
import { WikiEditorialHero } from "../src/components/wiki/WikiEditorialHero";

test("measured decoration leaves the label as the accessible content and reserves its layout", () => {
  const html = renderToStaticMarkup(
    <p>
      <WikiMeasuredArtwork subject="senzu" />
      Community
    </p>,
  );
  expect(html).toContain("senzu-icon.svg");
  expect(html).toContain('width="32" height="32"');
  expect(html).toContain('alt="" aria-hidden="true"');
  expect(html).toContain('data-measured-illustration="decorative"');
  expect(html).toContain("Community</p>");
  expect(html).not.toContain('role="img"');
});

test("hero uses measured theme decoration while preserving the catalogue image and heading", () => {
  const html = renderToStaticMarkup(
    <WikiEditorialHero
      category="items"
      eyebrow="Items"
      title="Objects"
      image="/catalogue-source.svg"
      imageAlt="Catalogue source"
    />,
  );
  expect(html).toContain("senzu-icon.svg");
  expect(html).toContain('data-wiki-topic="capsule"');
  expect(html).toContain('src="/catalogue-source.svg"');
  expect(html).toContain('alt="Catalogue source"');
  expect(html.match(/<h1\b/g)).toHaveLength(1);
  const sagas = renderToStaticMarkup(
    <WikiEditorialHero category="sagas" eyebrow="Sagas" title="Dragon Ball" />,
  );
  expect(sagas).toContain("dragon-ball-one-star.svg");
  const portal = renderToStaticMarkup(<WikiEditorialHero eyebrow="Wiki" title="Dragon Ball" />);
  expect(portal).not.toContain("data-measured-illustration");
});
