/**
 * Balance card (900 x 320): zeni amount with its coin, a few figures and an optional
 * sparkline of the recent days. Figures arrive formatted by the caller (`stats`).
 */
import { rgba } from "~/lib/canvas-kit";
import { drawAvatar, drawCoin, drawPanel, drawSparkline, hashSeed } from "../draw";
import { avatarImage, firstImage, loadWordmark } from "../images";
import { renderCard } from "../surface";
import { mix, normalizeHex, type RenderPalette } from "../theme";
import { drawText, fitSize, formatInt, num, shout, ui } from "../text";
import type { RenderOptions, RenderedCard } from "../types";
import { drawWordmark, finishShell, paintShell, resolveOptions } from "./chrome";

export const BALANCE_CARD_SIZE = { width: 900, height: 320 } as const;

export type Tone = "neutral" | "good" | "bad" | "warn" | "info";

/** Colour of a tone on the dark panels. */
export function toneColor(tone: Tone | undefined, palette: RenderPalette): string {
  switch (tone) {
    case "good":
      return palette.green;
    case "bad":
      return palette.red;
    case "warn":
      return palette.amber;
    case "info":
      return palette.ki;
    default:
      return palette.text;
  }
}

export interface BalanceStat {
  label: string;
  /** Already formatted ("+120", "#3", "x1,25"). */
  value: string;
  tone?: Tone;
}

export interface BalanceCardInput {
  name: string;
  avatarUrl?: string | null;
  zeni: number;
  /** Up to three figures under the amount. */
  stats?: readonly BalanceStat[];
  /** Recent balance, oldest first, with its caption ("Last 7 days"). */
  history?: { label: string; values: readonly number[] } | null;
  labels: { zeni: string };
  accent?: string;
  backgrounds?: ReadonlyArray<string | null | undefined>;
}

export async function renderBalanceCard(
  input: BalanceCardInput,
  options: RenderOptions = {},
): Promise<RenderedCard> {
  const { width: W, height: H } = BALANCE_CARD_SIZE;
  const { palette, images, locale } = resolveOptions(options);
  const accent = normalizeHex(input.accent) ?? palette.amber;
  const stats = (input.stats ?? []).slice(0, 3);
  const history = input.history && input.history.values.length >= 2 ? input.history : null;

  return renderCard(W, H, options, async ({ ctx }) => {
    const [avatar, background, wordmark] = await Promise.all([
      avatarImage(images, input.avatarUrl),
      firstImage(images, input.backgrounds ?? []),
      loadWordmark(images),
    ]);
    const seed = hashSeed(`${input.name}|${input.zeni}`);
    const AV = { x: 104, y: 112, r: 62 } as const;

    paintShell(ctx, palette, {
      width: W,
      height: H,
      image: background,
      gradient: [mix(palette.bg, accent, 0.16), mix(palette.bg, palette.orange, 0.3), palette.bg],
      focal: { x: 330, y: 120 },
      accent,
      seed,
    });
    drawAvatar(ctx, palette, AV.x, AV.y, AV.r, avatar, {
      ring: accent,
      aura: palette.orange,
      seed,
      name: input.name,
    });
    drawText(ctx, shout(input.name), AV.x, 226, {
      font: num(32),
      fill: palette.text,
      align: "center",
      maxWidth: 170,
      stroke: { color: palette.ink, width: 7 },
    });
    drawWordmark(ctx, wordmark, 34, 252, 140, 0.95);

    // Amount.
    const X0 = 214;
    drawText(ctx, shout(input.labels.zeni), X0, 56, {
      font: ui(700, 14),
      fill: palette.muted,
      spacing: "4px",
      stroke: { color: rgba(palette.ink, 0.8), width: 4 },
    });
    drawCoin(ctx, palette, X0 + 40, 118, 38);
    const amount = formatInt(input.zeni, locale);
    const size = fitSize(ctx, amount, W - X0 - 100 - 40, num, 112, 54);
    drawText(ctx, amount, X0 + 92, 118 + size * 0.34, {
      font: num(size),
      fill: palette.title,
      stroke: { color: palette.ink, width: 11 },
      shadow: { color: rgba(palette.ink, 0.7), dx: 5, dy: 6 },
    });

    // Figures and sparkline.
    const panelX = X0;
    const panelY = 202;
    const panelW = W - X0 - 36;
    const panelH = 84;
    drawPanel(ctx, palette, panelX, panelY, panelW, panelH, { accent });
    const chartW = history ? 250 : 0;
    const cellsW = panelW - chartW;
    const cell = stats.length > 0 ? cellsW / stats.length : cellsW;
    stats.forEach((stat, i) => {
      const x = panelX + cell * i;
      if (i > 0) {
        ctx.fillStyle = rgba(palette.os, 0.16);
        ctx.fillRect(x - 1, panelY + 14, 2, panelH - 28);
      }
      drawText(ctx, shout(stat.label), x + cell / 2, panelY + 28, {
        font: ui(700, 12),
        fill: palette.muted,
        align: "center",
        spacing: "1.6px",
        maxWidth: cell - 16,
      });
      drawText(ctx, stat.value, x + cell / 2, panelY + 66, {
        font: num(40),
        fill: toneColor(stat.tone, palette),
        align: "center",
        maxWidth: cell - 16,
        stroke: { color: palette.ink, width: 5 },
      });
    });
    if (history) {
      const cx = panelX + cellsW;
      ctx.fillStyle = rgba(palette.os, 0.16);
      ctx.fillRect(cx - 1, panelY + 14, 2, panelH - 28);
      drawText(ctx, shout(history.label), cx + chartW / 2, panelY + 24, {
        font: ui(700, 11),
        fill: palette.muted,
        align: "center",
        spacing: "1.4px",
        maxWidth: chartW - 20,
      });
      drawSparkline(ctx, palette, history.values, cx + 18, panelY + 34, chartW - 36, 38, accent);
    }
    finishShell(ctx, palette, W, H, accent);
  });
}
