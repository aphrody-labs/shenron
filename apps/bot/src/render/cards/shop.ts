/**
 * Shop cards: one item preview (800 x 360) and a board of up to four previews (1200 x 600)
 * for the `/shop` browser. Item texts (name, category, state) arrive localized.
 */
import type { Image, SKRSContext2D } from "@napi-rs/canvas";
import { rgba } from "~/lib/canvas-kit";
import { drawPosterImage } from "../backdrop";
import {
  drawChip,
  drawCoin,
  drawHalftone,
  drawPanel,
  drawRibbon,
  drawSparkle,
  hashSeed,
  rrect,
} from "../draw";
import { firstImage, loadWordmark } from "../images";
import { renderCard } from "../surface";
import {
  darken,
  lighten,
  mix,
  normalizeHex,
  readableOn,
  toHexColor,
  type RenderPalette,
} from "../theme";
import { drawText, fitSize, formatInt, graphemes, num, shout, title, ui, wrapLines } from "../text";
import type { ImageSource, RenderOptions, RenderedCard } from "../types";
import { drawWordmark, finishShell, paintShell, resolveOptions } from "./chrome";

export const SHOP_ITEM_CARD_SIZE = { width: 800, height: 360 } as const;
export const SHOP_BOARD_CARD_SIZE = { width: 1200, height: 600 } as const;

/** What the preview area shows. */
export type ShopPreview =
  /** Banner or card picture on disk (`assets/...`), `gradient` while it loads or when absent. */
  | { kind: "image"; ref: string; gradient?: readonly [string, string, string] }
  /** Profile colour swatch. */
  | { kind: "color"; color: string }
  /** Badge: an emoji or a short text. */
  | { kind: "badge"; text: string }
  /** Card theme without picture. */
  | { kind: "gradient"; colors: readonly [string, string, string] };

export interface ShopItemInput {
  name: string;
  /** Category, localized ("Banner", "Colour", "Card", "Badge", "Title"). */
  kindLabel: string;
  description?: string | null;
  /** Price in zeni; `null` for an item that is not sold (reward, event). */
  price?: number | null;
  /** Replaces the price ("Free", "Reward"), localized. */
  priceLabel?: string | null;
  /** State ribbon ("Owned", "Equipped"), localized. */
  stateLabel?: string | null;
  /** Accent of the rarity or the category. */
  accent?: string | null;
  preview: ShopPreview;
}

export interface ShopItemCardInput {
  item: ShopItemInput;
  /** Member balance chip ("Balance: 12,300"), localized. */
  balanceLabel?: string | null;
}

export interface ShopBoardCardInput {
  /** Heading of the board ("Banners"), localized. */
  title: string;
  subtitle?: string | null;
  /** Up to four items; they are numbered 1 to 4 for the selector. */
  items: readonly ShopItemInput[];
  balanceLabel?: string | null;
  site?: string | null;
}

interface LoadedItem {
  item: ShopItemInput;
  image: Image | null;
}

async function loadPreview(images: ImageSource, item: ShopItemInput): Promise<LoadedItem> {
  const image = item.preview.kind === "image" ? await firstImage(images, [item.preview.ref]) : null;
  return { item, image };
}

function previewColors(
  preview: ShopPreview,
  palette: RenderPalette,
): readonly [string, string, string] {
  if (preview.kind === "gradient") return preview.colors;
  if (preview.kind === "image" && preview.gradient) return preview.gradient;
  return [mix(palette.bg, palette.orange, 0.3), mix(palette.bg, palette.orange, 0.6), palette.bg];
}

/** Preview area: picture, gradient, swatch or badge, with an ink border. */
function drawPreview(
  ctx: SKRSContext2D,
  palette: RenderPalette,
  loaded: LoadedItem,
  x: number,
  y: number,
  w: number,
  h: number,
  accent: string,
): void {
  const { item, image } = loaded;
  const radius = 14;
  ctx.save();
  rrect(ctx, x + 4, y + 4, w, h, radius);
  ctx.fillStyle = rgba(palette.ink, 0.62);
  ctx.fill();
  rrect(ctx, x, y, w, h, radius);
  ctx.clip();
  const preview = item.preview;
  if (preview.kind === "color") {
    const color = toHexColor(preview.color) ?? accent;
    ctx.fillStyle = darken(color, 0.55);
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(x, y + h * 0.18);
    ctx.lineTo(x + w, y - h * 0.1);
    ctx.lineTo(x + w, y + h * 0.78);
    ctx.lineTo(x, y + h);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = rgba(lighten(color, 0.6), 0.5);
    ctx.fillRect(x, y + h * 0.3, w, h * 0.06);
    drawHalftone(ctx, x, y, w, h, rgba(readableOn(color, palette), 0.18), {
      corner: "tl",
      step: 10,
    });
  } else if (preview.kind === "badge") {
    ctx.fillStyle = mix(palette.card, accent, 0.18);
    ctx.fillRect(x, y, w, h);
    drawHalftone(ctx, x, y, w, h, rgba(accent, 0.28), { corner: "br", step: 10 });
  } else if (image) {
    drawPosterImage(ctx, image, x, y, w, h);
  } else {
    const [c1, c2, c3] = previewColors(preview, palette);
    const fill = ctx.createLinearGradient(x, y, x + w, y + h);
    fill.addColorStop(0, c1);
    fill.addColorStop(0.5, c2);
    fill.addColorStop(1, c3);
    ctx.fillStyle = fill;
    ctx.fillRect(x, y, w, h);
  }
  ctx.restore();
  if (preview.kind === "badge") {
    const cx = x + w / 2;
    const cy = y + h / 2;
    const r = Math.min(w, h) * 0.3;
    ctx.beginPath();
    ctx.arc(cx + 4, cy + 5, r, 0, Math.PI * 2);
    ctx.fillStyle = rgba(palette.ink, 0.6);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = mix(palette.card, accent, 0.4);
    ctx.fill();
    ctx.lineWidth = 4;
    ctx.strokeStyle = palette.ink;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx, cy, r - 7, 0, Math.PI * 2);
    ctx.lineWidth = 2;
    ctx.strokeStyle = accent;
    ctx.stroke();
    drawText(ctx, graphemes(preview.text)[0] ?? "", cx, cy + r * 0.06, {
      font: ui(500, Math.round(r * 1.05)),
      fill: palette.text,
      align: "center",
      baseline: "middle",
    });
  }
  rrect(ctx, x, y, w, h, radius);
  ctx.lineWidth = 3;
  ctx.strokeStyle = palette.ink;
  ctx.stroke();
  rrect(ctx, x + 2.5, y + 2.5, w - 5, h - 5, radius - 2);
  ctx.lineWidth = 1.25;
  ctx.strokeStyle = rgba(palette.os, 0.55);
  ctx.stroke();
  ctx.restore();
}

/** One item: preview on the left, category, name, description and price on the right. */
function drawItemTile(
  ctx: SKRSContext2D,
  palette: RenderPalette,
  loaded: LoadedItem,
  box: { x: number; y: number; w: number; h: number },
  options: { locale: string; index?: number; big?: boolean },
): void {
  const { item } = loaded;
  const accent = normalizeHex(item.accent) ?? palette.orange;
  const { x, y, w, h } = box;
  const big = options.big === true;
  drawPanel(ctx, palette, x, y, w, h, { accent });
  const pad = big ? 20 : 14;
  const previewW = Math.round(w * (big ? 0.46 : 0.5));
  drawPreview(ctx, palette, loaded, x + pad + 6, y + pad, previewW - 6, h - pad * 2, accent);

  if (options.index) {
    const bx = x + pad + 6;
    const by = y + pad;
    ctx.beginPath();
    ctx.arc(bx + 2, by + 3, 19, 0, Math.PI * 2);
    ctx.fillStyle = rgba(palette.ink, 0.6);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(bx, by, 19, 0, Math.PI * 2);
    ctx.fillStyle = palette.title;
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = palette.ink;
    ctx.stroke();
    drawText(ctx, String(options.index), bx, by + 2, {
      font: num(28),
      fill: palette.ink,
      align: "center",
      baseline: "middle",
    });
  }

  const tx = x + pad + 6 + previewW + 18;
  const tw = x + w - pad - tx;
  let ty = y + pad + 4;
  const chipH = big ? 30 : 26;
  drawChip(ctx, shout(item.kindLabel), tx, ty, {
    font: ui(700, big ? 13 : 12),
    color: lighten(accent, 0.5),
    fill: mix(palette.card, accent, 0.3),
    line: accent,
    height: chipH,
    spacing: "1.2px",
    shadow: rgba(palette.ink, 0.6),
  });
  ty += chipH + (big ? 38 : 34);
  const name = shout(item.name);
  const size = fitSize(ctx, name, tw, num, big ? 54 : 40, 24);
  drawText(ctx, name, tx, ty, {
    font: num(size),
    fill: palette.text,
    maxWidth: tw,
    stroke: { color: palette.ink, width: 7 },
  });
  if (item.description) {
    ctx.font = ui(500, big ? 15 : 13);
    const lines = wrapLines(ctx, item.description, tw, big ? 3 : 2);
    lines.forEach((line, i) => {
      drawText(ctx, line, tx, ty + 26 + i * (big ? 21 : 18), {
        font: ui(500, big ? 15 : 13),
        fill: palette.muted,
      });
    });
  }

  // Price, bottom right of the tile.
  const baseY = y + h - pad - 6;
  if (item.priceLabel || typeof item.price === "number") {
    const label = item.priceLabel ?? formatInt(item.price ?? 0, options.locale);
    const coin = big ? 20 : 16;
    const fontSize = big ? 50 : 38;
    const labelX = item.priceLabel ? tx : tx + coin * 2 + 10;
    drawText(ctx, label, labelX, baseY, {
      font: num(fontSize),
      fill: palette.title,
      maxWidth: tx + tw - labelX,
      stroke: { color: palette.ink, width: 7 },
    });
    if (!item.priceLabel) {
      drawCoin(ctx, palette, tx + coin, baseY - fontSize * 0.34, coin);
    }
  }

  if (item.stateLabel) {
    const text = shout(item.stateLabel);
    drawRibbon(ctx, palette, text, x + w - pad - 150, y + pad + 2, 150, big ? 34 : 30, {
      fill: palette.green,
      color: readableOn(palette.green, palette),
      font: ui(800, big ? 14 : 12),
      skew: 10,
      spacing: "1.2px",
    });
  }
}

/** Single item preview card. */
export async function renderShopItemCard(
  input: ShopItemCardInput,
  options: RenderOptions = {},
): Promise<RenderedCard> {
  const { width: W, height: H } = SHOP_ITEM_CARD_SIZE;
  const { palette, images, locale } = resolveOptions(options);
  const accent = normalizeHex(input.item.accent) ?? palette.orange;
  return renderCard(W, H, options, async ({ ctx }) => {
    const loaded = await loadPreview(images, input.item);
    paintShell(ctx, palette, {
      width: W,
      height: H,
      image: null,
      gradient: [mix(palette.bg, accent, 0.16), mix(palette.bg, accent, 0.3), palette.bg],
      focal: { x: 220, y: 180 },
      accent,
      seed: hashSeed(input.item.name),
    });
    drawItemTile(
      ctx,
      palette,
      loaded,
      { x: 24, y: 24, w: W - 48, h: H - 48 },
      { locale, big: true },
    );
    if (input.balanceLabel) {
      drawText(ctx, input.balanceLabel, W - 46, H - 52, {
        font: ui(700, 14),
        fill: palette.muted,
        align: "right",
        stroke: { color: rgba(palette.ink, 0.85), width: 4 },
        maxWidth: 220,
      });
    }
    finishShell(ctx, palette, W, H, accent);
  });
}

/** Board of up to four item previews. */
export async function renderShopBoardCard(
  input: ShopBoardCardInput,
  options: RenderOptions = {},
): Promise<RenderedCard> {
  const { width: W, height: H } = SHOP_BOARD_CARD_SIZE;
  const { palette, images, locale } = resolveOptions(options);
  const items = input.items.slice(0, 4);
  return renderCard(W, H, options, async ({ ctx }) => {
    const [wordmark, ...loaded] = await Promise.all([
      loadWordmark(images),
      ...items.map((item) => loadPreview(images, item)),
    ]);
    paintShell(ctx, palette, {
      width: W,
      height: H,
      image: null,
      gradient: [
        mix(palette.bg, palette.ember, 0.22),
        mix(palette.bg, palette.orange, 0.34),
        palette.bg,
      ],
      focal: { x: W / 2, y: 40 },
      accent: palette.orange,
      seed: hashSeed(`${input.title}|${items.length}`),
    });
    drawWordmark(ctx, wordmark, 34, 20, 130, 1);
    const titleText = shout(input.title);
    const size = fitSize(ctx, titleText, 560, (px) => title(titleText, px), 44, 26);
    drawText(ctx, titleText, 186, 58, {
      font: title(titleText, size),
      fill: palette.title,
      stroke: { color: palette.ink, width: 8 },
      shadow: { color: rgba(palette.ink, 0.7), dx: 3, dy: 4 },
      spacing: "1px",
    });
    if (input.subtitle) {
      drawText(ctx, input.subtitle, 188, 84, {
        font: ui(600, 14),
        fill: palette.text,
        maxWidth: 560,
        stroke: { color: rgba(palette.ink, 0.8), width: 4 },
      });
    }
    if (input.balanceLabel) {
      drawChip(ctx, input.balanceLabel, W - 34 - 260, 30, {
        font: ui(700, 15),
        color: palette.ink,
        fill: palette.title,
        line: palette.ink,
        minWidth: 260,
        height: 34,
        shadow: rgba(palette.ink, 0.6),
      });
    }
    const gap = 18;
    const tileW = (W - 64 - gap) / 2;
    const tileH = (H - 112 - 28 - gap) / 2;
    loaded.forEach((entry, i) => {
      const col = i % 2;
      const row = Math.floor(i / 2);
      drawItemTile(
        ctx,
        palette,
        entry,
        { x: 32 + col * (tileW + gap), y: 108 + row * (tileH + gap), w: tileW, h: tileH },
        { locale, index: i + 1 },
      );
    });
    if (items.length === 0) drawSparkle(ctx, W / 2, H / 2, 48, rgba(palette.spark, 0.6));
    if (input.site) {
      drawText(ctx, shout(input.site), W - 36, H - 16, {
        font: ui(700, 12),
        fill: palette.text,
        align: "right",
        spacing: "1.8px",
        stroke: { color: rgba(palette.ink, 0.8), width: 4 },
      });
    }
    finishShell(ctx, palette, W, H, palette.orange);
  });
}
