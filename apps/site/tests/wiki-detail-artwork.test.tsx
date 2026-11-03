// SPDX-License-Identifier: Apache-2.0
import { expect, mock, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

mock.module("@/components/kit/DomainBar", () => ({ DomainBar: () => null }));
mock.module("@/components/Breadcrumbs", () => ({ Breadcrumbs: () => null }));
mock.module("@/components/wiki/WikiEditBar", () => ({ WikiEditBar: () => null }));
mock.module("@/components/kit/ContributeRail", () => ({ ContributeRail: () => null }));
const { WikiDetailPage } = await import("../src/components/wiki/WikiDetailPage");

function render(
  source: string,
  image: string | null = "/artwork/dragon-radar.png",
  caption?: string,
) {
  return renderToStaticMarkup(
    <WikiDetailPage
      entity="Dragon Radar"
      source={source}
      crumbs={[]}
      header={
        <header>
          <h1>Dragon Radar</h1>
        </header>
      }
      image={image}
      imageAlt="Le Dragon Radar"
      imageCaption={caption}
    >
      <p>Entity article</p>
    </WikiDetailPage>,
  );
}

test("entity artwork renders in the detail header with one heading and an explicit contextual caption", () => {
  const html = render("db_items", undefined, "Illustration de l'objet");
  expect(html).toContain('src="/artwork/dragon-radar.png"');
  expect(html).toContain('alt="Le Dragon Radar"');
  expect(html).toContain("<figcaption");
  expect(html).toContain("Illustration de l&#x27;objet");
  expect(html.match(/<h1>/g)).toHaveLength(1);
  expect(html.indexOf("<figure")).toBeLessThan(html.indexOf("Entity article"));
});

test("an entity without artwork reserves no empty illustration or invented image", () => {
  const html = render("db_transformations", null);
  expect(html).not.toContain("<figure");
  expect(html).not.toContain("<img");
});

test("character and technique detail headers remain excluded even if artwork is supplied", () => {
  for (const source of ["db_characters", "db_techniques"]) {
    const html = render(source);
    expect(html).not.toContain("<figure");
    expect(html).not.toContain("<img");
    expect(html).not.toContain("data-wiki-topic");
    expect(html).toContain("<header><h1>Dragon Radar</h1></header>");
  }
});
