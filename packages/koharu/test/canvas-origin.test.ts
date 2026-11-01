import { describe, expect, test } from "bun:test";
import { canvasModuleIsCrossOrigin } from "../src/canvas.ts";

describe("canvasModuleIsCrossOrigin", () => {
  test("le WASM du bundle (file:, origine opaque) reste celui d'une page HTTPS", () => {
    expect(canvasModuleIsCrossOrigin("https://dragonballfr.com")).toBe(false);
  });

  test("sans origine de page (rendu serveur), rien n'est considéré hors origine", () => {
    expect(canvasModuleIsCrossOrigin(undefined)).toBe(false);
  });
});

describe("preloadCanvasModule({ sameOriginOnly })", () => {
  test("le préchargement same-origin effectue le fetch du module", async () => {
    const originalFetch = globalThis.fetch;
    const originalLocation = Object.getOwnPropertyDescriptor(globalThis, "location");
    Object.defineProperty(globalThis, "location", {
      configurable: true,
      value: { origin: "https://dragonballfr.com" },
    });
    let fetched = 0;
    const { preloadCanvasModule } = await import(
      new URL("../src/canvas.ts?canvas-origin-test", import.meta.url).href
    );
    globalThis.fetch = Object.assign(
      (input: RequestInfo | URL): Promise<Response> => {
        fetched += 1;
        expect(new URL(String(input)).origin).toBe("https://dragonballfr.com");
        return Promise.resolve(
          new Response(new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0]), {
            headers: { "content-type": "application/wasm" },
          }),
        );
      },
      { preconnect: originalFetch.preconnect },
    );
    try {
      expect(canvasModuleIsCrossOrigin()).toBe(false);
      // Built glue in this repo initializes fetch during compilation; a failed mock compilation
      // would return false. The important contract is that the requested URL is same-origin.
      await preloadCanvasModule({ sameOriginOnly: true });
      expect(fetched).toBeGreaterThan(0);
    } finally {
      globalThis.fetch = originalFetch;
      if (originalLocation) Object.defineProperty(globalThis, "location", originalLocation);
      else Reflect.deleteProperty(globalThis, "location");
    }
  });
});
