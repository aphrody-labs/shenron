// SPDX-License-Identifier: Apache-2.0
import { expect, test } from "bun:test";
import { CombatAtlasEffect } from "../src/combat-atlas";
import { SpriteAtlasPlayer } from "../src/sprite-atlas";

function effect() {
  let closed = 0;
  const player = new SpriteAtlasPlayer({
    version: 1,
    image: "sheet.png",
    size: [50, 10],
    tile: [10, 10],
    padding: [0, 0],
    offset: [0, 0],
    columns: 5,
    rows: 1,
    fps: 2,
    frame_count: 5,
    frames: Array.from({ length: 5 }, (_, index) => ({
      index,
      bounds: [index * 10, 0, 10, 10],
      content: [index * 10, 0, 10, 10],
      source: [10, 10],
      panel: [0, 0, 1, 1],
    })),
  });
  const image = { width: 50, height: 10 } as ImageBitmap;
  const instance = new CombatAtlasEffect({
    player,
    image,
    close: () => {
      closed++;
    },
  });
  const context = { save() {}, restore() {}, drawImage() {}, imageSmoothingEnabled: true };
  return { instance, closed: () => closed, context };
}

test("combat sequence plays once for 2500ms, preserves pause, and does not extend on repeated events", () => {
  const { instance, context } = effect();
  expect(instance.draw(context, { x: 0, y: 0 })).toBeNull();
  expect(instance.trigger()).toBe(true);
  instance.advance(1000);
  expect(instance.draw(context, { x: 0, y: 0 })).toBe(2);
  instance.advance(1000, { paused: true });
  expect(instance.elapsedMs).toBe(1000);
  expect(instance.trigger()).toBe(false);
  instance.advance(1499);
  expect(instance.draw(context, { x: 0, y: 0 })).toBe(4);
  instance.advance(1);
  expect(instance.active).toBe(false);
  expect(instance.draw(context, { x: 0, y: 0 })).toBeNull();
  expect(instance.trigger()).toBe(true);
  expect(instance.draw(context, { x: 0, y: 0 })).toBe(0);
});

test("reduced motion and explicit stop cancel playback; dispose releases its bitmap exactly once", () => {
  const { instance, context, closed } = effect();
  expect(instance.trigger(true)).toBe(false);
  instance.trigger();
  instance.advance(500, { reducedMotion: true });
  expect(instance.active).toBe(false);
  instance.trigger();
  instance.stop();
  expect(instance.elapsedMs).toBe(0);
  instance.dispose();
  instance.dispose();
  expect(closed()).toBe(1);
  expect(instance.trigger()).toBe(false);
  expect(instance.draw(context, { x: 0, y: 0 })).toBeNull();
  expect(() => instance.advance(-1)).toThrow();
});
