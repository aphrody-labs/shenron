// SPDX-License-Identifier: Apache-2.0
import { expect, test } from "bun:test";
import { createGame, step, type CombatEvent } from "../src/app/games/dragon-pixel/engine";

test("special visual events are emitted only by accepted combat actions", () => {
  const game = createGame("goku");
  const events: CombatEvent[] = [];
  const collect = (event: CombatEvent) => events.push(event);
  step(game, { special: true }, 0.016, collect);
  expect(events).toEqual([]);
  game.player.energy = 100;
  step(game, { punch: true, special: true }, 0.016, collect);
  expect(events).toEqual([]);
  game.player.cooldown = 0;
  step(game, { special: true }, 0.016, collect);
  expect(events).toEqual([{ type: "special", fighterId: "goku" }]);
  step(game, { special: true }, 0.016, collect);
  expect(events).toHaveLength(1);
  game.status = "won";
  step(game, { special: true }, 1, collect);
  expect(events).toHaveLength(1);
});
