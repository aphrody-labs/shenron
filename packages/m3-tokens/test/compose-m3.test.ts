// SPDX-License-Identifier: Apache-2.0
import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { COMPOSE_M3 } from "../src/compose-m3.generated";
import { rem } from "../src/expressive";

const css = ["m3-tokens.css", "expressive.css"].map((file) =>
  Bun.file(join(import.meta.dir, "..", "src", file)).text(),
);

async function declarations(): Promise<Map<string, string>> {
  const values = new Map<string, string>();
  for (const sheet of await Promise.all(css)) {
    const root = sheet.slice(sheet.indexOf(":root"), sheet.indexOf("}", sheet.indexOf(":root")));
    for (const m of root.matchAll(/(--md-sys-[\w-]+):\s*([^;]+);/g))
      values.set(m[1]!, m[2]!.trim());
  }
  return values;
}

describe("Material 3 tokens follow Compose Material 3", () => {
  test("corner scale", async () => {
    const values = await declarations();
    for (const [name, dp] of Object.entries(COMPOSE_M3.cornersDp)) {
      expect(values.get(`--md-sys-shape-corner-${name}`), name).toBe(`${dp}px`);
    }
  });

  test("standard and expressive springs", async () => {
    const values = await declarations();
    for (const [scheme, springs] of [
      ["", COMPOSE_M3.standardSprings],
      ["expressive-", COMPOSE_M3.expressiveSprings],
    ] as const) {
      for (const [name, spring] of Object.entries(springs)) {
        expect(
          values.get(`--md-sys-motion-spring-${scheme}${name}-damping`),
          `${scheme}${name}`,
        ).toBe(String(spring.damping));
        expect(
          values.get(`--md-sys-motion-spring-${scheme}${name}-stiffness`),
          `${scheme}${name}`,
        ).toBe(String(spring.stiffness));
      }
    }
  });

  test("type scale, baseline and emphasized", async () => {
    const values = await declarations();
    for (const [style, metric] of Object.entries(COMPOSE_M3.typeScaleSp)) {
      const prefix = `--md-sys-typescale-${style}`;
      expect(values.get(`${prefix}-size`), style).toBe(rem(metric.size));
      expect(values.get(`${prefix}-line-height`), style).toBe(rem(metric.lineHeight));
      expect(values.get(`${prefix}-tracking`), style).toBe(rem(metric.tracking));
      expect(values.get(`${prefix}-weight`), style).toBe(String(metric.weight));
    }
  });
});
