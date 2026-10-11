import { describe, expect, test } from "bun:test";
import { buildVideoPlan, parseVideoRequest } from "../src/video-plan";
describe("bounded video plan", () => {
  test("rejects URLs, odd resolution and excessive pixels", () => {
    for (const value of [
      { url: "http://example.com" },
      { width: 321 },
      { width: 1920, height: 1920 },
      { fps: 61 },
      { durationSeconds: 31 },
      { kind: "other" },
    ])
      expect(() => parseVideoRequest(value)).toThrow();
  });
  test("preserves editorial order and separates dates from rank", () => {
    const snapshot = {
      cards: [
        { title: "First", date: "1990", provenance: "curated" },
        { title: "Second", date: "1986", provenance: "curated" },
      ],
      sources: [],
      labels: { title: "Timeline", subtitle: "Editorial order", dateLabel: "Broadcast" },
    };
    const plan = buildVideoPlan({}, snapshot);
    expect(plan.cards.map((card) => card.title)).toEqual(["First", "Second"]);
    expect(plan.render.endFrame).toBe(288);
    expect(plan.qualification.rendered).toBe(false);
    expect(buildVideoPlan({}, snapshot).contentHash).toBe(plan.contentHash);
  });
  test("fails closed on an empty source", () =>
    expect(() =>
      buildVideoPlan(
        {},
        { cards: [], sources: [], labels: { title: "", subtitle: "", dateLabel: "" } },
      ),
    ).toThrow());
});
