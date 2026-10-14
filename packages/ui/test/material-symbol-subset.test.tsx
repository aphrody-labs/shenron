import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { MaterialSymbol } from "../src/icones/MaterialSymbol";
import subset from "../src/icones/material-symbol-subset.json";

test("the minimized owner subset is safe SVG and needs no icon font", () => {
  expect(Object.keys(subset.icons).length).toBeLessThanOrEqual(32);
  for (const name of Object.keys(subset.icons) as (keyof typeof subset.icons)[]) {
    const html = renderToStaticMarkup(<MaterialSymbol name={name} size={24} />);
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain("<path");
    expect(html).not.toMatch(/<script|<image|<foreignObject|onclick|https?:/);
  }
});
