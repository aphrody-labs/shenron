// SPDX-License-Identifier: Apache-2.0
import { describe, expect, test } from "bun:test";
import { foldKey, foldText, isValidSlug, slugify, stripDiacritics, uniqueSlug } from "../src/slug";

describe("stripDiacritics", () => {
  test("unfolds Latin accents and keeps Japanese voiced marks composed", () => {
    expect(stripDiacritics("Kaméhaméha, Çà et là, Señor")).toBe("Kamehameha, Ca et la, Senor");
    expect(stripDiacritics("ドラゴンボール が ぱ")).toBe("ドラゴンボール が ぱ");
    expect(stripDiacritics("が").length).toBe(1);
  });
});

describe("foldText", () => {
  test("lower case, no accents, spaces collapsed, punctuation kept", () => {
    expect(foldText("  Végéta   (futur) ")).toBe("vegeta (futur)");
    expect(foldText("KAMÉHAMÉHA")).toBe("kamehameha");
    expect(foldText("孫\u3000悟空")).toBe("孫 悟空");
  });
});

describe("foldKey", () => {
  test("ASCII key with a configurable separator", () => {
    expect(foldKey("Kaméhaméha !")).toBe("kamehameha");
    expect(foldKey("Big bang Attack", "")).toBe("bigbangattack");
    expect(foldKey("  L'aube — du Super Saiyan ", "-")).toBe("l-aube-du-super-saiyan");
    expect(foldKey("Puissance d'attaque", "-")).toBe("puissance-d-attaque");
    expect(foldKey("Dragon Ball (manga)", " ")).toBe("dragon ball manga");
  });
  test("a text without Latin letters or digits folds to an empty key", () => {
    expect(foldKey("ドラゴンボール")).toBe("");
    expect(foldKey("!!", "-")).toBe("");
  });
});

describe("slugify", () => {
  test("drops apostrophes instead of turning them into dashes", () => {
    expect(slugify("L'aube du Super Saïyen")).toBe("laube-du-super-saiyen");
    expect(slugify("  --Goku & Vegeta--  ")).toBe("goku-vegeta");
  });
  test("cuts on a dash when enough of the slug remains", () => {
    const long = "transformation du super saiyan legendaire de broly";
    expect(slugify(long, 28)).toBe("transformation-du-super");
    expect(slugify("abcdefghij-klmnopqrstuvwxyz", 20)).toBe("abcdefghij-klmnopqrs");
  });
  test("isValidSlug and uniqueSlug", () => {
    expect(isValidSlug("goku-ssj")).toBe(true);
    expect(isValidSlug("Goku")).toBe(false);
    expect(isValidSlug("goku--ssj")).toBe(false);
    expect(uniqueSlug("Goku", ["goku", "goku-2"])).toBe("goku-3");
    expect(uniqueSlug("!!", [])).toBe("article");
  });
});
