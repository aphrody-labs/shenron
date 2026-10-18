import { describe, expect, test } from "bun:test";
import { canvasModuleIsCrossOrigin, preloadCanvasModule } from "../src/canvas.ts";

describe("canvasModuleIsCrossOrigin", () => {
  test("le WASM du bundle (file:, origine opaque) n'est pas celui d'une page HTTPS", () => {
    expect(canvasModuleIsCrossOrigin("https://dragonballfr.com")).toBe(true);
  });

  test("sans origine de page (rendu serveur), rien n'est considéré hors origine", () => {
    expect(canvasModuleIsCrossOrigin(undefined)).toBe(false);
  });
});

describe("preloadCanvasModule({ sameOriginOnly })", () => {
  test("ne lance aucun fetch et renvoie false quand le WASM est hors origine", async () => {
    const originalFetch = globalThis.fetch;
    const originalLocation = Object.getOwnPropertyDescriptor(globalThis, "location");
    Object.defineProperty(globalThis, "location", {
      configurable: true,
      value: { origin: "https://dragonballfr.com" },
    });
    let fetched = 0;
    globalThis.fetch = Object.assign(
      (): Promise<Response> => {
        fetched += 1;
        return Promise.reject(new TypeError("fetch interdit dans ce test"));
      },
      { preconnect: originalFetch.preconnect },
    );
    try {
      expect(canvasModuleIsCrossOrigin()).toBe(true);
      expect(await preloadCanvasModule({ sameOriginOnly: true })).toBe(false);
      expect(fetched).toBe(0);
    } finally {
      globalThis.fetch = originalFetch;
      if (originalLocation) Object.defineProperty(globalThis, "location", originalLocation);
      else Reflect.deleteProperty(globalThis, "location");
    }
  });
});
