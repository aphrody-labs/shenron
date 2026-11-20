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
  test(
    "le préchargement same-origin effectue le fetch du module",
    { timeout: 20_000 },
    async () => {
      const moduleUrl = new URL("../src/canvas.ts", import.meta.url).href;
      const script = `
      Object.defineProperty(globalThis, "location", {
        configurable: true,
        value: { origin: "https://dragonballfr.com" },
      });
      let fetched = 0;
      globalThis.fetch = (input) => {
        fetched += 1;
        if (new URL(String(input)).origin !== "https://dragonballfr.com") {
          throw new Error("canvas WASM fetch left the page origin");
        }
        return Promise.resolve(new Response(new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0]), {
          headers: { "content-type": "application/wasm" },
        }));
      };
      const { preloadCanvasModule } = await import(${JSON.stringify(moduleUrl)});
      await preloadCanvasModule({ sameOriginOnly: true });
      console.log("canvas fetch count:", fetched);
    `;
      const result = Bun.spawnSync([process.execPath, "--eval", script], {
        stdout: "pipe",
        stderr: "pipe",
        timeout: 15_000,
      });
      expect(result.exitCode).toBe(0);
      expect(result.stdout.toString()).toContain("canvas fetch count: 1");
    },
  );
});
