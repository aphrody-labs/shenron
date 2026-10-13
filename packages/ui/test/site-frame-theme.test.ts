// SPDX-License-Identifier: Apache-2.0
import { beforeAll, describe, expect, test } from "bun:test";
import { join } from "node:path";
import postcss, { type Root, type Rule } from "postcss";
import tailwindcss from "@tailwindcss/postcss";

const root = join(import.meta.dir, "../../..");
const site = join(root, "apps/site");
const sheets = await Promise.all(
  ["site.css", "toriyama.css"].map((name) =>
    Bun.file(join(root, "packages/ui/src", name))
      .text()
      .then((text) => postcss.parse(text)),
  ),
);
let compiled: Root;

beforeAll(async () => {
  const source = `@import "tailwindcss";
@import "@aphrody/shenron-ui/styles.css";
@import "@aphrody/shenron-ui/site.css";
@import "@aphrody/shenron-ui/toriyama.css";
@source inline("bg-dbz-bg toriyama-panel toriyama-btn wiki-content-card");`;
  const result = await postcss([tailwindcss({ base: site, optimize: false })]).process(source, {
    from: join(site, "src/app/globals.css"),
  });
  compiled = result.root;
}, 30_000);

function rules(selector: string, sources: Root[] = sheets): Rule[] {
  const result: Rule[] = [];
  for (const source of sources)
    source.walkRules((rule) => {
      if (rule.selector === selector) result.push(rule);
    });
  return result;
}

describe("shared frame-themed surfaces", () => {
  test("common Toriyama controls have one layered owner so host utilities can override them", () => {
    for (const selector of [".toriyama-panel", ".toriyama-btn", ".scouter-hud"]) {
      const owned = rules(selector);
      expect(owned).toHaveLength(1);
      expect(owned[0]!.parent?.type).toBe("atrule");
      expect(owned[0]!.parent).toMatchObject({ name: "layer", params: "components" });
    }
  });

  test("Tailwind resolves the shared surface utilities without leaving apply instructions", () => {
    const unresolved: string[] = [];
    compiled.walkAtRules("apply", (rule) => {
      unresolved.push(rule.params);
    });
    expect(unresolved).toEqual([]);
    expect(rules(".bg-dbz-bg", [compiled])).not.toHaveLength(0);
    for (const selector of [".toriyama-panel", ".wiki-content-card"])
      expect(rules(selector, [compiled])).not.toHaveLength(0);
  });

  test("decorative components cannot freeze a local RGB palette over the host theme", () => {
    const fixed: string[] = [];
    sheets[1]!.walkDecls((declaration) => {
      if (/#[\da-f]{3,8}\b|rgba?\(/i.test(declaration.value))
        fixed.push(`${declaration.prop}: ${declaration.value}`);
    });
    expect(fixed).toEqual([]);
  });

  test("reduced motion also stops the LED, rotating reticle and tactile button", () => {
    for (const selector of [
      ".capsule-led",
      ".scouter-target-reticle::before",
      ".toriyama-btn:active",
    ]) {
      const reductions: Rule[] = [];
      sheets[1]!.walkAtRules("media", (media) => {
        if (media.params !== "(prefers-reduced-motion: reduce)") return;
        media.walkRules((rule) => {
          if (rule.selectors.includes(selector)) reductions.push(rule);
        });
      });
      expect(reductions).toHaveLength(1);
      const declarations = Object.fromEntries(
        reductions[0]!.nodes
          .filter((node) => node.type === "decl")
          .map((node) => [node.prop, node.value]),
      );
      expect(declarations).toMatchObject({
        animation: "none",
        transition: "none",
        transform: "none",
      });
    }
  });
});
