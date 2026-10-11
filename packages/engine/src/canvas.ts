// SPDX-License-Identifier: Apache-2.0

/**
 * 2D Vector canvas, manga/comic speech bubble procedural generator,
 * and Japanese/Western typography typesetting.
 */

export interface Vector2D {
  x: number;
  y: number;
}

export type PathCommand =
  | { type: "move"; to: Vector2D }
  | { type: "line"; to: Vector2D }
  | { type: "quad"; ctrl: Vector2D; to: Vector2D }
  | { type: "cubic"; ctrl1: Vector2D; ctrl2: Vector2D; to: Vector2D }
  | { type: "close" };

export class VectorPath {
  commands: PathCommand[] = [];

  moveTo(x: number, y: number): this {
    this.commands.push({ type: "move", to: { x, y } });
    return this;
  }

  lineTo(x: number, y: number): this {
    this.commands.push({ type: "line", to: { x, y } });
    return this;
  }

  quadTo(cpx: number, cpy: number, x: number, y: number): this {
    this.commands.push({ type: "quad", ctrl: { x: cpx, y: cpy }, to: { x, y } });
    return this;
  }

  cubicTo(cp1x: number, cp1y: number, cp2x: number, cp2y: number, x: number, y: number): this {
    this.commands.push({
      type: "cubic",
      ctrl1: { x: cp1x, y: cp1y },
      ctrl2: { x: cp2x, y: cp2y },
      to: { x, y },
    });
    return this;
  }

  close(): this {
    this.commands.push({ type: "close" });
    return this;
  }

  rect(x: number, y: number, w: number, h: number): this {
    this.moveTo(x, y);
    this.lineTo(x + w, y);
    this.lineTo(x + w, y + h);
    this.lineTo(x, y + h);
    this.close();
    return this;
  }

  roundedRect(x: number, y: number, w: number, h: number, r: number): this {
    const rad = Math.min(r, w / 2, h / 2);
    this.moveTo(x + rad, y);
    this.lineTo(x + w - rad, y);
    this.quadTo(x + w, y, x + w, y + rad);
    this.lineTo(x + w, y + h - rad);
    this.quadTo(x + w, y + h, x + w - rad, y + h);
    this.lineTo(x + rad, y + h);
    this.quadTo(x, y + h, x, y + h - rad);
    this.lineTo(x, y + rad);
    this.quadTo(x, y, x + rad, y);
    this.close();
    return this;
  }

  ellipse(cx: number, cy: number, rx: number, ry: number, segments = 32): this {
    for (let i = 0; i < segments; i++) {
      const theta = (i / segments) * Math.PI * 2;
      const px = cx + Math.cos(theta) * rx;
      const py = cy + Math.sin(theta) * ry;
      if (i === 0) this.moveTo(px, py);
      else this.lineTo(px, py);
    }
    this.close();
    return this;
  }
}

export type BubbleStyle = "normal" | "shout" | "thought";

/**
 * Procedural manga speech bubble contour generator.
 */
export function createSpeechBubblePath(
  x: number,
  y: number,
  w: number,
  h: number,
  style: BubbleStyle = "normal",
  tailTip?: Vector2D,
): VectorPath {
  const path = new VectorPath();
  const cx = x + w / 2;
  const cy = y + h / 2;
  const rx = w / 2;
  const ry = h / 2;

  if (style === "normal") {
    const n = 32;
    const points: Vector2D[] = [];
    for (let i = 0; i < n; i++) {
      const theta = (i / n) * Math.PI * 2;
      points.push({ x: cx + Math.cos(theta) * rx, y: cy + Math.sin(theta) * ry });
    }

    if (tailTip) {
      const tailAngle = Math.atan2(tailTip.y - cy, tailTip.x - cx);
      const halfSpan = 0.25;
      path.moveTo(points[0].x, points[0].y);
      let emitted = false;

      for (const p of points) {
        const angle = Math.atan2(p.y - cy, p.x - cx);
        if (Math.abs(angle - tailAngle) < halfSpan && !emitted) {
          path.lineTo(
            cx + Math.cos(tailAngle - halfSpan) * rx,
            cy + Math.sin(tailAngle - halfSpan) * ry,
          );
          path.lineTo(tailTip.x, tailTip.y);
          path.lineTo(
            cx + Math.cos(tailAngle + halfSpan) * rx,
            cy + Math.sin(tailAngle + halfSpan) * ry,
          );
          emitted = true;
        } else {
          path.lineTo(p.x, p.y);
        }
      }
      path.close();
    } else {
      path.ellipse(cx, cy, rx, ry, 32);
    }
  } else if (style === "shout") {
    // Jagged explosive polygon
    const spikes = 16;
    for (let i = 0; i < spikes; i++) {
      const t0 = (i / spikes) * Math.PI * 2;
      const tMid = ((i + 0.5) / spikes) * Math.PI * 2;

      const pInner = {
        x: cx + Math.cos(t0) * (rx * 0.75),
        y: cy + Math.sin(t0) * (ry * 0.75),
      };
      const pOuter = {
        x: cx + Math.cos(tMid) * (rx * 1.2),
        y: cy + Math.sin(tMid) * (ry * 1.2),
      };

      if (i === 0) path.moveTo(pInner.x, pInner.y);
      else path.lineTo(pInner.x, pInner.y);
      path.lineTo(pOuter.x, pOuter.y);
    }
    path.close();
  } else if (style === "thought") {
    // Cloud arcs
    const arcs = 10;
    for (let i = 0; i < arcs; i++) {
      const t0 = (i / arcs) * Math.PI * 2;
      const t1 = ((i + 1) / arcs) * Math.PI * 2;
      const p0 = { x: cx + Math.cos(t0) * rx, y: cy + Math.sin(t0) * ry };
      const p1 = { x: cx + Math.cos(t1) * rx, y: cy + Math.sin(t1) * ry };
      const mid = {
        x: (p0.x + p1.x) / 2 + (p0.x + p1.x - cx * 2) * 0.3,
        y: (p0.y + p1.y) / 2 + (p0.y + p1.y - cy * 2) * 0.3,
      };
      if (i === 0) path.moveTo(p0.x, p0.y);
      path.quadTo(mid.x, mid.y, p1.x, p1.y);
    }
    path.close();
  }

  return path;
}

export interface TextGlyph {
  char: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Japanese manga vertical (Tatechūyoko) and horizontal text typesetting.
 */
export function layoutText(
  text: string,
  startX: number,
  startY: number,
  fontSize = 16,
  vertical = false,
  maxExtent = 200,
): TextGlyph[] {
  const glyphs: TextGlyph[] = [];
  const lineSpacing = fontSize * 1.3;

  if (!vertical) {
    let curX = startX;
    let curY = startY;

    for (const char of text) {
      if (char === "\n") {
        curX = startX;
        curY += lineSpacing;
        continue;
      }
      const isAscii = char.charCodeAt(0) < 128;
      const adv = isAscii ? fontSize * 0.55 : fontSize * 1.05;

      if (curX + adv > startX + maxExtent && curX > startX) {
        curX = startX;
        curY += lineSpacing;
      }

      glyphs.push({ char, x: curX, y: curY, width: adv, height: fontSize });
      curX += adv;
    }
  } else {
    // Vertical columns progressing Right-to-Left
    let curX = startX;
    let curY = startY;

    for (const char of text) {
      if (char === "\n") {
        curY = startY;
        curX -= lineSpacing;
        continue;
      }
      const adv = fontSize * 1.1;

      if (curY + adv > startY + maxExtent && curY > startY) {
        curY = startY;
        curX -= lineSpacing;
      }

      glyphs.push({ char, x: curX, y: curY, width: fontSize, height: adv });
      curY += adv;
    }
  }

  return glyphs;
}
