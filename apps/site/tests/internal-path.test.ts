import { describe, expect, test } from "bun:test";
import { sanitizeInternalPath } from "@aphrody/shenron-config/favorites";

describe("sanitizeInternalPath", () => {
  test("conserve et normalise les routes locales", () => {
    expect(sanitizeInternalPath(" /wiki/characters/1?tab=bio#sources ")).toBe(
      "/wiki/characters/1?tab=bio#sources",
    );
  });

  test("refuse les destinations externes et les chemins réseau déguisés", () => {
    for (const value of [
      "https://google.com/phishing",
      "//google.com/phishing",
      "/\\google.com/phishing",
      "\\\\google.com/phishing",
      "javascript:alert(1)",
    ]) {
      expect(sanitizeInternalPath(value)).toBeNull();
    }
  });

  test("refuse les valeurs vides, relatives ou trop longues", () => {
    expect(sanitizeInternalPath("")).toBeNull();
    expect(sanitizeInternalPath("wiki/personnages")).toBeNull();
    expect(sanitizeInternalPath(`/${"a".repeat(20)}`, 10)).toBeNull();
  });
});
