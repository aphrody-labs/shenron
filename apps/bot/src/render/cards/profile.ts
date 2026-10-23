/**
 * Profile card (1000 x 360): avatar with aura, name, race and tier chips, rank, a row of
 * stats, the XP gauge and the wordmark. Texts arrive localized in `labels`.
 */
import type { SKRSContext2D } from "@napi-rs/canvas";
import { rgba } from "~/lib/canvas-kit";
import { xpProgress, type XpProgress } from "~/lib/xp";
import { drawAvatar, drawChip, drawCoin, drawGauge, drawPanel, hashSeed } from "../draw";
import type { ShadeZone } from "../backdrop";
import type { FrameBackdrop } from "~/frames/types";
import { avatarImage, loadWordmark } from "../images";
import { renderCard } from "../surface";
import {
  darken,
  lighten,
  mix,
  normalizeHex,
  raceAccent,
  toHexColor,
  type RenderPalette,
} from "../theme";
import { drawText, fitSize, formatCompact, formatInt, graphemes, num, shout, ui } from "../text";
import type { RenderOptions, RenderedCard } from "../types";
import type { RaceId } from "~/lib/races";
import {
  drawWordmark,
  finishShell,
  frameOptions,
  loadBackdrop,
  paintShell,
  resolveOptions,
} from "./chrome";

export const PROFILE_CARD_SIZE = { width: 1000, height: 360 } as const;

/** Under the title and name, the rank and the gauge: where an episode frame must stay quiet. */
const PROFILE_SHADE: readonly ShadeZone[] = [
  { x: 226, y: 16, w: 540, h: 142, strength: 0.4 },
  { x: 716, y: 10, w: 270, h: 118, strength: 0.34 },
  { x: 226, y: 262, w: 748, h: 90, strength: 0.42 },
];

export interface ProfileCardLabels {
  level: string;
  rank: string;
  zeni: string;
  messages: string;
  experience: string;
  /** Scouter readout, e.g. "KI". */
  power: string;
  /** Shown instead of the next threshold at the top level. */
  max: string;
  fused: string;
}

/** Equipped card theme (database row or built-in), already resolved by the caller. */
export interface ProfileCardTheme {
  accent: string;
  aura: string;
  gradient: readonly [string, string, string];
  overlayOpacity?: number;
  tintStrength?: number;
  gradientAngle?: number;
  /** Name of the theme, printed in the footer. */
  label?: string;
}

export interface ProfileCardInput {
  name: string;
  /** Equipped title ("Guerrier du Futur"). */
  title?: string | null;
  avatarUrl?: string | null;
  xp: number;
  zeni: number;
  messages?: number | null;
  rank?: number | null;
  race?: { id?: RaceId; label: string; emoji?: string; accent?: string } | null;
  /** Current transformation role. */
  tier?: { label: string; accent?: string } | null;
  /** Equipped badge (an emoji or a short text). */
  badge?: string | null;
  fused?: boolean;
  /** Colour chosen by the member (`#hex`, `rgb()` or `hsl()`; anything else is ignored). */
  color?: string | null;
  theme?: Partial<ProfileCardTheme>;
  /** Background candidates in order of preference (banner, theme file, shop card). */
  backgrounds?: ReadonlyArray<string | null | undefined>;
  /** Episode frame chosen for the card: used first when it loads (see `pickFrameBackdrop`). */
  frame?: FrameBackdrop | null;
  /** "1 200 XP to level 13", localized by the caller. */
  progressLabel?: string | null;
  /** Progress override (tests, custom curves); default `xpProgress(xp)`. */
  progress?: XpProgress;
  labels: ProfileCardLabels;
}

function defaultTheme(palette: RenderPalette): ProfileCardTheme {
  return {
    accent: palette.orange,
    aura: palette.ember,
    gradient: [
      mix(palette.bg, palette.ember, 0.28),
      mix(palette.bg, palette.orange, 0.5),
      palette.bg,
    ],
  };
}

/** Cell of the stats panel. */
function drawStat(
  ctx: SKRSContext2D,
  palette: RenderPalette,
  label: string,
  value: string,
  x: number,
  y: number,
  w: number,
  color: string,
  coin = false,
): void {
  drawText(ctx, shout(label), x + w / 2, y + 25, {
    font: ui(700, 12),
    fill: palette.muted,
    align: "center",
    spacing: "1.6px",
    maxWidth: w - 16,
  });
  const size = fitSize(ctx, value, w - 24 - (coin ? 30 : 0), num, 50, 28);
  const text = { font: num(size), fill: color, baseline: "alphabetic" as const };
  if (coin) {
    ctx.font = num(size);
    const width = ctx.measureText(value).width;
    const total = width + 36;
    const left = x + (w - total) / 2;
    drawCoin(ctx, palette, left + 12, y + 56, 11);
    drawText(ctx, value, left + 36, y + 68, {
      ...text,
      stroke: { color: palette.ink, width: 4 },
    });
  } else {
    drawText(ctx, value, x + w / 2, y + 68, {
      ...text,
      align: "center",
      stroke: { color: palette.ink, width: 4 },
    });
  }
}

export async function renderProfileCard(
  input: ProfileCardInput,
  options: RenderOptions = {},
): Promise<RenderedCard> {
  const { width: W, height: H } = PROFILE_CARD_SIZE;
  const { palette, images, locale } = resolveOptions(options);
  const base = defaultTheme(palette);
  const theme: ProfileCardTheme = {
    ...base,
    ...input.theme,
    accent: normalizeHex(input.theme?.accent) ?? base.accent,
    aura: normalizeHex(input.theme?.aura) ?? base.aura,
  };
  const userColor = toHexColor(input.color);
  const accent = userColor ?? theme.accent;
  const progress = input.progress ?? xpProgress(input.xp);
  const { labels } = input;

  return renderCard(W, H, options, async ({ ctx }) => {
    const [avatar, backdrop, wordmark] = await Promise.all([
      avatarImage(images, input.avatarUrl),
      loadBackdrop(images, input.frame, input.backgrounds ?? []),
      loadWordmark(images),
    ]);
    const seed = hashSeed(`${input.name}|${input.xp}`);
    const AV = { x: 124, y: 138, r: 80 } as const;

    paintShell(ctx, palette, {
      width: W,
      height: H,
      image: backdrop.image,
      gradient: theme.gradient,
      angle: theme.gradientAngle,
      ...frameOptions(backdrop, PROFILE_SHADE, theme.overlayOpacity),
      tint: { color: theme.aura, strength: theme.tintStrength ?? 0.08 },
      focal: { x: AV.x, y: AV.y },
      accent,
      seed,
    });

    drawAvatar(ctx, palette, AV.x, AV.y, AV.r, avatar, {
      ring: accent,
      aura: theme.aura,
      seed,
      name: input.name,
    });
    const badge = input.badge ? graphemes(input.badge)[0] : null;
    if (badge) {
      const bx = AV.x + AV.r * 0.72;
      const by = AV.y + AV.r * 0.74;
      ctx.beginPath();
      ctx.arc(bx + 2, by + 3, 25, 0, Math.PI * 2);
      ctx.fillStyle = rgba(palette.ink, 0.6);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(bx, by, 25, 0, Math.PI * 2);
      ctx.fillStyle = mix(palette.card, accent, 0.35);
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = palette.ink;
      ctx.stroke();
      drawText(ctx, badge, bx, by + 2, {
        font: ui(500, 26),
        fill: palette.text,
        align: "center",
        baseline: "middle",
      });
    }
    drawWordmark(ctx, wordmark, 40, 280, 168, 0.95);

    const X0 = 238;
    const XR = 960;
    const hasRank = typeof input.rank === "number" && input.rank > 0;

    // Rank, top right.
    if (hasRank) {
      drawText(ctx, shout(labels.rank), XR, 38, {
        font: ui(700, 13),
        fill: palette.text,
        stroke: { color: rgba(palette.ink, 0.85), width: 4 },
        align: "right",
        spacing: "3px",
      });
      drawText(ctx, `#${formatInt(input.rank as number, locale)}`, XR, 108, {
        font: num(92),
        fill: palette.title,
        align: "right",
        stroke: { color: palette.ink, width: 8 },
        shadow: { color: rgba(palette.ink, 0.7), dx: 4, dy: 4 },
      });
    }

    // Title, name.
    if (input.title) {
      drawText(ctx, input.title, X0, 44, {
        font: `italic ${ui(600, 17)}`,
        fill: lighten(accent, 0.45),
        maxWidth: 420,
        stroke: { color: rgba(palette.ink, 0.7), width: 4 },
      });
    }
    const name = shout(input.name);
    const nameMax = hasRank ? XR - X0 - 190 : XR - X0;
    const nameSize = fitSize(ctx, name, nameMax, num, 68, 34);
    drawText(ctx, name, X0, 110, {
      font: num(nameSize),
      fill: lighten(accent, 0.18),
      maxWidth: nameMax,
      stroke: { color: palette.ink, width: 8 },
      shadow: { color: rgba(palette.ink, 0.7), dx: 3, dy: 4 },
    });

    // Race, tier and fusion chips.
    let chipX = X0;
    const chipY = 124;
    const chip = (text: string, color: string) => {
      const fill = mix(palette.card, color, 0.3);
      chipX +=
        drawChip(ctx, text, chipX, chipY, {
          font: ui(700, 14),
          color: lighten(color, 0.5),
          fill,
          line: color,
          spacing: "1px",
          shadow: rgba(palette.ink, 0.6),
        }) + 12;
    };
    if (input.race) {
      const color =
        normalizeHex(input.race.accent) ??
        (input.race.id ? raceAccent(input.race.id) : palette.orange);
      chip(`${input.race.emoji ? `${input.race.emoji} ` : ""}${shout(input.race.label)}`, color);
    }
    if (input.tier)
      chip(shout(input.tier.label), normalizeHex(input.tier.accent) ?? palette.purple);
    if (input.fused) chip(`\u{1F49E} ${shout(labels.fused)}`, palette.pink);

    // Stats panel.
    const panelY = 166;
    const panelW = XR - X0;
    const cell = panelW / 4;
    drawPanel(ctx, palette, X0, panelY, panelW, 80, { accent });
    ctx.save();
    ctx.fillStyle = rgba(palette.os, 0.16);
    for (let i = 1; i < 4; i++) ctx.fillRect(X0 + cell * i - 1, panelY + 14, 2, 52);
    ctx.restore();
    drawStat(
      ctx,
      palette,
      labels.level,
      formatInt(progress.level, locale),
      X0,
      panelY,
      cell,
      palette.title,
    );
    drawStat(
      ctx,
      palette,
      labels.zeni,
      formatCompact(input.zeni, locale),
      X0 + cell,
      panelY,
      cell,
      palette.amber,
      true,
    );
    drawStat(
      ctx,
      palette,
      labels.messages,
      formatCompact(input.messages ?? 0, locale),
      X0 + cell * 2,
      panelY,
      cell,
      palette.text,
    );
    drawStat(
      ctx,
      palette,
      labels.power,
      formatCompact(input.xp, locale),
      X0 + cell * 3,
      panelY,
      cell,
      palette.ki,
    );

    // XP gauge.
    const gaugeY = 282;
    drawText(ctx, shout(labels.experience), X0, gaugeY - 10, {
      font: ui(700, 12),
      fill: palette.muted,
      spacing: "2px",
    });
    const nextLabel = progress.next ? formatCompact(progress.next.xp, locale) : labels.max;
    drawText(ctx, `${formatCompact(input.xp, locale)} / ${nextLabel}`, XR, gaugeY - 8, {
      font: num(26),
      fill: palette.text,
      align: "right",
      stroke: { color: palette.ink, width: 4 },
    });
    drawGauge(ctx, X0, gaugeY, panelW, 28, progress.ratio, {
      fill: accent,
      track: darken(mix(palette.card, accent, 0.2), 0.4),
      ink: palette.ink,
      paper: palette.os,
    });
    if (progress.ratio > 0.12) {
      drawText(ctx, `${Math.round(progress.ratio * 100)}%`, X0 + 16, gaugeY + 15, {
        font: num(22),
        fill: palette.os,
        baseline: "middle",
        stroke: { color: palette.ink, width: 4 },
      });
    }

    // Footer.
    if (input.progressLabel) {
      drawText(ctx, input.progressLabel, X0, 340, {
        font: ui(600, 13),
        fill: palette.muted,
        maxWidth: 420,
      });
    }
    if (theme.label) {
      drawText(ctx, shout(theme.label), XR, 340, {
        font: ui(700, 11),
        fill: palette.muted,
        stroke: { color: rgba(palette.ink, 0.85), width: 4 },
        align: "right",
        spacing: "1.8px",
        maxWidth: 260,
      });
    }

    finishShell(ctx, palette, W, H, accent);
  });
}
