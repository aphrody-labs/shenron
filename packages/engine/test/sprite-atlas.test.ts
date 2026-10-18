// SPDX-License-Identifier: Apache-2.0

import { describe, expect, spyOn, test } from "bun:test";
import { SpriteAtlasPlayer, loadSpriteAtlas, parseSpriteAtlas } from "../src/sprite-atlas";

function manifest() {
  return {
    version: 1,
    image: "page-sheet.png",
    size: [34, 22],
    tile: [10, 10],
    columns: 3,
    rows: 2,
    padding: [2, 2],
    offset: [0, 0],
    fps: 2,
    frame_count: 5,
    frames: Array.from({ length: 5 }, (_, index) => ({
      index,
      bounds: [(index % 3) * 12, Math.floor(index / 3) * 12, 10, 10],
      content: [(index % 3) * 12, Math.floor(index / 3) * 12 + 2, 10, 6],
      source: [100, 60],
      panel: [0.1, 0.2, 0.3, 0.4],
    })),
  };
}

describe("Rust panel atlas consumer", () => {
  test("loads only sibling assets without credentials and rejects a mismatched PNG before decoding", async () => {
    const fetcher = spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(Response.json(manifest()))
      .mockResolvedValueOnce(new Response(new Uint8Array(24)));
    try {
      await expect(
        loadSpriteAtlas("https://cdn.example.test/atlas/sheet.layout.json"),
      ).rejects.toThrow("Sprite PNG dimensions differ");
      expect(String(fetcher.mock.calls[1][0])).toBe(
        "https://cdn.example.test/atlas/page-sheet.png",
      );
      expect(fetcher.mock.calls[0][1]).toMatchObject({ credentials: "omit", redirect: "error" });
    } finally {
      fetcher.mockRestore();
    }
  });

  test("bounds downloaded JSON before parsing or decoding images", async () => {
    const fetcher = spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(new Uint8Array(1024 * 1024 + 1)),
    );
    try {
      await expect(loadSpriteAtlas("https://cdn.example.test/sheet.layout.json")).rejects.toThrow(
        "Sprite asset exceeds its byte limit",
      );
      expect(fetcher).toHaveBeenCalledTimes(1);
    } finally {
      fetcher.mockRestore();
    }
  });

  test("plays the exported frame order, loops, and clamps one-shot playback", () => {
    const player = new SpriteAtlasPlayer(manifest());
    expect([0, 499, 500, 1000, 2000, 2499, 2500].map((time) => player.frameAt(time).index)).toEqual(
      [0, 0, 1, 2, 4, 4, 0],
    );
    expect(player.frameAt(10_000, false).index).toBe(4);
    for (const time of [-1, Infinity, NaN]) expect(() => player.frameAt(time)).toThrow();
  });

  test("refuses invalid geometry, frame identities, source paths and timing", () => {
    const cases = [
      { ...manifest(), image: "../private.png" },
      { ...manifest(), image: "https://elsewhere.test/asset.png" },
      { ...manifest(), fps: NaN },
      { ...manifest(), frame_count: 6 },
      { ...manifest(), size: [33, 22] },
      { ...manifest(), frames: manifest().frames.toReversed() },
      {
        ...manifest(),
        frames: manifest().frames.map((frame) => Object.assign(frame, { content: [0, 0, 11, 11] })),
      },
      {
        ...manifest(),
        frames: manifest().frames.map((frame) =>
          Object.assign(frame, { panel: [0.9, 0.2, 0.3, 0.4] }),
        ),
      },
    ];
    for (const value of cases) expect(() => parseSpriteAtlas(value)).toThrow();
  });

  test("detaches validated geometry from the mutable JSON input", () => {
    const value = manifest();
    const atlas = parseSpriteAtlas(value);
    value.frames[0].bounds[0] = 100;
    expect(atlas.frames[0].bounds[0]).toBe(0);
    expect(Object.isFrozen(atlas.frames[0].bounds)).toBe(true);
  });

  test("draws only the selected original tile with nearest sampling and restores context state", () => {
    const player = new SpriteAtlasPlayer(manifest());
    const calls: unknown[][] = [];
    const context = {
      imageSmoothingEnabled: true,
      save() {
        calls.push(["save"]);
      },
      restore() {
        calls.push(["restore"]);
      },
      drawImage(...values: unknown[]) {
        calls.push(["draw", this.imageSmoothingEnabled, ...values]);
      },
    };
    const image = { width: 34, height: 22 } as CanvasImageSource & {
      width: number;
      height: number;
    };
    expect(player.draw(context, image, 2000, { x: 1.4, y: 2.7, scale: 2 })).toBe(4);
    expect(calls).toEqual([
      ["save"],
      ["draw", false, image, 12, 12, 10, 10, 1, 3, 20, 20],
      ["restore"],
    ]);
    expect(() => player.draw(context, image, 0, { scale: 1.5 })).toThrow();
    expect(() => player.draw(context, { ...image, width: 1 } as typeof image, 0)).toThrow();
    context.drawImage = () => {
      throw new Error("canvas closed");
    };
    expect(() => player.draw(context, image, 0)).toThrow("canvas closed");
    expect(calls.at(-1)).toEqual(["restore"]);
  });
});
