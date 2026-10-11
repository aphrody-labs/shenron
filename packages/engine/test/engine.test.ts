// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "bun:test";
import {
  DragonPixelEngine,
  getFighterDef,
  getMoveFrameData,
  getStoryChapters,
  createSpeechBubblePath,
  layoutText,
  VectorPath,
  createWasmGameEngine,
} from "../src";

describe("@aphrody/shenron-engine — Unified Full-Stack Game Engine", () => {
  it("retrieves canonical fighters and authentic portrait assets", () => {
    const goku = getFighterDef("goku");
    expect(goku.name).toBe("Son Goku");
    expect(goku.signatureBeam).toBe("Kamehameha");
    expect(goku.portraitUrl).toBe("/games/dragon-pixel/portraits/GOK.png");

    const vegeta = getFighterDef("vegeta");
    expect(vegeta.name).toBe("Vegeta");
    expect(vegeta.signatureBeam).toBe("Galick Gun");
    expect(vegeta.portraitUrl).toBe("/games/dragon-pixel/portraits/VGT.png");
  });

  it("provides canonical 42-volume manga story chapters", () => {
    const chapters = getStoryChapters();
    expect(chapters.length).toBeGreaterThanOrEqual(4);
    expect(chapters[0].volume).toBe(1);
    expect(chapters[chapters.length - 1].volume).toBe(42);
  });

  it("calculates exact deterministic frame data phases", () => {
    const jab = getMoveFrameData("light_jab");
    expect(jab.startupFrames).toBe(4);
    expect(jab.activeFrames).toBe(3);
    expect(jab.recoveryFrames).toBe(7);
    expect(jab.damage).toBe(400);
    expect(jab.hitbox).toBeDefined();
  });

  it("simulates deterministic 60 FPS combat ticks and damage", () => {
    const engine = new DragonPixelEngine("goku", "vegeta", "cell_games", "versus");
    expect(engine.p1.x).toBe(250);
    expect(engine.p2.x).toBe(750);
    expect(engine.p1.hp).toBe(10000);
    expect(engine.p2.hp).toBe(9500);

    // P1 moves forward
    engine.tick(
      {
        left: false,
        right: true,
        up: false,
        down: false,
        lightAttack: false,
        heavyAttack: false,
        special: false,
        ultimate: false,
        block: false,
        dash: false,
      },
      {
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
      },
    );

    expect(engine.p1.x).toBeGreaterThan(250);
    expect(engine.frameCount).toBe(1);
  });

  it("generates comprehensive WebGPU render packets", () => {
    const engine = new DragonPixelEngine("gohan", "cell", "cell_games", "versus");
    const packet = engine.getRenderPacket();

    expect(packet.arena.arenaId).toBe("cell_games");
    expect(packet.fighters.length).toBe(2);
    expect(packet.fighters[0].name).toBe("Son Gohan (SSJ2)");
    expect(packet.fighters[1].name).toBe("Perfect Cell");
    expect(packet.camera.zoom).toBeGreaterThan(0);
    expect(packet.ui.matchFrame).toBe(0);
  });

  it("generates procedural manga speech bubble contours", () => {
    const shoutBubble = createSpeechBubblePath(100, 100, 200, 150, "shout");
    expect(shoutBubble.commands.length).toBeGreaterThanOrEqual(16);

    const normalWithTail = createSpeechBubblePath(100, 100, 200, 150, "normal", { x: 50, y: 300 });
    expect(normalWithTail.commands.length).toBeGreaterThan(10);
  });

  it("typesets text in both horizontal and vertical Japanese modes", () => {
    const horizontal = layoutText("Dragon Ball", 0, 0, 16, false, 200);
    expect(horizontal.length).toBe(11);
    expect(horizontal[1].x).toBeGreaterThan(horizontal[0].x);

    const vertical = layoutText("かめはめ波", 100, 0, 20, true, 200);
    expect(vertical.length).toBe(5);
    expect(vertical[1].y).toBeGreaterThan(vertical[0].y);
  });

  it("runs the WASM/TS bridge asynchronously", async () => {
    const bridge = await createWasmGameEngine("trunks", "frieza", "namek", "versus");
    expect(bridge.isMatchOver()).toBe(false);

    bridge.tick(
      {
        left: false,
        right: true,
        up: false,
        down: false,
        lightAttack: true,
        heavyAttack: false,
        special: false,
        ultimate: false,
        block: false,
        dash: false,
      },
      {
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
      },
    );

    const packet = bridge.getRenderPacket();
    expect(packet.fighters[0].name).toBe("Future Trunks");
    expect(packet.fighters[1].name).toBe("Frieza");
  });

  it("manages unified canvas engine viewport, pan, zoom and coordinates", () => {
    const { ShenronCanvasEngine } = require("../src");
    const engine = new ShenronCanvasEngine({ preference: "canvas2d" });
    const vp = engine.getViewport();
    expect(vp.zoom).toBe(1);
    expect(vp.panX).toBe(0);
    expect(vp.panY).toBe(0);

    engine.setZoom(2);
    expect(engine.getViewport().zoom).toBe(2);

    engine.setPan(50, -30);
    expect(engine.getViewport().panX).toBe(50);
    expect(engine.getViewport().panY).toBe(-30);

    const world = engine.screenToWorld({ x: 450, y: 270 });
    const screen = engine.worldToScreen(world);
    expect(Math.round(screen.x)).toBe(450);
    expect(Math.round(screen.y)).toBe(270);

    engine.resetView();
    expect(engine.getViewport().zoom).toBe(1);
  });

  it("renders procedural manga boards and speech bubbles", () => {
    const { ShenronCanvasEngine } = require("../src");
    const engine = new ShenronCanvasEngine({ preference: "canvas2d" });

    // Mock canvas and 2D context
    const mockCtx = {
      save: () => {},
      restore: () => {},
      scale: () => {},
      translate: () => {},
      rotate: () => {},
      clearRect: () => {},
      fillRect: () => {},
      strokeRect: () => {},
      beginPath: () => {},
      closePath: () => {},
      moveTo: () => {},
      lineTo: () => {},
      quadraticCurveTo: () => {},
      bezierCurveTo: () => {},
      fill: () => {},
      stroke: () => {},
      fillText: () => {},
      rect: () => {},
      clip: () => {},
      arc: () => {},
      createRadialGradient: () => ({ addColorStop: () => {} }),
    };

    const mockCanvas = {
      width: 800,
      height: 600,
      style: {},
      getContext: () => mockCtx,
    };

    engine.initialize(mockCanvas as any);
    expect(engine.getBackend()).toBe("canvas2d");

    // Render manga board with panels and speech bubbles
    engine.renderMangaBoard({
      width: 800,
      height: 600,
      background: "#ffffff",
      panels: [
        { id: "p1", x: 20, y: 20, width: 360, height: 560, borderWidth: 3, screentone: "dots" },
        { id: "p2", x: 400, y: 20, width: 380, height: 270, borderWidth: 3, screentone: "lines" },
      ],
      bubbles: [
        {
          id: "b1",
          x: 60,
          y: 60,
          width: 140,
          height: 100,
          style: "shout",
          text: "KA-ME-HA-ME-HA!",
          fontSize: 16,
        },
        {
          id: "b2",
          x: 440,
          y: 60,
          width: 120,
          height: 140,
          style: "normal",
          text: "かめはめ波",
          vertical: true,
          fontSize: 18,
        },
      ],
    });

    // Render Ki Effect
    engine.renderKiEffect({ count: 50, baseColor: "#a855f7", accentColor: "#38bdf8" });
    engine.dispose();
  });
});
