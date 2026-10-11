import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { buildVideoPlan } from "../../media/src/video-plan";
import { ShenronComposition } from "../src/video/ShenronComposition";
test("composition escapes source text and is deterministic", () => {
  const plan = buildVideoPlan(
    { kind: "original" },
    {
      cards: [{ title: "<script>alert(1)</script>", provenance: "fixture" }],
      sources: [],
      labels: { title: "Original", subtitle: "", dateLabel: "" },
    },
  );
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
