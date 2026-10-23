/**
 * Game card primitive: a header (title, subtitle, badge, status) over a stack of blocks that
 * every game composes (word tiles, lives, keyboard, number line, board grid, scoreboard...).
 * The height follows the blocks. Every text arrives localized in the spec.
 */
import type { Image, SKRSContext2D } from "@napi-rs/canvas";
import { rgba } from "~/lib/canvas-kit";
import { drawAvatar, drawBall, drawChip, drawPanel, drawSparkle, hashSeed, rrect } from "../draw";
import { avatarImage } from "../images";
import { renderCard } from "../surface";
import { lighten, mix, normalizeHex, type RenderPalette } from "../theme";
import { drawText, fitSize, num, shout, title, ui } from "../text";
import type { RenderOptions, RenderedCard } from "../types";
import { finishShell, paintShell, resolveOptions } from "./chrome";
import { toneColor, type Tone } from "./balance";

export type { Tone } from "./balance";

export const GAME_CARD_WIDTH = 960;
const PAD = 36;
const HEADER_HEIGHT = 112;
const BLOCK_GAP = 18;

export interface TileCell {
  /** Letter or symbol printed on the tile when shown. */
  char: string;
  /** `hidden`: blank tile; `revealed`: found; `missed`: shown after a loss; `gap`: space. */
  state: "hidden" | "revealed" | "missed" | "gap";
}

export interface GridCell {
  text?: string;
  tone?: Tone;
  /** Winning or selected cell. */
  highlight?: boolean;
}

export interface ScorePlayer {
  name: string;
  avatarUrl?: string | null;
  /** Already formatted score ("3", "120 Z"). */
  score: string;
  /** Player whose turn it is. */
  active?: boolean;
  tone?: Tone;
}

export type GameBlock =
  | { type: "tiles"; cells: readonly TileCell[] }
  | { type: "lives"; label: string; total: number; left: number }
  | {
      type: "keyboard";
      rows: readonly string[];
      hit: ReadonlySet<string>;
      miss: ReadonlySet<string>;
    }
  | {
      type: "range";
      min: number;
      max: number;
      lo: number;
      hi: number;
      guesses: ReadonlyArray<{ value: number; tone: Tone }>;
      /** Revealed answer (end of game). */
      target?: number;
    }
  | { type: "pips"; label: string; total: number; used: number }
  | { type: "callout"; text: string; tone?: Tone }
  | {
      type: "grid";
      rows: number;
      cols: number;
      cells: readonly GridCell[];
      cellSize?: number;
    }
  | { type: "scoreboard"; players: readonly ScorePlayer[]; versus?: string | null }
  | { type: "stats"; items: ReadonlyArray<{ label: string; value: string; tone?: Tone }> };

export interface GameCardSpec {
  title: string;
  subtitle?: string | null;
  /** Small pill at the top right (difficulty, mode). */
  badge?: { label: string; tone?: Tone } | null;
  /** Result or turn line under the badge ("Victory", "Your turn"). */
  status?: { label: string; tone?: Tone } | null;
  /** Footer line (rewards, hint). */
  footer?: string | null;
  accent?: string;
  blocks: readonly GameBlock[];
}

interface Env {
  palette: RenderPalette;
  accent: string;
  avatars: ReadonlyMap<string, Image | null>;
  locale: string;
}

interface Layout {
  height: number;
  draw: (ctx: SKRSContext2D, x: number, y: number, w: number) => void;
}

const tone = (value: Tone | undefined, palette: RenderPalette, fallback: string): string =>
  value ? toneColor(value, palette) : fallback;

function layoutTiles(cells: readonly TileCell[], env: Env): Layout {
  const { palette } = env;
  return {
    height: 84,
    draw(ctx, x, y, w) {
      const gapRatio = 0.16;
      const units = cells.reduce((n, c) => n + (c.state === "gap" ? 0.5 : 1), 0);
      const size = Math.min(64, w / (units + Math.max(0, cells.length - 1) * gapRatio));
      const gap = size * gapRatio;
      const total = units * size + Math.max(0, cells.length - 1) * gap;
      const tileH = size * 1.2;
      let cx = x + (w - total) / 2;
      const top = y + (84 - tileH) / 2;
      for (const cell of cells) {
        if (cell.state === "gap") {
          cx += size * 0.5 + gap;
          continue;
        }
        const shown = cell.state === "revealed";
        const missed = cell.state === "missed";
        const color = shown ? palette.title : missed ? palette.red : palette.dim;
        rrect(ctx, cx + 3, top + 3, size, tileH, 9);
        ctx.fillStyle = rgba(palette.ink, 0.6);
        ctx.fill();
        rrect(ctx, cx, top, size, tileH, 9);
        ctx.fillStyle = shown
          ? mix(palette.card, palette.title, 0.2)
          : missed
            ? mix(palette.card, palette.red, 0.2)
            : palette.card;
        ctx.fill();
        ctx.lineWidth = 2.5;
        ctx.strokeStyle = shown || missed ? color : rgba(palette.os, 0.4);
        ctx.stroke();
        if (shown || missed) {
          drawText(ctx, cell.char.toLocaleUpperCase(), cx + size / 2, top + tileH / 2 + 2, {
            font: num(Math.round(size * 0.92)),
            fill: color,
            align: "center",
            baseline: "middle",
            stroke: { color: palette.ink, width: 5 },
          });
        } else {
          ctx.fillStyle = env.accent;
          ctx.fillRect(cx + size * 0.26, top + tileH - 13, size * 0.48, 4);
        }
        cx += size + gap;
      }
    },
  };
}

function layoutLives(block: Extract<GameBlock, { type: "lives" }>, env: Env): Layout {
  const { palette } = env;
  return {
    height: 48,
    draw(ctx, x, y, w) {
      const mid = y + 24;
      drawText(ctx, shout(block.label), x, mid, {
        font: ui(700, 13),
        fill: palette.muted,
        baseline: "middle",
        spacing: "2px",
      });
      ctx.font = ui(700, 13);
      ctx.save();
      ctx.letterSpacing = "2px";
      const labelW = ctx.measureText(shout(block.label)).width;
      ctx.restore();
      const step = Math.min(50, (w - labelW - 120) / Math.max(1, block.total));
      for (let i = 0; i < block.total; i++) {
        const cx = x + labelW + 34 + i * step;
        if (i < block.left) {
          drawBall(ctx, palette, cx, mid, 18, Math.min(7, i + 1));
        } else {
          ctx.beginPath();
          ctx.arc(cx, mid, 17, 0, Math.PI * 2);
          ctx.fillStyle = rgba(palette.os, 0.05);
          ctx.fill();
          ctx.lineWidth = 2;
          ctx.setLineDash([4, 4]);
          ctx.strokeStyle = rgba(palette.muted, 0.6);
          ctx.stroke();
          ctx.setLineDash([]);
        }
      }
      drawText(ctx, `${block.left} / ${block.total}`, x + w, mid + 2, {
        font: num(34),
        fill: block.left <= 1 ? palette.red : palette.title,
        align: "right",
        baseline: "middle",
        stroke: { color: palette.ink, width: 5 },
      });
    },
  };
}

function layoutKeyboard(block: Extract<GameBlock, { type: "keyboard" }>, env: Env): Layout {
  const { palette } = env;
  const keyH = 46;
  const gap = 8;
  return {
    height: block.rows.length * (keyH + gap) - gap,
    draw(ctx, x, y, w) {
      block.rows.forEach((row, r) => {
        const letters = [...row];
        const keyW = Math.min(64, (w - (letters.length - 1) * gap) / letters.length);
        const rowW = letters.length * keyW + (letters.length - 1) * gap;
        letters.forEach((letter, j) => {
          const kx = x + (w - rowW) / 2 + j * (keyW + gap);
          const ky = y + r * (keyH + gap);
          const hit = block.hit.has(letter);
          const miss = block.miss.has(letter);
          rrect(ctx, kx + 2, ky + 2.5, keyW, keyH, 8);
          ctx.fillStyle = rgba(palette.ink, 0.55);
          ctx.fill();
          rrect(ctx, kx, ky, keyW, keyH, 8);
          ctx.fillStyle = hit
            ? palette.title
            : miss
              ? mix(palette.card, palette.red, 0.22)
              : palette.card;
          ctx.fill();
          ctx.lineWidth = 2;
          ctx.strokeStyle = hit ? palette.ink : miss ? palette.red : rgba(palette.os, 0.35);
          ctx.stroke();
          drawText(ctx, letter.toLocaleUpperCase(), kx + keyW / 2, ky + keyH / 2 + 2, {
            font: num(32),
            fill: hit ? palette.ink : miss ? lighten(palette.red, 0.3) : palette.text,
            align: "center",
            baseline: "middle",
          });
          if (miss) {
            ctx.beginPath();
            ctx.moveTo(kx + keyW * 0.22, ky + keyH * 0.76);
            ctx.lineTo(kx + keyW * 0.78, ky + keyH * 0.24);
            ctx.lineWidth = 2.5;
            ctx.strokeStyle = rgba(palette.red, 0.85);
            ctx.stroke();
          }
        });
      });
    },
  };
}

function layoutRange(block: Extract<GameBlock, { type: "range" }>, env: Env): Layout {
  const { palette } = env;
  return {
    height: 100,
    draw(ctx, x, y, w) {
      const barY = y + 46;
      const barH = 22;
      const span = Math.max(1, block.max - block.min);
      const at = (v: number) => x + ((v - block.min) / span) * w;
      rrect(ctx, x + 3, barY + 3, w, barH, barH / 2);
      ctx.fillStyle = rgba(palette.ink, 0.55);
      ctx.fill();
      rrect(ctx, x, barY, w, barH, barH / 2);
      ctx.fillStyle = palette.card;
      ctx.fill();
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = rgba(palette.os, 0.5);
      ctx.stroke();
      if (block.lo <= block.hi) {
        let xa = at(block.lo);
        let xb = at(block.hi);
        if (xb - xa < 10) {
          const mid = (xa + xb) / 2;
          xa = mid - 5;
          xb = mid + 5;
        }
        rrect(ctx, xa, barY, xb - xa, barH, barH / 2);
        ctx.fillStyle = env.accent;
        ctx.fill();
        ctx.lineWidth = 2.5;
        ctx.strokeStyle = palette.ink;
        ctx.stroke();
        const label = block.lo === block.hi ? `${block.lo}` : `${block.lo} \u2013 ${block.hi}`;
        const lx = Math.min(x + w - 50, Math.max(x + 50, (xa + xb) / 2));
        drawText(ctx, label, lx, y + 30, {
          font: num(34),
          fill: palette.title,
          align: "center",
          stroke: { color: palette.ink, width: 6 },
        });
      }
      for (const guess of block.guesses) {
        const gx = at(guess.value);
        ctx.beginPath();
        ctx.moveTo(gx, barY - 7);
        ctx.lineTo(gx, barY + barH + 7);
        ctx.lineWidth = 3;
        ctx.strokeStyle = guess.tone === "good" ? palette.title : rgba(palette.red, 0.9);
        ctx.stroke();
      }
      if (block.target !== undefined) {
        const tx = at(block.target);
        ctx.beginPath();
        ctx.arc(tx, barY + barH / 2, 11, 0, Math.PI * 2);
        ctx.fillStyle = palette.title;
        ctx.fill();
        ctx.lineWidth = 3;
        ctx.strokeStyle = palette.ink;
        ctx.stroke();
      }
      for (const [label, align, lx] of [
        [String(block.min), "left", x],
        [String(block.max), "right", x + w],
      ] as const) {
        drawText(ctx, label, lx, y + 96, {
          font: num(24),
          fill: palette.muted,
          align,
          stroke: { color: palette.ink, width: 4 },
        });
      }
    },
  };
}

function layoutPips(block: Extract<GameBlock, { type: "pips" }>, env: Env): Layout {
  const { palette } = env;
  return {
    height: 34,
    draw(ctx, x, y) {
      const mid = y + 17;
      drawText(ctx, shout(block.label), x, mid, {
        font: ui(700, 13),
        fill: palette.muted,
        baseline: "middle",
        spacing: "2px",
      });
      ctx.save();
      ctx.font = ui(700, 13);
      ctx.letterSpacing = "2px";
      const labelW = ctx.measureText(shout(block.label)).width;
      ctx.restore();
      for (let i = 0; i < block.total; i++) {
        const cx = x + labelW + 30 + i * 28;
        ctx.beginPath();
        ctx.arc(cx, mid, 9.5, 0, Math.PI * 2);
        if (i < block.used) {
          ctx.fillStyle = env.accent;
          ctx.fill();
        }
        ctx.lineWidth = 2.5;
        ctx.strokeStyle = i < block.used ? palette.ink : rgba(palette.os, 0.6);
        ctx.stroke();
      }
    },
  };
}

function layoutCallout(block: Extract<GameBlock, { type: "callout" }>, env: Env): Layout {
  const { palette } = env;
  return {
    height: 62,
    draw(ctx, x, y, w) {
      const color = tone(block.tone, palette, env.accent);
      const text = shout(block.text);
      const size = fitSize(ctx, text, w - 80, num, 58, 28);
      drawText(ctx, text, x + w / 2, y + 48, {
        font: num(size),
        fill: color,
        align: "center",
        maxWidth: w - 80,
        stroke: { color: palette.ink, width: 9 },
        shadow: { color: rgba(palette.ink, 0.7), dx: 4, dy: 5 },
      });
      drawSparkle(ctx, x + 22, y + 26, 14, rgba(color, 0.9));
      drawSparkle(ctx, x + w - 22, y + 26, 14, rgba(color, 0.9));
    },
  };
}

function layoutGrid(block: Extract<GameBlock, { type: "grid" }>, env: Env): Layout {
  const { palette } = env;
  const size = block.cellSize ?? 92;
  const gap = 10;
  return {
    height: block.rows * (size + gap) - gap,
    draw(ctx, x, y, w) {
      const gridW = block.cols * (size + gap) - gap;
      const left = x + (w - gridW) / 2;
      for (let r = 0; r < block.rows; r++) {
        for (let c = 0; c < block.cols; c++) {
          const cell = block.cells[r * block.cols + c] ?? {};
          const cx = left + c * (size + gap);
          const cy = y + r * (size + gap);
          const color = tone(cell.tone, palette, palette.text);
          rrect(ctx, cx + 3, cy + 3.5, size, size, 12);
          ctx.fillStyle = rgba(palette.ink, 0.6);
          ctx.fill();
          rrect(ctx, cx, cy, size, size, 12);
          ctx.fillStyle = cell.highlight ? mix(palette.card, color, 0.3) : palette.card;
          ctx.fill();
          ctx.lineWidth = 3;
          ctx.strokeStyle = cell.highlight ? color : rgba(palette.os, 0.45);
          ctx.stroke();
          if (cell.text) {
            drawText(ctx, cell.text, cx + size / 2, cy + size / 2 + 3, {
              font: num(Math.round(size * 0.82)),
              fill: color,
              align: "center",
              baseline: "middle",
              stroke: { color: palette.ink, width: 7 },
            });
          }
        }
      }
    },
  };
}

function layoutScoreboard(block: Extract<GameBlock, { type: "scoreboard" }>, env: Env): Layout {
  const { palette } = env;
  return {
    height: 92,
    draw(ctx, x, y, w) {
      const count = Math.max(1, block.players.length);
      const gap = block.versus ? 64 : 16;
      const cellW = (w - gap * (count - 1)) / count;
      block.players.forEach((player, i) => {
        const px = x + i * (cellW + gap);
        const color = tone(player.tone, palette, env.accent);
        drawPanel(ctx, palette, px, y, cellW, 84, {
          accent: player.active ? color : undefined,
          line: player.active ? color : undefined,
          lineAlpha: player.active ? 1 : 0.5,
          fill: player.active ? rgba(mix(palette.card, color, 0.25), 0.95) : undefined,
        });
        drawAvatar(ctx, palette, px + 50, y + 42, 26, env.avatars.get(player.name) ?? null, {
          ring: color,
          seed: hashSeed(player.name),
          name: player.name,
          ringWidth: 3,
        });
        drawText(ctx, player.name, px + 94, y + 38, {
          font: num(28),
          fill: palette.text,
          maxWidth: cellW - 110,
          stroke: { color: palette.ink, width: 5 },
        });
        drawText(ctx, player.score, px + 94, y + 70, {
          font: num(32),
          fill: player.active ? palette.title : palette.muted,
          maxWidth: cellW - 110,
          stroke: { color: palette.ink, width: 5 },
        });
        if (block.versus && i < count - 1) {
          drawText(ctx, shout(block.versus), px + cellW + gap / 2, y + 44, {
            font: num(34),
            fill: palette.title,
            align: "center",
            baseline: "middle",
            stroke: { color: palette.ink, width: 6 },
          });
        }
      });
    },
  };
}

function layoutStats(block: Extract<GameBlock, { type: "stats" }>, env: Env): Layout {
  const { palette } = env;
  return {
    height: 74,
    draw(ctx, x, y, w) {
      const count = Math.max(1, block.items.length);
      drawPanel(ctx, palette, x, y, w, 68, { accent: env.accent });
      const cell = w / count;
      block.items.forEach((item, i) => {
        const cx = x + cell * i;
        if (i > 0) {
          ctx.fillStyle = rgba(palette.os, 0.16);
          ctx.fillRect(cx - 1, y + 12, 2, 44);
        }
        drawText(ctx, shout(item.label), cx + cell / 2, y + 24, {
          font: ui(700, 11.5),
          fill: palette.muted,
          align: "center",
          spacing: "1.6px",
          maxWidth: cell - 16,
        });
        drawText(ctx, item.value, cx + cell / 2, y + 55, {
          font: num(34),
          fill: tone(item.tone, palette, palette.text),
          align: "center",
          maxWidth: cell - 16,
          stroke: { color: palette.ink, width: 5 },
        });
      });
    },
  };
}

function layoutBlock(block: GameBlock, env: Env): Layout {
  switch (block.type) {
    case "tiles":
      return layoutTiles(block.cells, env);
    case "lives":
      return layoutLives(block, env);
    case "keyboard":
      return layoutKeyboard(block, env);
    case "range":
      return layoutRange(block, env);
    case "pips":
      return layoutPips(block, env);
    case "callout":
      return layoutCallout(block, env);
    case "grid":
      return layoutGrid(block, env);
    case "scoreboard":
      return layoutScoreboard(block, env);
    case "stats":
      return layoutStats(block, env);
  }
}

/** Height of a card with these blocks, before rendering (for tests and message layout). */
export function gameCardHeight(spec: GameCardSpec): number {
  // layouts only need the palette for drawing; heights do not depend on the context
  const env: Env = {
    palette: undefined as unknown as RenderPalette,
    accent: "",
    avatars: new Map(),
    locale: "fr",
  };
  const body = spec.blocks.reduce((sum, block) => sum + layoutBlock(block, env).height, 0);
  return HEADER_HEIGHT + body + BLOCK_GAP * spec.blocks.length + (spec.footer ? 30 : 0) + 18;
}

export async function renderGameCard(
  spec: GameCardSpec,
  options: RenderOptions = {},
): Promise<RenderedCard> {
  const { palette, images, locale } = resolveOptions(options);
  const accent = normalizeHex(spec.accent) ?? palette.orange;
  const width = GAME_CARD_WIDTH;
  const height = gameCardHeight(spec);

  return renderCard(width, height, options, async ({ ctx }) => {
    const players = spec.blocks.flatMap((block) =>
      block.type === "scoreboard" ? block.players : [],
    );
    const loaded = await Promise.all(
      players.map(
        async (player) => [player.name, await avatarImage(images, player.avatarUrl)] as const,
      ),
    );
    const env: Env = { palette, accent, avatars: new Map(loaded), locale };

    paintShell(ctx, palette, {
      width,
      height,
      image: null,
      gradient: [mix(palette.bg, accent, 0.16), mix(palette.bg, palette.orange, 0.26), palette.bg],
      focal: { x: width - 120, y: 40 },
      accent,
      seed: hashSeed(spec.title),
    });

    const titleText = shout(spec.title);
    const size = fitSize(ctx, titleText, 560, (px) => title(titleText, px), 54, 30);
    drawText(ctx, titleText, PAD, 70, {
      font: title(titleText, size),
      fill: palette.title,
      stroke: { color: palette.ink, width: 9 },
      shadow: { color: rgba(palette.ink, 0.7), dx: 3, dy: 4 },
      spacing: "1px",
    });
    if (spec.subtitle) {
      drawText(ctx, spec.subtitle, PAD + 2, 98, {
        font: ui(600, 16),
        fill: palette.text,
        maxWidth: 560,
        stroke: { color: rgba(palette.ink, 0.8), width: 4 },
      });
    }
    if (spec.badge) {
      const color = tone(spec.badge.tone, palette, accent);
      ctx.font = ui(700, 14);
      ctx.save();
      ctx.letterSpacing = "1.2px";
      const badgeW = ctx.measureText(shout(spec.badge.label)).width + 34;
      ctx.restore();
      drawChip(ctx, shout(spec.badge.label), width - PAD - badgeW, 32, {
        font: ui(700, 14),
        color: lighten(color, 0.5),
        fill: mix(palette.card, color, 0.3),
        line: color,
        spacing: "1.2px",
        height: 32,
        shadow: rgba(palette.ink, 0.6),
      });
    }
    if (spec.status) {
      drawText(ctx, shout(spec.status.label), width - PAD, 98, {
        font: num(38),
        fill: tone(spec.status.tone, palette, palette.title),
        align: "right",
        stroke: { color: palette.ink, width: 7 },
      });
    }

    let y = HEADER_HEIGHT;
    for (const block of spec.blocks) {
      const layout = layoutBlock(block, env);
      layout.draw(ctx, PAD, y, width - PAD * 2);
      y += layout.height + BLOCK_GAP;
    }
    if (spec.footer) {
      drawText(ctx, spec.footer, PAD, height - 22, {
        font: ui(600, 14),
        fill: palette.muted,
        maxWidth: width - PAD * 2,
        stroke: { color: rgba(palette.ink, 0.8), width: 4 },
      });
    }
    finishShell(ctx, palette, width, height, accent);
  });
}
