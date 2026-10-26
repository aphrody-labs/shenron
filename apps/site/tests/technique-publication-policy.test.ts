// SPDX-License-Identifier: Apache-2.0
import { describe, expect, test } from "bun:test";
import {
  assertReviewedXenoverseRetirement,
  isReviewedXenoverseOnlyTechnique,
  XENOVERSE_FESTIVAL_TECHNIQUES,
  XENOVERSE_ONLY_TECHNIQUES,
  XENOVERSE_GAME_BUFF_TECHNIQUES,
} from "../src/lib/technique-publication-policy";

describe("reviewed Xenoverse reward retirement", () => {
  test("never retires a manga/anime technique based on a game portrait or controls", () => {
    expect(isReviewedXenoverseOnlyTechnique({ id: 114, name: "Kamehameha" })).toBe(false);
    expect(isReviewedXenoverseOnlyTechnique({ id: 286, name: "Big Bang Kamehameha" })).toBe(false);
    expect(isReviewedXenoverseOnlyTechnique({ id: 749, name: "Super Genkidama" })).toBe(false);
    expect(
      isReviewedXenoverseOnlyTechnique({ id: 99999, name: "Super Genkidama (Festival)" }),
    ).toBe(false);
  });

  test("requires exact reviewed identity and unchanged game-only prose", () => {
    const description =
      "Une compétence du festival obtenue en approfondissant le lien t'unissant à Son Goku lors du Festival des univers !";
    const row = {
      id: 749,
      name: "Super Genkidama (Festival)",
      description,
      article: `## Aperçu\n\n${description}`,
    };
    expect(() => assertReviewedXenoverseRetirement(row)).not.toThrow();
    expect(() =>
      assertReviewedXenoverseRetirement({ ...row, article: "A newly sourced anime scene" }),
    ).toThrow("another source review");
    expect(() =>
      assertReviewedXenoverseRetirement({ ...row, description: "Technique du manga" }),
    ).toThrow("description changed");
    expect(() => assertReviewedXenoverseRetirement({ ...row, name: "Super Genkidama" })).toThrow(
      "identity",
    );
  });

  test("reviewed identities are unique and include abbreviated festival labels", () => {
    expect(new Set(XENOVERSE_FESTIVAL_TECHNIQUES.map((entry) => entry.id)).size).toBe(
      XENOVERSE_FESTIVAL_TECHNIQUES.length,
    );
    expect(isReviewedXenoverseOnlyTechnique({ id: 750, name: "Découpe instantanée (Fest.)" })).toBe(
      true,
    );
    expect(
      isReviewedXenoverseOnlyTechnique({ id: 509, name: "Écr. éclair aux poings (Fes.)" }),
    ).toBe(true);
  });

  test("dual ultimate skills do not hide similarly named base attacks", () => {
    const description =
      "Une attaque ultime nécessite un partenaire ultime ! Attaquez en duo avec un Super Kamehameha !";
    expect(() =>
      assertReviewedXenoverseRetirement({
        id: 672,
        name: "DOUBLE Super Kamehameha",
        description,
        article: `## Aperçu\n\n${description}`,
      }),
    ).not.toThrow();
    expect(isReviewedXenoverseOnlyTechnique({ id: 588, name: "Double Kienzan" })).toBe(false);
    expect(isReviewedXenoverseOnlyTechnique({ id: 179, name: "Double dimanche" })).toBe(false);
    expect(new Set(XENOVERSE_ONLY_TECHNIQUES.map((entry) => entry.id)).size).toBe(107);
  });

  test("game buff tiers preserve generic charging and canonical character poses", () => {
    expect(isReviewedXenoverseOnlyTechnique({ id: 300, name: "Charge d'énergie" })).toBe(false);
    expect(isReviewedXenoverseOnlyTechnique({ id: 194, name: "Pose de combat Guldo" })).toBe(false);
    for (const buff of XENOVERSE_GAME_BUFF_TECHNIQUES) {
      expect(() =>
        assertReviewedXenoverseRetirement({ ...buff, article: `## Aperçu\n\n${buff.description}` }),
      ).not.toThrow();
      expect(() =>
        assertReviewedXenoverseRetirement({
          ...buff,
          description: "New sourced manga scene",
          article: "New sourced manga scene",
        }),
      ).toThrow("description changed");
    }
  });
});
