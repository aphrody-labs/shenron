// SPDX-License-Identifier: Apache-2.0
import { expect, test } from "bun:test";
import {
  DRAGON_BALL_PARAM_LEN,
  KINTO_UN_PARAM_LEN,
  dragonBallParams,
  kintoUnParams,
} from "../src/toriyama-svg/model3d";
import { lobesIcone } from "../src/toriyama-svg/kinto-un";

const rust = (path: string) =>
  Bun.file(`${import.meta.dir}/../../../crates/shenron-engine/src/render/${path}`).text();
const constant = (source: string, name: string) => {
  const m = new RegExp(`pub const ${name}: usize = ([^;]+);`).exec(source);
  if (!m) throw new Error(`${name} not found`);
  const scope: Record<string, number> = { MAX_STARS: 7, MAX_LOBES: 16 };
  return Function(...Object.keys(scope), `return ${m[1]};`)(...Object.values(scope)) as number;
};

test("flat parameter lengths match the Rust uniforms", async () => {
  expect(DRAGON_BALL_PARAM_LEN).toBe(constant(await rust("dragon_ball.rs"), "PARAM_LEN"));
  expect(KINTO_UN_PARAM_LEN).toBe(constant(await rust("kinto_un.rs"), "PARAM_LEN"));
  for (const stars of [1, 2, 3, 4, 5, 6, 7] as const) {
    const p = dragonBallParams(stars);
    expect(p.length).toBe(DRAGON_BALL_PARAM_LEN);
    expect(p[2]).toBe(stars);
  }
  expect(kintoUnParams().length).toBe(KINTO_UN_PARAM_LEN);
});

test("the Dragon Ball carries the measured palette and outline", () => {
  const p = dragonBallParams(1);
  // Cerne 23 / 256, star red #e81f23, gradient core #fdffea.
  expect(p[0]).toBeCloseTo(23 / 256, 5);
  expect([p[14], p[15], p[16]].map((v) => Math.round(v * 255))).toEqual([0xe8, 0x1f, 0x23]);
  expect([p[5], p[6], p[7]].map((v) => Math.round(v * 255))).toEqual([0xfd, 0xff, 0xea]);
  // The single star is centred.
  expect([p[17], p[18]]).toEqual([0, -0]);
});

test("the Kinto-Un lobes reproduce the measured icon contour", () => {
  const lobes = lobesIcone();
  expect(lobes).toHaveLength(9);
  // Crest lobe: the arc over [204,128]→[318,128] with a 74 px sagitta peaks at y = 54 px.
  const crest = lobes[2]!;
  expect((crest.y + crest.r) * 256).toBeCloseTo(256 - 54, 0);
  const p = kintoUnParams();
  expect(p[1]).toBe(9);
  expect([p[9], p[10], p[11]].map((v) => Math.round(v * 255))).toEqual([0xfc, 0xf0, 0x3a]);
  expect([p[12], p[13], p[14]].map((v) => Math.round(v * 255))).toEqual([0xe4, 0xbe, 0x05]);
});
