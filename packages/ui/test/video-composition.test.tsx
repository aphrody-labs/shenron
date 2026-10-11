import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { ShenronComposition } from "../src/video/ShenronComposition";
test("composition escapes source text and is deterministic", () => {
  const plan: Parameters<typeof ShenronComposition>[0]["plan"] = {
    request: { width: 1280, height: 720, kind: "original" },
    render: { endFrame: 288 },
    cards: [{ title: "<script>alert(1)</script>" }],
    labels: { title: "Original", subtitle: "", dateLabel: "" },
  };
  const first = renderToStaticMarkup(<ShenronComposition plan={plan} frame={0} />);
  expect(first).toContain("&lt;script&gt;");
  expect(first).not.toContain("<script>alert");
  expect(renderToStaticMarkup(<ShenronComposition plan={plan} frame={0} />)).toBe(first);
  expect(renderToStaticMarkup(<ShenronComposition plan={plan} frame={287} />)).not.toBe(first);
  expect(() => renderToStaticMarkup(<ShenronComposition plan={plan} frame={288} />)).toThrow();
  expect(() =>
    renderToStaticMarkup(<ShenronComposition plan={{ ...plan, cards: [] }} frame={0} />),
  ).toThrow();
});
