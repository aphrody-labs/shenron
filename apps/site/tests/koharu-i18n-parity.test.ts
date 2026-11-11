// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  auditNamespaceParity,
  loadCanonicalTerms,
  harmonizeTerminology,
} from "../../../scripts/ops/koharu-i18n-harmonizer";

describe("Koharu i18n & Lexicon Harmonization", () => {
  it("enforces 100% translation key parity across FR, EN, and JA for apps/site", () => {
    const root = join(import.meta.dir, "..");
    const siteFr = JSON.parse(readFileSync(join(root, "messages/fr.json"), "utf-8"));
    const siteEn = JSON.parse(readFileSync(join(root, "messages/en.json"), "utf-8"));
    const siteJa = JSON.parse(readFileSync(join(root, "messages/ja.json"), "utf-8"));

    const audit = auditNamespaceParity("apps/site", siteFr, siteEn, siteJa);
    expect(audit.valid).toBe(true);
    expect(audit.missingEn.length).toBe(0);
    expect(audit.missingJa.length).toBe(0);
    expect(audit.totalKeys).toBeGreaterThan(2500);
  });

  it("substitutes canonical Dragon Ball terminology using Koharu lexicon", () => {
    const terms = loadCanonicalTerms();
    expect(terms.size).toBeGreaterThan(500);

    const inputJa = "オラ、孫悟空！カメハメ波！";
    const harmonizedFr = harmonizeTerminology(inputJa, "fr", terms);
    expect(harmonizedFr).toContain("Son Goku");
  });
});
