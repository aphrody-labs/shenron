// SPDX-License-Identifier: Apache-2.0

import type { WebGpuRenderPacket } from "./types";
import { createSpeechBubblePath, layoutText } from "./canvas";

/**
 * Unified Renderer capable of rendering both through WebGPU and HTML5 Canvas.
 */
export class EngineRenderer {
  private ctx2d?: CanvasRenderingContext2D;

  constructor(canvas2d?: HTMLCanvasElement) {
    if (canvas2d) {
      this.ctx2d = canvas2d.getContext("2d") ?? undefined;
    }
  }

  /**
   * Renders a complete frame from a WebGpuRenderPacket to the 2D canvas.
   */
  renderFrame2D(packet: WebGpuRenderPacket, width: number, height: number): void {
    const ctx = this.ctx2d;
    if (!ctx) return;

    ctx.save();
    ctx.clearRect(0, 0, width, height);

    // Apply Camera transform with zoom and screen shake
    const cam = packet.camera;
    ctx.translate(width / 2, height / 2);
    ctx.scale(cam.zoom, cam.zoom);
    ctx.translate(-cam.centerX + cam.shakeOffsetX, -cam.centerY + cam.shakeOffsetY);

    // 1. Draw Arena Ground
    ctx.fillStyle = "#1e293b";
    ctx.fillRect(0, 0, packet.arena.width, 20);

    // Arena boundary lines
    ctx.strokeStyle = "#38bdf8";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(40, -400);
    ctx.lineTo(40, 20);
    ctx.moveTo(960, -400);
    ctx.lineTo(960, 20);
    ctx.stroke();

    // 2. Draw Fighters
    for (const f of packet.fighters) {
      ctx.save();
      ctx.translate(f.x, f.y);

      // Draw Aura Glow if ki > 20%
      if (f.kiRatio > 0.2) {
        ctx.fillStyle = `rgba(${f.auraColor[0] * 255}, ${f.auraColor[1] * 255}, ${f.auraColor[2] * 255}, ${f.kiRatio * 0.4})`;
        ctx.beginPath();
        ctx.ellipse(0, -30, 45, 65, 0, 0, Math.PI * 2);
        ctx.fill();
      }

      // Draw Fighter Hurtbox Body
      ctx.fillStyle = f.facingRight ? "#3b82f6" : "#ef4444";
      ctx.fillRect(-20, -50, 40, 50);

      // Draw Head
      ctx.fillStyle = "#fde047";
      ctx.beginPath();
      ctx.arc(0, -65, 15, 0, Math.PI * 2);
      ctx.fill();

      // Active Hitbox overlay
      if (f.activeHitbox) {
        ctx.fillStyle = "rgba(239, 68, 68, 0.4)";
        ctx.strokeStyle = "#ef4444";
        ctx.lineWidth = 2;
        ctx.strokeRect(
          f.activeHitbox.x - f.x,
          f.activeHitbox.y - f.y,
          f.activeHitbox.width,
          f.activeHitbox.height,
        );
        ctx.fillRect(
          f.activeHitbox.x - f.x,
          f.activeHitbox.y - f.y,
          f.activeHitbox.width,
          f.activeHitbox.height,
        );
      }

      ctx.restore();
    }

    // 3. Draw Particles
    for (const p of packet.particles) {
      ctx.fillStyle = `rgba(${p.color[0] * 255}, ${p.color[1] * 255}, ${p.color[2] * 255}, ${p.color[3]})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    }

    // 4. Draw Beam Clash if active
    if (packet.beamClash) {
      const c = packet.beamClash;
      // P1 Beam
      ctx.strokeStyle = `rgba(${c.p1BeamColor[0] * 255}, ${c.p1BeamColor[1] * 255}, ${c.p1BeamColor[2] * 255}, 0.9)`;
      ctx.lineWidth = 24;
      ctx.beginPath();
      ctx.moveTo(c.p1BeamStart[0], c.p1BeamStart[1]);
      ctx.lineTo(c.clashPoint[0], c.clashPoint[1]);
      ctx.stroke();

      // P2 Beam
      ctx.strokeStyle = `rgba(${c.p2BeamColor[0] * 255}, ${c.p2BeamColor[1] * 255}, ${c.p2BeamColor[2] * 255}, 0.9)`;
      ctx.lineWidth = 24;
      ctx.beginPath();
      ctx.moveTo(c.p2BeamStart[0], c.p2BeamStart[1]);
      ctx.lineTo(c.clashPoint[0], c.clashPoint[1]);
      ctx.stroke();

      // Clash Node Energy Ball
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.arc(c.clashPoint[0], c.clashPoint[1], 32, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();

    // 5. Draw HUD Overlay in screen space
    this.renderHud(packet.ui, packet.fighters, width, height);
  }

  private renderHud(
    ui: WebGpuRenderPacket["ui"],
    fighters: [WebGpuRenderPacket["fighters"][0], WebGpuRenderPacket["fighters"][1]],
    width: number,
    height: number,
  ): void {
    const ctx = this.ctx2d;
    if (!ctx) return;

    ctx.save();

    // Health Bars
    const barW = width * 0.38;
    const barH = 18;

    // P1 Health Bar
    ctx.fillStyle = "#334155";
    ctx.fillRect(20, 20, barW, barH);
    ctx.fillStyle = "#22c55e";
    ctx.fillRect(20, 20, barW * fighters[0].hpRatio, barH);
    ctx.strokeStyle = "#e2e8f0";
    ctx.lineWidth = 2;
    ctx.strokeRect(20, 20, barW, barH);

    // P1 Ki Bar
    ctx.fillStyle = "#0284c7";
    ctx.fillRect(20, 42, barW * fighters[0].kiRatio, 8);

    // P2 Health Bar
    const p2X = width - 20 - barW;
    ctx.fillStyle = "#334155";
    ctx.fillRect(p2X, 20, barW, barH);
    ctx.fillStyle = "#22c55e";
    ctx.fillRect(p2X + barW * (1 - fighters[1].hpRatio), 20, barW * fighters[1].hpRatio, barH);
    ctx.strokeRect(p2X, 20, barW, barH);

    // P2 Ki Bar
    ctx.fillStyle = "#0284c7";
    ctx.fillRect(p2X + barW * (1 - fighters[1].kiRatio), 42, barW * fighters[1].kiRatio, 8);

    // Fighter Names
    ctx.fillStyle = "#f8fafc";
    ctx.font = "bold 14px sans-serif";
    ctx.fillText(fighters[0].name, 20, 15);
    ctx.textAlign = "right";
    ctx.fillText(fighters[1].name, width - 20, 15);

    // Winner banner
    if (ui.winner !== undefined) {
      ctx.textAlign = "center";
      ctx.font = "bold 36px sans-serif";
      ctx.fillStyle = "#facc15";
      const winText = ui.winner === 1 ? "PLAYER 1 WINS!" : ui.winner === 2 ? "PLAYER 2 WINS!" : "DRAW!";
      ctx.fillText(winText, width / 2, height / 2 - 20);
    }

    ctx.restore();
  }
}
