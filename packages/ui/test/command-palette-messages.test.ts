import { expect, test } from "bun:test";
import { getCommandPaletteMessages, paletteText } from "../src/public/command-palette-messages";

test("all palette locales cover every result category and preserve template variables", () => {
  const reference = getCommandPaletteMessages("fr");
  for (const locale of ["en", "ja"]) {
    const messages = getCommandPaletteMessages(locale);
    expect(Object.keys(messages).toSorted()).toEqual(Object.keys(reference).toSorted());
    for (const key of Object.keys(reference) as Array<keyof typeof reference>) {
      expect(messages[key].trim().length).toBeGreaterThan(0);
      expect(messages[key].match(/\{\w+\}/g) ?? []).toEqual(reference[key].match(/\{\w+\}/g) ?? []);
    }
    expect(messages.hDatabooks).not.toBe(reference.hDatabooks);
    expect(messages.hNovels).not.toBe(reference.hNovels);
  }
  expect(getCommandPaletteMessages("unknown")).toBe(reference);
  expect(paletteText(getCommandPaletteMessages("ja"), "chapter", { number: 12 })).toBe("第12話");
  const query = "<script>{number}</script>";
  expect(paletteText(reference, "allResults", { query })).toContain(query);
});
