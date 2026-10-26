// SPDX-License-Identifier: Apache-2.0
import { describe, expect, test } from "bun:test";
import { DragonPixelEngine } from "../src/game";
import { createTypeScriptGameEngine, createWasmGameEngine } from "../src/wasm";
import type { FighterInput } from "../src/types";

const idle: FighterInput = {
  left: false,
  right: false,
  up: false,
  down: false,
  lightAttack: false,
  heavyAttack: false,
  special: false,
  ultimate: false,
  block: false,
  dash: false,
};

describe("explicit TypeScript game bridge and compatibility factory", () => {
  test("both factories preserve movement, attacks and match state of the real TypeScript engine", async () => {
    const direct = new DragonPixelEngine("goku", "vegeta", "cell_games", "versus");
    const explicit = await createTypeScriptGameEngine("goku", "vegeta", "cell_games", "versus");
    const legacy = await createWasmGameEngine("goku", "vegeta", "cell_games", "versus");
    for (let frame = 0; frame < 180; frame++) {
      const p1 = frame < 43 ? { ...idle, right: true } : { ...idle, lightAttack: frame % 20 === 0 };
      const p2 = frame < 43 ? { ...idle, left: true } : idle;
      direct.tick(p1, p2);
      explicit.tick(p1, p2);
      legacy.tick(p1, p2);
    }
    const expected = direct.getRenderPacket();
    for (const bridge of [explicit, legacy]) {
      const actual = bridge.getRenderPacket();
      expect(
        actual.fighters.map(({ x, y, hpRatio, stateLabel }) => ({ x, y, hpRatio, stateLabel })),
      ).toEqual(
        expected.fighters.map(({ x, y, hpRatio, stateLabel }) => ({ x, y, hpRatio, stateLabel })),
      );
      expect(actual.ui.matchFrame).toBe(expected.ui.matchFrame);
      expect(bridge.isMatchOver()).toBe(direct.winner !== undefined);
      expect(bridge.getWinner()).toBe(direct.winner);
    }
    expect(expected.ui.matchFrame).toBe(180);
    expect(expected.fighters.some((fighter) => fighter.hpRatio < 1)).toBe(true);
  });

  test("the historical defaults remain compatible", async () => {
    const explicit = await createTypeScriptGameEngine();
    const legacy = await createWasmGameEngine();
    expect(legacy.getRenderPacket()).toEqual(explicit.getRenderPacket());
    expect(legacy.getWinner()).toBeUndefined();
  });
});
