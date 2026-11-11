// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "bun:test";
import {
  computeTaffyLayout,
  FighterZEngineRuntime,
  type TaffyNode,
  ARCSYS_WGSL_SHADER,
} from "../src/games/fighterz-bevy-runtime";

describe("Dragon Ball FighterZ : Bevy + WGPU 30 + Taffy Engine", () => {
  it("resolves Taffy flexbox layout hierarchy deterministically", () => {
    const rootNode: TaffyNode = {
      id: "hud-root",
      style: {
        display: "flex",
        flexDirection: "row",
        justifyContent: "space-between",
        width: 1920,
        height: 100,
        padding: [10, 20, 10, 20],
        gap: 15,
      },
      layout: { x: 0, y: 0, width: 0, height: 0 },
      children: [
        {
          id: "p1-bar",
          style: { width: 500, height: 32 },
          layout: { x: 0, y: 0, width: 0, height: 0 },
          children: [],
        },
        {
          id: "timer",
          style: { width: 100, height: 48 },
          layout: { x: 0, y: 0, width: 0, height: 0 },
          children: [],
        },
        {
          id: "p2-bar",
          style: { width: 500, height: 32 },
          layout: { x: 0, y: 0, width: 0, height: 0 },
          children: [],
        },
      ],
    };

    computeTaffyLayout(rootNode, 0, 0, 1920, 100);

    expect(rootNode.layout.width).toBe(1920);
    expect(rootNode.layout.height).toBe(100);

    // Child 1 starts at padding left (20)
    expect(rootNode.children[0].layout.x).toBe(20);
    expect(rootNode.children[0].layout.width).toBe(500);

    // Child 2 starts after child 1 + gap (20 + 500 + 15 = 535)
    expect(rootNode.children[1].layout.x).toBe(535);
    expect(rootNode.children[1].layout.width).toBe(100);

    // Child 3 starts after child 2 + gap (535 + 100 + 15 = 650)
    expect(rootNode.children[2].layout.x).toBe(650);
    expect(rootNode.children[2].layout.width).toBe(500);
  });

  it("validates ArcSys WGSL shader source structure", () => {
    expect(ARCSYS_WGSL_SHADER).toContain("struct VertexInput");
    expect(ARCSYS_WGSL_SHADER).toContain("outlineMode: u32");
    expect(ARCSYS_WGSL_SHADER).toContain("in.color.g * in.color.a * uniforms.outlineThickness");
    expect(ARCSYS_WGSL_SHADER).toContain("select(0.38, 1.0, biasedNdotL > 0.15)");
  });

  it("executes deterministic 60 FPS combat simulation and attack states", () => {
    const runtime = new FighterZEngineRuntime();

    // Initial state
    const snap0 = runtime.step({});
    expect(snap0.tick).toBe(1);
    expect(snap0.fighters.length).toBe(2);

    const p1 = snap0.fighters[0];
    const p2 = snap0.fighters[1];

    expect(p1.name).toContain("Goku");
    expect(p2.name).toContain("Vegeta");
    expect(p1.health).toBe(10000);
    expect(p2.health).toBe(10000);
    expect(p1.kiEnergy).toBe(300);

    // Movement forward
    const snapMove = runtime.step({ moveRight: true });
    expect(snapMove.fighters[0].vx).toBe(8);

    // Execute Super Kamehameha
    const snapSuper = runtime.step({ superKamehameha: true });
    expect(snapSuper.fighters[0].state).toBe("super_kamehameha");
    expect(snapSuper.fighters[0].kiEnergy).toBe(200); // 300 - 100 Ki consumed
    expect(snapSuper.announcement).toBe("SUPER KAMEHAMEHA!");

    // Advance 25 frames to trigger hit frame (frame 20)
    for (let f = 0; f < 25; f++) {
      runtime.step({});
    }

    const snapHit = runtime.step({});
    // P2 should take 3200 damage from Super Kamehameha
    expect(snapHit.fighters[1].health).toBeLessThan(10000);
    expect(snapHit.hitSparks.length).toBeGreaterThan(0);
  });
});
