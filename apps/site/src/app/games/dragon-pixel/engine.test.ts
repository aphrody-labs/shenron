// SPDX-License-Identifier: Apache-2.0
import { test, expect } from "bun:test";
import { createGame, step } from "./engine";

test("energy, transformation, cooldown and expiry", () => {
  const g = createGame();
  g.player.energy = 80;
  step(g, { transform: true }, 0.01);
  expect(g.player.transformed).toBe(8);
  expect(g.player.energy).toBeLessThan(1);
  for (let i = 0; i < 180; i++) step(g, {}, 0.05);
  expect(g.player.transformed).toBe(0);
});

test("combo and projectile damage with energy cost", () => {
  const g = createGame();
  g.wave = 1;
  g.enemies = [{ x: 210, y: 320, hp: 100, cooldown: 10 }];
  step(g, { punch: true }, 0.01);
  expect(g.enemies[0].hp).toBe(87);
  step(g, { punch: true }, 0.01);
  expect(g.enemies[0].hp).toBe(87);
  g.player.cooldown = 0;
  step(g, { blast: true }, 0.01);
  expect(g.player.energy).toBeLessThan(21);
  for (let i = 0; i < 10; i++) step(g, {}, 0.01);
  expect(g.enemies[0].hp).toBe(63);
});

test("melee attacks only hit targets in the facing direction", () => {
  const g = createGame();
  g.player.x = 300;
  g.player.facing = 1;
  g.enemies = [{ x: 260, y: 320, hp: 100, cooldown: 10 }];
  step(g, { punch: true }, 0.01);
  expect(g.enemies[0].hp).toBe(100);

  g.player.cooldown = 0;
  g.player.facing = -1;
  step(g, { punch: true }, 0.01);
  expect(g.enemies[0].hp).toBe(87);
});

test("five waves win, score only once per enemy", () => {
  const g = createGame();
  for (let wave = 1; wave <= 5; wave++) {
    step(g, {}, 0.05);
    expect(g.wave).toBe(wave);
    for (const e of g.enemies) e.hp = 0;
    step(g, {}, 0.05);
    for (let i = 0; i < 31; i++) step(g, {}, 0.05);
  }
  expect(g.status).toBe("won");
  expect(g.score).toBe(2000);
  const score = g.score;
  step(g, { blast: true }, 0.05);
  expect(g.score).toBe(score);
});

test("death ends game and pauses simulation", () => {
  const g = createGame();
  g.wave = 1;
  g.player.hp = 1;
  g.enemies = [{ x: 180, y: 320, hp: 50, cooldown: 0 }];
  step(g, {}, 0.01);
  expect(g.status).toBe("lost");
  const x = g.player.x;
  step(g, { right: true }, 0.05);
  expect(g.player.x).toBe(x);
});

test("jump, arena bounds and character differences", () => {
  const a = createGame();
  const b = createGame("speed");
  step(a, { right: true, jump: true }, 0.05);
  step(b, { right: true }, 0.05);
  expect(a.player.y).toBeLessThan(320);
  expect(b.player.x).toBeGreaterThan(a.player.x);
  for (let i = 0; i < 1000; i++) step(b, { right: true }, 0.05);
  expect(b.player.x).toBeLessThanOrEqual(936);
});

test("story mode chapter 1 initialization and victory", () => {
  const g = createGame("goku", "story", 1);
  expect(g.mode).toBe("story");
  expect(g.currentChapterId).toBe(1);
  expect(g.arena).toBe("paozu");
  step(g, {}, 0.05);
  expect(g.enemies.length).toBe(1);
  expect(g.enemies[0].hp).toBe(80);
  g.enemies[0].hp = 0;
  step(g, {}, 0.05);
  expect(g.status).toBe("won");
});

test("story chapters initialize the designated fighter stats and style", () => {
  const g = createGame("goku", "story", 10);
  expect(g.player.fighterId).toBe("trunks");
  expect(g.player.style).toBe("speed");
  expect(g.player.powerLevel).toBe(5000);
  expect(g.player.maxEnergy).toBe(100);
});

test("guard reduces damage and vanish repositions behind opponent", () => {
  const g = createGame();
  g.wave = 1;
  g.enemies = [{ x: 200, y: 320, hp: 100, cooldown: 0 }];
  g.player.x = 160;
  g.player.energy = 50;
  step(g, { guard: true }, 0.01);
  expect(g.player.guarding).toBe(true);
  expect(g.player.hp).toBe(99); // Only 1 damage taken with guard
  step(g, { vanish: true }, 0.01);
  expect(Math.floor(g.player.energy)).toBe(25);
  expect(g.player.x).toBeGreaterThan(200); // Repositioned behind enemy
});

test("beam clash activation and resolution via mash", () => {
  const g = createGame();
  g.shots = [
    { x: 400, y: 300, vx: 500, damage: 40, isBeam: true, source: "player" },
    { x: 450, y: 300, vx: -500, damage: 40, isBeam: true, source: "enemy" },
  ];
  step(g, {}, 0.01);
  expect(g.clash).toBeDefined();
  expect(g.clash?.active).toBe(true);
  step(g, { mash: true }, 0.05);
  expect(g.clash?.tension).toBeGreaterThan(0);
});

test("multiverse dimension switching cycles through all dimensions", () => {
  const g = createGame();
  expect(g.multiverse.dimension).toBe("xenoverse");
  step(g, { dimensionSwitch: true }, 0.01);
  expect(g.multiverse.dimension).toBe("fighterz");
  step(g, { dimensionSwitch: true }, 0.01);
  expect(g.multiverse.dimension).toBe("butoden");
  step(g, { dimensionSwitch: true }, 0.01);
  expect(g.multiverse.dimension).toBe("tenkaichi");
  step(g, { dimensionSwitch: true }, 0.01);
  expect(g.multiverse.dimension).toBe("legend");
  step(g, { dimensionSwitch: true }, 0.01);
  expect(g.multiverse.dimension).toBe("xenoverse");
});

test("fighterz sparking blast activates pushback and health regen", () => {
  const g = createGame();
  g.multiverse.dimension = "fighterz";
  g.player.hp = 50;
  g.enemies = [{ x: 200, y: 320, hp: 100, cooldown: 10 }];
  g.player.x = 180;
  step(g, { sparking: true }, 0.01);
  expect(g.multiverse.sparkingActive).toBe(true);
  expect(g.enemies[0].x).toBeGreaterThan(200); // Knockback push
  step(g, {}, 0.5);
  expect(g.player.hp).toBeGreaterThan(50); // Health regenerated
});

test("the legend power balance meter triggers meteor smash at 100", () => {
  const g = createGame();
  g.multiverse.dimension = "legend";
  g.multiverse.powerBalance = 100;
  g.enemies = [{ x: 250, y: 320, hp: 100, cooldown: 10 }];
  step(g, {}, 0.01);
  expect(g.enemies[0].hp).toBeLessThanOrEqual(25); // 75 massive meteor damage
  expect(g.multiverse.powerBalance).toBe(0); // Reset after smash
  expect(g.score).toBeGreaterThanOrEqual(1000);
});
