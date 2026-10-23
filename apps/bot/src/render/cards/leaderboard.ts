/**
 * Leaderboard card (1000 x 640): header, podium of the first three (page 1) and a list of
 * the others with avatars and relative bars. Texts arrive localized from the caller.
 */
import type { SKRSContext2D } from "@napi-rs/canvas";
import { rgba } from "~/lib/canvas-kit";
import { drawAvatar, drawBall, drawChip, drawPanel, drawSparkle, hashSeed, rrect } from "../draw";
import { drawIcon } from "../icons";
import type { ShadeZone } from "../backdrop";
import type { FrameBackdrop } from "~/frames/types";
import { avatarImage, loadWordmark } from "../images";
import { renderCard } from "../surface";
import { lighten, mix, normalizeHex, rankColor, type RenderPalette } from "../theme";
import { drawText, fitSize, formatCompact, formatInt, num, shout, title, ui } from "../text";
import type { RenderOptions, RenderedCard } from "../types";
import type { Image } from "@napi-rs/canvas";
import {
  drawWordmark,
  finishShell,
  frameOptions,
  loadBackdrop,
  paintShell,
  resolveOptions,
} from "./chrome";
import { PODIUM_BOTTOM, PODIUM_SLOTS, PODIUM_WIDTH, planPodiumStep } from "./podium";

export const LEADERBOARD_CARD_SIZE = { width: 1000, height: 640 } as const;

/** Header, podium and footer: the list panel is opaque and needs nothing. */
const LEADERBOARD_SHADE: readonly ShadeZone[] = [
  { x: 24, y: 14, w: 760, h: 112, strength: 0.46 },
  { x: 20, y: 226, w: 440, h: 400, strength: 0.34, feather: 36 },
  { x: 20, y: 600, w: 960, h: 34, strength: 0.42 },
];

export interface LeaderboardCardEntry {
  id: string;
  name: string;
  avatarUrl?: string | null;
  value: number;
  /** Short text under or after the name ("Level 12 - Saiyan"), localized by the caller. */
  caption?: string | null;
  /** Row of the member who asked for the board. */
  highlight?: boolean;
}

export interface LeaderboardCardInput {
  /** At most 10 entries, best first. */
  entries: readonly LeaderboardCardEntry[];
  /** Rank of the first entry (1 on the first page, 11 on the second...). */
  firstRank?: number;
  /** Podium of the first three; default: on when the board starts at rank 1. */
  podium?: boolean;
  title: string;
  subtitle?: string | null;
  /** Unit appended to values ("XP", "Z"). */
  unit?: string | null;
  /** "Page 1 / 5", localized. */
  pageLabel?: string | null;
  /** "128 fighters", localized. */
  totalLabel?: string | null;
  /** "Updated 12:30", localized. */
  updatedLabel?: string | null;
  /** Domain printed in the footer. */
  site?: string | null;
  accent?: string;
  backgrounds?: ReadonlyArray<string | null | undefined>;
  /** Episode frame of the day (see `pickFrameBackdrop`), used first when it loads. */
  frame?: FrameBackdrop | null;
}

const MAX_ROWS = 10;

interface Row {
  entry: LeaderboardCardEntry;
  rank: number;
  avatar: Image | null;
}

const valueText = (entry: LeaderboardCardEntry, unit: string | null | undefined, locale: string) =>
  `${formatCompact(entry.value, locale)}${unit ? ` ${unit}` : ""}`;

/** Crown of the first place: the measured crown glyph (19 of its 24 units wide). */
function drawCrown(
  ctx: SKRSContext2D,
  palette: RenderPalette,
  cx: number,
  cy: number,
  w: number,
): void {
  drawIcon(ctx, "crown", cx, cy, (w * 24) / 19, palette.title, {
    outline: { color: palette.ink, width: 1.1 },
    shadow: { color: rgba(palette.ink, 0.6), dx: 1, dy: 1.3 },
  });
}

function drawPodium(
  ctx: SKRSContext2D,
  palette: RenderPalette,
  rows: Row[],
  unit: string | null | undefined,
  locale: string,
  seed: number,
): void {
  const bottom = PODIUM_BOTTOM;
  for (const [index, cx, top, radius] of PODIUM_SLOTS) {
    const row = rows[index];
    if (!row) continue;
    const color = rankColor(row.rank, palette);
    const width = PODIUM_WIDTH;
    const x = cx - width / 2;
    // pedestal: hard shadow, flat face, lighter top plane
    rrect(ctx, x + 4, top + 4, width, bottom - top, 10);
    ctx.fillStyle = rgba(palette.ink, 0.62);
    ctx.fill();
    rrect(ctx, x, top, width, bottom - top, 10);
    ctx.fillStyle = mix(palette.card, color, 0.22);
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = palette.ink;
    ctx.stroke();
    ctx.save();
    rrect(ctx, x, top, width, bottom - top, 10);
    ctx.clip();
    ctx.fillStyle = mix(palette.card, color, 0.5);
    ctx.fillRect(x, top, width, 12);
    ctx.fillStyle = rgba(palette.os, 0.1);
    ctx.fillRect(x, top + 12, 6, bottom - top);
    ctx.restore();
    rrect(ctx, x + 2, top + 2, width - 4, bottom - top - 4, 8);
    ctx.lineWidth = 1.25;
    ctx.strokeStyle = rgba(color, 0.7);
    ctx.stroke();

    const avatarY = top - radius - 12;
    drawAvatar(ctx, palette, cx, avatarY, radius, row.avatar, {
      ring: color,
      aura: row.rank === 1 ? palette.amber : undefined,
      seed: seed + row.rank,
      name: row.entry.name,
    });
    if (row.rank === 1) drawCrown(ctx, palette, cx, avatarY - radius - 22, 50);

    const plan = planPodiumStep(ctx, {
      cx,
      top,
      bottom,
      rank: row.rank,
      name: row.entry.name,
      value: valueText(row.entry, unit, locale),
    });
    drawText(ctx, plan.numeral.text, cx, plan.numeral.baseline, {
      font: num(plan.numeral.size),
      fill: color,
      align: "center",
      stroke: { color: palette.ink, width: 7 },
    });
    drawText(ctx, plan.name.text, cx, plan.name.baseline, {
      font: num(plan.name.size),
      fill: palette.text,
      align: "center",
      stroke: { color: palette.ink, width: 4 },
    });
    drawText(ctx, plan.value.text, cx, plan.value.baseline, {
      font: num(plan.value.size),
      fill: lighten(color, 0.2),
      align: "center",
      stroke: { color: palette.ink, width: 4 },
    });
    if (plan.ball) drawBall(ctx, palette, cx, plan.ball.cy, plan.ball.r, row.rank, 0.95);
  }
}

function drawRows(
  ctx: SKRSContext2D,
  palette: RenderPalette,
  rows: Row[],
  box: { x: number; y: number; w: number; rowHeight: number },
  unit: string | null | undefined,
  locale: string,
  accent: string,
): void {
  const maxValue = Math.max(1, ...rows.map((row) => row.entry.value));
  const pad = 14;
  const height = rows.length * box.rowHeight + pad * 2;
  drawPanel(ctx, palette, box.x, box.y, box.w, height, { accent });
  const avatarR = Math.min(20, box.rowHeight * 0.36);
  rows.forEach((row, i) => {
    const y = box.y + pad + i * box.rowHeight;
    const mid = y + box.rowHeight / 2;
    if (row.entry.highlight) {
      rrect(ctx, box.x + 10, y + 2, box.w - 20, box.rowHeight - 4, 8);
      ctx.fillStyle = rgba(accent, 0.22);
      ctx.fill();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = rgba(accent, 0.85);
      ctx.stroke();
    } else if (i > 0) {
      ctx.fillStyle = rgba(palette.os, 0.1);
      ctx.fillRect(box.x + 18, y, box.w - 36, 1.5);
    }
    drawText(ctx, formatInt(row.rank), box.x + 50, mid + 1, {
      font: num(34),
      fill: rankColor(row.rank, palette),
      align: "center",
      baseline: "middle",
      stroke: { color: palette.ink, width: 5 },
    });
    drawAvatar(ctx, palette, box.x + 100, mid, avatarR, row.avatar, {
      ring: rankColor(row.rank, palette),
      seed: 1,
      name: row.entry.name,
      ringWidth: 3,
    });
    const text = valueText(row.entry, unit, locale);
    ctx.font = num(30);
    const valueWidth = ctx.measureText(text).width;
    const nameX = box.x + 100 + avatarR + 16;
    const textW = box.w - (nameX - box.x) - valueWidth - 40;
    const caption = row.entry.caption;
    const roomy = box.rowHeight >= 56;
    // roomy rows stack name, caption and bar; compact rows keep the name and the bar
    const nameY = roomy ? y + 27 : y + 25;
    drawText(ctx, row.entry.name, nameX, nameY, {
      font: num(26),
      fill: palette.text,
      maxWidth: textW,
      stroke: { color: palette.ink, width: 4 },
    });
    if (caption && roomy) {
      drawText(ctx, caption, nameX, y + 43, {
        font: ui(600, 11.5),
        fill: palette.muted,
        maxWidth: textW,
      });
    }
    const barY = roomy ? y + (caption ? 49 : 40) : y + box.rowHeight - 14;
    rrect(ctx, nameX, barY, textW, 6, 3);
    ctx.fillStyle = rgba(palette.ink, 0.55);
    ctx.fill();
    rrect(ctx, nameX, barY, Math.max(6, (textW * row.entry.value) / maxValue), 6, 3);
    ctx.fillStyle = mix(accent, palette.os, 0.1);
    ctx.fill();
    drawText(ctx, text, box.x + box.w - 22, mid + 1, {
      font: num(30),
      fill: palette.title,
      align: "right",
      baseline: "middle",
      stroke: { color: palette.ink, width: 5 },
    });
  });
}

export async function renderLeaderboardCard(
  input: LeaderboardCardInput,
  options: RenderOptions = {},
): Promise<RenderedCard> {
  const { width: W, height: H } = LEADERBOARD_CARD_SIZE;
  const { palette, images, locale } = resolveOptions(options);
  const accent = normalizeHex(input.accent) ?? palette.orange;
  const entries = input.entries.slice(0, MAX_ROWS);
  const firstRank = input.firstRank ?? 1;
  const podium = (input.podium ?? firstRank === 1) && entries.length >= 1;

  return renderCard(W, H, options, async ({ ctx }) => {
    const [backdrop, wordmark, ...avatars] = await Promise.all([
      loadBackdrop(images, input.frame, input.backgrounds ?? []),
      loadWordmark(images),
      ...entries.map((entry) => avatarImage(images, entry.avatarUrl)),
    ]);
    const rows: Row[] = entries.map((entry, i) => ({
      entry,
      rank: firstRank + i,
      avatar: avatars[i] ?? null,
    }));
    const seed = hashSeed(`${input.title}|${firstRank}|${entries[0]?.id ?? ""}`);

    paintShell(ctx, palette, {
      width: W,
      height: H,
      image: backdrop.image,
      gradient: [
        mix(palette.bg, palette.ember, 0.24),
        mix(palette.bg, palette.orange, 0.36),
        palette.bg,
      ],
      ...frameOptions(backdrop, LEADERBOARD_SHADE, undefined),
      focal: podium ? { x: 226, y: 250 } : { x: W / 2, y: 60 },
      accent,
      seed,
    });

    // Header: wordmark, title, subtitle, page and total.
    drawWordmark(ctx, wordmark, 34, 22, 132, 1);
    const titleText = shout(input.title);
    ctx.font = title(titleText, 46);
    const titleSize = fitSize(ctx, titleText, 560, (px) => title(titleText, px), 46, 26);
    drawText(ctx, titleText, 190, 62, {
      font: title(titleText, titleSize),
      fill: palette.title,
      stroke: { color: palette.ink, width: 8 },
      shadow: { color: rgba(palette.ink, 0.7), dx: 3, dy: 4 },
      spacing: "1px",
    });
    if (input.subtitle) {
      drawText(ctx, input.subtitle, 192, 90, {
        font: ui(600, 14),
        fill: palette.text,
        maxWidth: 560,
        stroke: { color: rgba(palette.ink, 0.8), width: 4 },
      });
    }
    if (input.pageLabel) {
      drawChip(ctx, input.pageLabel, W - 34 - 150, 28, {
        font: ui(700, 15),
        color: palette.ink,
        fill: palette.title,
        line: palette.ink,
        minWidth: 150,
        spacing: "1px",
        shadow: rgba(palette.ink, 0.6),
        height: 32,
      });
    }

    if (podium) {
      drawPodium(ctx, palette, rows.slice(0, 3), input.unit, locale, seed);
      const rest = rows.slice(3);
      if (rest.length > 0) {
        drawRows(
          ctx,
          palette,
          rest,
          { x: 460, y: 118, w: 506, rowHeight: 62 },
          input.unit,
          locale,
          accent,
        );
      } else {
        // fewer than four fighters: the podium stands alone, say so with a spark
        drawSparkle(ctx, 720, 330, 40, rgba(palette.spark, 0.7));
      }
    } else {
      drawRows(
        ctx,
        palette,
        rows,
        { x: 32, y: 112, w: W - 64, rowHeight: 45 },
        input.unit,
        locale,
        accent,
      );
    }

    // Footer line.
    const footer = [input.totalLabel, input.updatedLabel].filter(Boolean).join("   \u00B7   ");
    if (footer) {
      drawText(ctx, footer, 36, H - 22, {
        font: ui(600, 13),
        fill: palette.muted,
        stroke: { color: rgba(palette.ink, 0.8), width: 4 },
        maxWidth: 640,
      });
    }
    if (input.site) {
      drawText(ctx, shout(input.site), W - 36, H - 22, {
        font: ui(700, 12),
        fill: palette.text,
        align: "right",
        spacing: "1.8px",
        stroke: { color: rgba(palette.ink, 0.8), width: 4 },
      });
    }
    finishShell(ctx, palette, W, H, accent);
  });
}
