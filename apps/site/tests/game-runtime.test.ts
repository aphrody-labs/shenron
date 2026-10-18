import { describe, expect, test } from "bun:test";
import { bunOsPlayUrl } from "@aphrody/shenron-config/public-urls";
import { gameRuntimeMessages, XENOVERSE_2_STEAM_APP_ID } from "../src/lib/game-runtime";

describe("Xenoverse 2 runtime handoff", () => {
  test("selects the Steam title without session or storage data", () => {
    const url = new URL(bunOsPlayUrl(XENOVERSE_2_STEAM_APP_ID));
    expect(url.origin).toBe("https://play.aphrody.app");
    expect(url.pathname).toBe("/stream");
    expect([...url.searchParams]).toEqual([["appId", "454650"]]);
    expect(url.username).toBe("");
    expect(url.password).toBe("");
    for (const invalid of [0, -1, 1.5, Number.NaN, Number.MAX_SAFE_INTEGER + 1]) {
      expect(() => bunOsPlayUrl(invalid)).toThrow(RangeError);
    }
  });

  test("all supported languages provide the complete runtime copy", () => {
    const keys = Object.keys(gameRuntimeMessages("fr")).toSorted();
    for (const locale of ["fr", "en", "ja"]) {
      const messages = gameRuntimeMessages(locale);
      expect(Object.keys(messages).toSorted()).toEqual(keys);
      expect(Object.values(messages).every((value) => value.trim().length > 0)).toBe(true);
    }
    expect(gameRuntimeMessages("unknown")).toEqual(gameRuntimeMessages("fr"));
  });
});
