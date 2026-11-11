// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "bun:test";
import { CanonGameEngine } from "../src/games/canon-game-engine";
import { getCanonChapter } from "../src/games/canon-scenario";

describe("CanonGameEngine : Deterministic 2.5D Combat & UI", () => {
  it("initializes fighter states from the canonical chapter manifest", () => {
    const chapter = getCanonChapter(6)!; // Goku vs Vegeta (Kaiō-ken vs Galick Gun)
    expect(chapter).toBeDefined();

    const engine = new CanonGameEngine({ chapter, renderMode: "2.5d_webgpu" });
    expect(engine.chapter.id).toBe(6);
    expect(engine.player.name).toContain("Son Goku");
    expect(engine.enemy.name).toContain("Vegeta");
    expect(engine.enemy.hp).toBe(180.0);
    expect(engine.matchState).toBe("intro");
    expect(engine.dragonBallsCollected).toBe(0);
  });

  it("advances deterministic 60 FPS physics on movement ticks", () => {
    const chapter = getCanonChapter(6)!;
    const engine = new CanonGameEngine({ chapter });
    engine.matchState = "fighting";

    const initialX = engine.player.x;
    // Tick forward while walking right
    engine.tick({
      left: false,
      right: true,
      up: false,
      down: false,
      lightAttack: false,
      heavyAttack: false,
      kiBlast: false,
      superMove: false,
      summonShenron: false,
    });

    expect(engine.player.x).toBeGreaterThan(initialX);
    expect(engine.player.state).toBe("walk");
    expect(engine.frameCount).toBe(1);
  });

  it("handles beam clash when both fighters trigger super moves simultaneously", () => {
    const chapter = getCanonChapter(6)!;
    const engine = new CanonGameEngine({ chapter });
    engine.matchState = "fighting";

    // Set positions and states to trigger clash
    engine.player.x = -50;
    engine.enemy.x = 50;
    engine.player.state = "beam_special";
    engine.enemy.state = "beam_special";

    engine.tick({
      left: false,
      right: false,
      up: false,
      down: false,
      lightAttack: false,
      heavyAttack: false,
      kiBlast: false,
      superMove: false,
      summonShenron: false,
    });

    expect(engine.matchState as string).toBe("beam_clash");
    expect(engine.beamClash.active).toBe(true);
    expect(engine.camera.shake).toBeGreaterThan(0);
    expect(engine.onomatopoeias.length).toBeGreaterThan(0);
  });

  it("awards dragon balls on combo hits and triggers Shenron summon when 7 are collected", () => {
    const chapter = getCanonChapter(1)!;
    const engine = new CanonGameEngine({ chapter });
    engine.matchState = "fighting";

    // Simulate 7 Dragon Balls collected
    engine.dragonBallsCollected = 7;
    engine.player.hp = 20.0; // low hp

    engine.tick({
      left: false,
      right: false,
      up: false,
      down: false,
      lightAttack: false,
      heavyAttack: false,
      kiBlast: false,
      superMove: false,
      summonShenron: true, // Wish requested!
    });

    expect(engine.shenronSummoned).toBe(true);
    expect(engine.player.hp).toBe(100.0); // Full recovery!
    expect(engine.onomatopoeias.some((o) => o.text.includes("神龍召喚"))).toBe(true);
  });

  it("serializes packet for Axum 0.8 / Bevy ECS synchronizer", () => {
    const chapter = getCanonChapter(7)!;
    const engine = new CanonGameEngine({ chapter });
    const packet = engine.toBevyFramePacket();

    expect(packet.frame).toBe(0);
    expect(packet.p1.hp).toBe(100.0);
    expect(packet.p2.hp).toBe(200.0);
    expect(packet.beamClash).toBe(false);
  });
});
