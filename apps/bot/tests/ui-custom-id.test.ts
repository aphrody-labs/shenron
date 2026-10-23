import { describe, expect, test } from "bun:test";
import {
  CustomIdError,
  customId,
  customIdPattern,
  intArg,
  isCustomIdOf,
  parseCustomId,
} from "../src/ui/custom-id";

describe("versioned custom ids", () => {
  test("builds <ns>:v<version>:<args> and parses it back", () => {
    const id = customId("shop", 2, "buy", 17, "card_goku");
    expect(id).toBe("shop:v2:buy:17:card_goku");
    expect(parseCustomId(id)).toEqual({ ns: "shop", version: 2, args: ["buy", "17", "card_goku"] });
  });

  test("an id without arguments, and an empty argument, round-trip", () => {
    expect(parseCustomId(customId("help", 1))).toEqual({ ns: "help", version: 1, args: [] });
    expect(parseCustomId(customId("ui.pg", 1, "a", ""))).toEqual({
      ns: "ui.pg",
      version: 1,
      args: ["a", ""],
    });
  });

  test("a separator or user text in an argument cannot forge or shift a field", () => {
    const hostile = "x:v9:admin%3A:é 日本";
    const id = customId("ns", 1, hostile, "after");
    const parsed = parseCustomId(id)!;
    expect(parsed.args).toEqual([hostile, "after"]);
    expect(id.split(":")).toHaveLength(4);
  });

  test("the 100 character limit applies to the encoded id and throws at build time", () => {
    expect(customId("ns", 1, "a".repeat(94)).length).toBe(100);
    expect(() => customId("ns", 1, "a".repeat(95))).toThrow(CustomIdError);
    // "é" encodes to 6 characters: the encoded length is what counts.
    expect(() => customId("ns", 1, "é".repeat(16))).toThrow(CustomIdError);
  });

  test("rejects a bad namespace, version or argument", () => {
    expect(() => customId("Shop", 1)).toThrow(CustomIdError);
    expect(() => customId("a:b", 1)).toThrow(CustomIdError);
    expect(() => customId("shop", -1)).toThrow(CustomIdError);
    expect(() => customId("shop", 100)).toThrow(CustomIdError);
    expect(() => customId("shop", 1.5)).toThrow(CustomIdError);
    expect(() => customId("shop", 1, Number.NaN)).toThrow(CustomIdError);
    expect(() => customId("shop", 1, "\ud800")).toThrow(CustomIdError);
  });

  test("legacy and malformed ids are not versioned ids", () => {
    expect(parseCustomId("help:category")).toBeNull();
    expect(parseCustomId("discordx@pagination@next")).toBeNull();
    expect(parseCustomId("shop:v1:%E0%A4%A")).toBeNull();
    expect(parseCustomId("")).toBeNull();
  });

  test("customIdPattern routes a namespace for any version, and only that namespace", () => {
    const pattern = customIdPattern("ui.pg");
    expect(pattern.test("ui.pg:v1:scores:next:1:3")).toBe(true);
    expect(pattern.test("ui.pg:v12")).toBe(true);
    expect(pattern.test("uixpg:v1:a")).toBe(false);
    expect(pattern.test("ui.pgx:v1:a")).toBe(false);
    expect(pattern.test("other:v1:ui.pg:")).toBe(false);
  });

  test("isCustomIdOf checks the namespace and optionally the version", () => {
    const id = customId("shop", 2, "x");
    expect(isCustomIdOf(id, "shop")).toBe(true);
    expect(isCustomIdOf(id, "shop", 2)).toBe(true);
    expect(isCustomIdOf(id, "shop", 1)).toBe(false);
    expect(isCustomIdOf(id, "wallet")).toBe(false);
  });

  test("intArg reads integers back within a range, else the fallback", () => {
    expect(intArg("42", 0)).toBe(42);
    expect(intArg("-3", 0)).toBe(-3);
    expect(intArg("9", 1, { min: 1, max: 5 })).toBe(1);
    expect(intArg("abc", 7)).toBe(7);
    expect(intArg("4.5", 7)).toBe(7);
    expect(intArg(undefined, 7)).toBe(7);
    expect(intArg("99999999999999999999", 7)).toBe(7);
  });
});
