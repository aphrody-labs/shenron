// SPDX-License-Identifier: Apache-2.0
import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { StatTiles } from "../src/public/StatTiles";

test("unmeasured values remain unknown while zero and source labels retain their meaning", () => {
  const html = renderToStaticMarkup(
    <StatTiles
      items={[
        { label: "Indexed", value: null, hint: "Awaiting source" },
        { label: "Readable", value: 0 },
      ]}
    />,
  );
  expect(html).toContain("Indexed");
  expect(html).toContain("Awaiting source");
  expect(html).toContain("—");
  expect(html).toMatch(/<dd[^>]*>0<\/dd>/);
  expect(html.match(/<dt /g)).toHaveLength(2);
});

test("portable linked counters keep their ordinary navigation and empty data stays absent", () => {
  const html = renderToStaticMarkup(
    <StatTiles items={[{ label: "Volumes", value: 329, href: "/wiki/manga" }]} />,
  );
  expect(html).toContain('href="/wiki/manga"');
  expect(html).toContain("329");
  expect(renderToStaticMarkup(<StatTiles items={[]} />)).toBe("");
});
