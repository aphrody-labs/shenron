/** Messages between the card pool (`pool.ts`) and its workers (`src/workers/render.ts`). */
import type { CardKind } from "./dispatch";
import type { PaletteToken } from "./theme";
import type { RenderOptions, RenderedCard } from "./types";

/** Render options that cross the worker boundary (the image source stays in the worker). */
export type PoolRenderOptions = Omit<RenderOptions, "images">;

export interface RenderJob {
  type: "render";
  id: number;
  kind: CardKind;
  input: unknown;
  options: PoolRenderOptions;
  /** Runtime theme of the main thread (the workers hold their own copy of the palette). */
  palette: Partial<Record<PaletteToken, string>>;
  /** Encoded pictures the caller already holds, by URL (avatars): they cost no download. */
  inlineImages?: Record<string, Uint8Array>;
}

export type RenderReply =
  | {
      type: "result";
      id: number;
      ok: true;
      card: Omit<RenderedCard, "buffer"> & { data: Uint8Array };
    }
  | { type: "result"; id: number; ok: false; error: string };
