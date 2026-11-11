import { describe, expect, test } from "bun:test";
import { steamLaunchUrl, steamStoreUrl } from "@aphrody/shenron-config/public-urls";
import { gameRuntimeMessages, XENOVERSE_2_STEAM_APP_ID } from "../src/lib/game-runtime";

describe("Xenoverse 2 runtime handoff", () => {
  test("generates native Steam launch and store URLs without session leakage", () => {
    const launchUrl = steamLaunchUrl(XENOVERSE_2_STEAM_APP_ID);
    expect(launchUrl).toBe("steam://run/454650");

    const storeUrl = new URL(steamStoreUrl(XENOVERSE_2_STEAM_APP_ID));
    expect(storeUrl.origin).toBe("https://store.steampowered.com");
    expect(storeUrl.pathname).toBe("/app/454650/");

    for (const invalid of [0, -1, 1.5, Number.NaN, Number.MAX_SAFE_INTEGER + 1]) {
      expect(() => steamLaunchUrl(invalid)).toThrow(RangeError);
      expect(() => steamStoreUrl(invalid)).toThrow(RangeError);
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
