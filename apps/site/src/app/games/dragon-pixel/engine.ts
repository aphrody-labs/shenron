// SPDX-License-Identifier: Apache-2.0

export type FighterStyle = "balanced" | "speed" | "power";

export interface Player {
  x: number;
  y: number;
  vy: number;
  hp: number;
  energy: number;
  facing: number;
  cooldown: number;
  combo: number;
  transformed: number;
  style: FighterStyle;
}

export interface Enemy {
  x: number;
  y: number;
  hp: number;
  cooldown: number;
}

export interface Shot {
  x: number;
  y: number;
  vx: number;
  damage: number;
}

export interface GameState {
  player: Player;
  enemies: Enemy[];
  shots: Shot[];
  wave: number;
  score: number;
  time: number;
  spawn: number;
  status: "playing" | "won" | "lost";
}

export interface GameInput {
  left?: boolean;
  right?: boolean;
  jump?: boolean;
  punch?: boolean;
  blast?: boolean;
  charge?: boolean;
  transform?: boolean;
}

export function createGame(style: FighterStyle = "balanced"): GameState {
  return {
    player: {
      x: 160,
      y: 320,
      vy: 0,
      hp: 100,
      energy: 40,
      facing: 1,
      cooldown: 0,
      combo: 0,
      transformed: 0,
      style,
    },
    enemies: [],
    shots: [],
    wave: 0,
    score: 0,
    time: 0,
    spawn: 0,
    status: "playing",
  };
}

export function step(g: GameState, input: GameInput, dt: number): void {
  if (g.status !== "playing") return;
  const clampedDt = Math.max(0, Math.min(dt, 0.05));
  const p = g.player;
  g.time += clampedDt;
  p.cooldown = Math.max(0, p.cooldown - clampedDt);
  p.transformed = Math.max(0, p.transformed - clampedDt);
  const move = (input.right ? 1 : 0) - (input.left ? 1 : 0);
  if (move) p.facing = move;
  p.x = Math.max(24, Math.min(936, p.x + move * (p.style === "speed" ? 280 : 215) * clampedDt));
  if (input.jump && p.y >= 320) p.vy = -420;
  p.vy += 980 * clampedDt;
  p.y = Math.min(320, p.y + p.vy * clampedDt);
  if (p.y === 320) p.vy = 0;
  p.energy = Math.min(100, p.energy + (input.charge ? 28 : 5) * clampedDt);
  if (input.transform && p.energy >= 80 && p.transformed === 0) {
    p.energy -= 80;
    p.transformed = 8;
  }
  const power = (p.style === "power" ? 1.25 : 1) * (p.transformed ? 1.7 : 1);
  if (input.punch && !p.cooldown) {
    p.combo = (p.combo % 3) + 1;
    p.cooldown = 0.28;
    for (const e of g.enemies) {
      if (Math.abs(e.x - p.x) < 85 && Math.abs(e.y - p.y) < 65 && (e.x - p.x) * p.facing >= 0) {
        e.hp -= (10 + p.combo * 3) * power;
        e.x += p.facing * 18;
      }
    }
  } else if (input.blast && !p.cooldown && p.energy >= 20) {
    p.energy -= 20;
    p.cooldown = 0.45;
    g.shots.push({ x: p.x + p.facing * 24, y: p.y - 20, vx: p.facing * 520, damage: 24 * power });
  }
  if (!g.enemies.length && g.spawn <= 0) {
    if (g.wave === 5) {
      g.status = "won";
      return;
    }
    g.wave++;
    for (let i = 0; i < g.wave + 1; i++) {
      g.enemies.push({ x: 660 + i * 45, y: 320, hp: 35 + g.wave * 8, cooldown: 0.5 + i * 0.2 });
    }
  }
  g.spawn = Math.max(0, g.spawn - clampedDt);
  for (const s of g.shots) {
    s.x += s.vx * clampedDt;
    for (const e of g.enemies) {
      if (e.hp > 0 && Math.abs(e.x - s.x) < 28 && Math.abs(e.y - 20 - s.y) < 38) {
        e.hp -= s.damage;
        s.x = -1000;
        break;
      }
    }
  }
  g.shots = g.shots.filter((s) => s.x > 0 && s.x < 960);
  for (const e of g.enemies) {
    if (e.hp <= 0) {
      g.score += 100;
      p.energy = Math.min(100, p.energy + 8);
      continue;
    }
    e.cooldown -= clampedDt;
    const distance = p.x - e.x;
    if (Math.abs(distance) > 42) e.x += Math.sign(distance) * (65 + g.wave * 8) * clampedDt;
    if (Math.abs(distance) < 55 && Math.abs(p.y - e.y) < 55 && e.cooldown <= 0) {
      p.hp = Math.max(0, p.hp - (p.transformed ? 3 : 6));
      e.cooldown = 0.85;
    }
  }
  const alive = g.enemies.filter((e) => e.hp > 0);
  if (alive.length !== g.enemies.length && !alive.length) g.spawn = 1.5;
  g.enemies = alive;
  if (p.hp <= 0) g.status = "lost";
}
