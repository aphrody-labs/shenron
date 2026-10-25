// SPDX-License-Identifier: Apache-2.0
import { describe, expect, test } from "bun:test";
import {
  assertVariantMeasurementMode,
  VARIANT_MEASUREMENT_EVIDENCE_SQL,
} from "../scripts/variant-measurement-policy";
import {
  assertVariantEvidenceUpdate,
  VARIANT_EDITORIAL_EVIDENCE_KEYS,
} from "../src/lib/wiki-variant-evidence";

describe("variant measurement safeguards", () => {
  test("volume-bound editorial references are accepted without rewriting measured volume observations", () => {
    const current = { evidence: { tomes: [24, 25, 26, 27, 28], methode: "ocr-manga" } };
    const reference = {
      fields: ["firstVolume", "lastVolume"],
      url: "https://dragonballfr.com/wiki/manga/1447?page=3",
      title: "Chapter330 begins volume28",
      locator: "Tome28, planche3",
    };
    expect(() =>
      assertVariantEvidenceUpdate(current, {
        lastVolume: 27,
        evidence: { ...current.evidence, editorialReferences: [reference] },
      }),
    ).not.toThrow();
    expect(() =>
      assertVariantEvidenceUpdate(current, {
        lastVolume: 27,
        evidence: {
          ...current.evidence,
          tomes: [24, 25, 26, 27],
          editorialReferences: [reference],
        },
      }),
    ).toThrow("Measured variant evidence");
  });
  test("destructive reset is rejected even without apply", () => {
    for (const args of [["--reinitialiser"], ["--mesure", "--reinitialiser", "--appliquer"]])
      expect(() => assertVariantMeasurementMode(args)).toThrow(
        "Destructive variant reset is disabled",
      );
    expect(() => assertVariantMeasurementMode(["--mesure", "--appliquer"])).not.toThrow();
  });
  test("the actual CLI rejects reset before it can discover a database credential", async () => {
    const child = Bun.spawn(
      [process.execPath, "scripts/variantes-par-saga.ts", "--reinitialiser", "--appliquer"],
      {
        cwd: `${import.meta.dir}/..`,
        env: {
          PATH: process.env.PATH,
          DATABASE_URL: "postgres://invalid:invalid@127.0.0.1:1/should_not_connect",
        },
        stdout: "pipe",
        stderr: "pipe",
      },
    );
    const error = await new Response(child.stderr).text();
    expect(await child.exited).not.toBe(0);
    expect(error).toContain("Destructive variant reset is disabled");
    expect(error).not.toContain("ECONNREFUSED");
  });
  test("the retired unproven-variant writer refuses apply before database access", async () => {
    const child = Bun.spawn(
      [process.execPath, "scripts/retire-unproven-variants.ts", "--appliquer"],
      {
        cwd: `${import.meta.dir}/..`,
        env: {
          PATH: process.env.PATH,
          DATABASE_URL: "postgres://invalid:invalid@127.0.0.1:1/should_not_connect",
        },
        stdout: "pipe",
        stderr: "pipe",
      },
    );
    const error = await new Response(child.stderr).text();
    expect(await child.exited).not.toBe(0);
    expect(error).toContain("Legacy retirement apply is disabled");
    expect(error).not.toContain("ECONNREFUSED");
    const source = await Bun.file(
      `${import.meta.dir}/../scripts/retire-unproven-variants.ts`,
    ).text();
    expect(source).not.toMatch(/update bot\.db_character_variants/i);
  });
  test("preserved metadata comes from the same allowlist as the evidence guard", () => {
    expect(VARIANT_EDITORIAL_EVIDENCE_KEYS).toEqual(["imageArtwork", "editorialReferences"]);
    for (const key of VARIANT_EDITORIAL_EVIDENCE_KEYS)
      expect(VARIANT_MEASUREMENT_EVIDENCE_SQL).toContain(`'${key}'`);
  });
  test("the seed cannot reintroduce the proven Freezer end-volume error or a physical reset", async () => {
    const source = await Bun.file(`${import.meta.dir}/../scripts/variantes-par-saga.ts`).text();
    expect(source).toContain("saga_freezer: [24, 27]");
    expect(source).not.toMatch(/delete\s+from\s+bot\.db_character_variants/i);
    expect(source).toContain("sql.unsafe(VARIANT_MEASUREMENT_EVIDENCE_SQL)");
  });
});
