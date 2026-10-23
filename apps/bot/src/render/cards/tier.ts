/**
 * Tier-up card (1000 x 400): "Level 12 -> 15" in big numbers and the new transformation
 * role on a ribbon, around the member's avatar. Texts arrive localized in `labels`.
 */
import { rgba } from "~/lib/canvas-kit";
import { drawAvatar, drawRibbon, drawSparkle, hashSeed, rng, slantPath } from "../draw";
import { drawIcon } from "../icons";
import type { ShadeZone } from "../backdrop";
import type { FrameBackdrop } from "~/frames/types";
import { avatarImage, loadWordmark } from "../images";
import { renderCard } from "../surface";
import { lighten, mix, normalizeHex, readableOn } from "../theme";
import { drawText, fitSize, formatInt, num, shout, title, ui } from "../text";
import type { RenderOptions, RenderedCard } from "../types";
import {
  drawWordmark,
  finishShell,
  frameOptions,
  loadBackdrop,
  paintShell,
  resolveOptions,
} from "./chrome";

export const TIER_CARD_SIZE = { width: 1000, height: 400 } as const;

/** Behind the ribbons and the numbers, the heart of the card. */
const TIER_SHADE: readonly ShadeZone[] = [
  { x: 330, y: 92, w: 650, h: 204, strength: 0.4, feather: 40 },
  { x: 40, y: 318, w: 300, h: 60, strength: 0.4 },
];

/** Drawing box of a level-change chevron: its 15 units of height measure 72 px. */
const CHEVRON_BOX = 115;

export interface TierCardLabels {
  /** Ribbon at the top ("Tier reached"). */
  title: string;
  /** Caption above the numbers ("Level"). */
  level: string;
  /** Caption above the role ribbon ("New transformation"). */
  newRole: string;
}

export interface TierCardInput {
  name: string;
  avatarUrl?: string | null;
  fromLevel: number;
  toLevel: number;
  /** Transformation role earned at this tier; omit for a plain level-up. */
  role?: { label: string; accent?: string } | null;
  accent?: string;
  backgrounds?: ReadonlyArray<string | null | undefined>;
  /** Episode frame chosen for the card (the one of the transformation when it has a link). */
  frame?: FrameBackdrop | null;
  labels: TierCardLabels;
}

export async function renderTierCard(
  input: TierCardInput,
  options: RenderOptions = {},
): Promise<RenderedCard> {
  const { width: W, height: H } = TIER_CARD_SIZE;
  const { palette, images, locale } = resolveOptions(options);
  const accent = normalizeHex(input.accent) ?? normalizeHex(input.role?.accent) ?? palette.orange;
  const roleAccent = normalizeHex(input.role?.accent) ?? accent;
  const { labels } = input;

  return renderCard(W, H, options, async ({ ctx }) => {
    const [avatar, backdrop, wordmark] = await Promise.all([
      avatarImage(images, input.avatarUrl),
      loadBackdrop(images, input.frame, input.backgrounds ?? []),
      loadWordmark(images),
    ]);
    const seed = hashSeed(`${input.name}|${input.fromLevel}|${input.toLevel}`);
    const AV = { x: 188, y: 205, r: 98 } as const;

    paintShell(ctx, palette, {
      width: W,
      height: H,
      image: backdrop.image,
      gradient: [mix(palette.bg, accent, 0.2), mix(palette.bg, accent, 0.4), palette.bg],
      angle: 35,
      ...frameOptions(backdrop, TIER_SHADE, undefined),
      focal: { x: AV.x, y: AV.y },
      accent,
      seed,
      tint: { color: accent, strength: 0.1 },
    });

    // Sparkles, seeded so the same card always looks the same, kept off the texts.
    const random = rng(seed);
    const busy = [
      [330, 18, 640, 60],
      [330, 80, 640, 190],
      [360, 270, 580, 112],
    ] as const;
    for (let placed = 0, tries = 0; placed < 8 && tries < 80; tries++) {
      const x = 300 + random() * 680;
      const y = 24 + random() * 350;
      const size = 5 + random() * 9;
      const alpha = 0.35 + random() * 0.4;
      if (
        busy.some(
          ([bx, by, bw, bh]) => x > bx - 12 && x < bx + bw + 12 && y > by - 12 && y < by + bh + 12,
        )
      )
        continue;
      drawSparkle(ctx, x, y, size, rgba(palette.spark, alpha));
      placed++;
    }

    drawAvatar(ctx, palette, AV.x, AV.y, AV.r, avatar, {
      ring: accent,
      aura: lighten(accent, 0.2),
      seed,
      name: input.name,
      ringWidth: 7,
    });
    drawText(ctx, shout(input.name), AV.x, 352, {
      font: num(34),
      fill: palette.text,
      align: "center",
      maxWidth: 300,
      stroke: { color: palette.ink, width: 7 },
    });
    drawWordmark(ctx, wordmark, 30, 22, 128, 0.95);

    const cx = 650;
    drawRibbon(ctx, palette, shout(labels.title), cx - 230, 24, 460, 46, {
      fill: accent,
      color: readableOn(accent, palette),
      font: title(shout(labels.title), 28),
      spacing: "1px",
    });

    // Level change: small previous level, chevrons, huge new level.
    const hasRole = Boolean(input.role);
    const baseline = hasRole ? 250 : 288;
    const from = formatInt(input.fromLevel, locale);
    const to = formatInt(input.toLevel, locale);
    ctx.font = num(120);
    const fromWidth = ctx.measureText(from).width;
    const toSize = fitSize(ctx, to, 300, num, 190, 110);
    ctx.font = num(toSize);
    const toWidth = ctx.measureText(to).width;
    const arrow = 96;
    const gap = 26;
    const total = fromWidth + gap + arrow + gap + toWidth;
    let x = cx - total / 2;
    drawText(ctx, shout(labels.level), cx, baseline - toSize * 0.72 - 18, {
      font: ui(700, 15),
      fill: palette.muted,
      align: "center",
      spacing: "5px",
      stroke: { color: rgba(palette.ink, 0.8), width: 4 },
    });
    drawText(ctx, from, x, baseline, {
      font: num(120),
      fill: palette.muted,
      stroke: { color: palette.ink, width: 9 },
    });
    x += fromWidth + gap;
    // two chevrons: the measured chevron glyph, thickened to the weight of the numbers
    for (const [offset, color] of [
      [0, accent],
      [34, lighten(accent, 0.35)],
    ] as const) {
      drawIcon(ctx, "chevronRight", x + offset + 20, baseline - 52, CHEVRON_BOX, color, {
        strokeWidth: 3.4,
        outline: { color: palette.ink, width: 1.4 },
      });
    }
    x += arrow + gap;
    drawText(ctx, to, x, baseline, {
      font: num(toSize),
      fill: palette.title,
      stroke: { color: palette.ink, width: 14 },
      shadow: { color: rgba(palette.ink, 0.7), dx: 6, dy: 7 },
    });

    if (input.role) {
      drawText(ctx, shout(labels.newRole), cx, 285, {
        font: ui(700, 14),
        fill: palette.muted,
        align: "center",
        spacing: "4px",
        stroke: { color: rgba(palette.ink, 0.8), width: 4 },
      });
      const ribbonW = 500;
      const ribbonX = cx - ribbonW / 2;
      slantPath(ctx, ribbonX - 6, 296 - 6, ribbonW + 12, 76, 18);
      ctx.fillStyle = rgba(palette.ink, 0.5);
      ctx.fill();
      const roleText = shout(input.role.label);
      drawRibbon(ctx, palette, roleText, ribbonX, 296, ribbonW, 64, {
        fill: roleAccent,
        color: readableOn(roleAccent, palette),
        font: title(roleText, 46),
        skew: 18,
        spacing: "1px",
      });
    }
    finishShell(ctx, palette, W, H, accent);
  });
}
