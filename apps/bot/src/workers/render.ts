/**
 * render.ts — Bun Worker that draws the cards (`~/render/pool`), so the Discord gateway never
 * waits for the canvas. One job at a time: decode the pictures, draw, encode, post the bytes
 * back (transferred, not copied).
 *
 *   in   { type: "render", id, kind, input, options, palette, inlineImages? }
 *   out  { type: "result", id, ok: true, card } | { type: "result", id, ok: false, error }
 *   and `{ status: "ready" }` once at start (handshake of `whenWorkerReady`).
 *
 * Pictures come from the worker's own caches (bot assets, Discord avatars, episode frames
 * with a disk copy shared by all workers); `inlineImages` lets the caller hand over encoded
 * avatars it already holds, which then cost no download.
 */
import { loadImage } from "@napi-rs/canvas";
import { renderInline } from "~/render/dispatch";
import { defaultImages } from "~/render/images";
import { setPaletteOverrides } from "~/render/theme";
import type { RenderJob, RenderReply } from "~/render/pool-protocol";
import type { ImageSource } from "~/render/types";

declare const self: Worker;

/** Image source of a job: the caller's own avatars first, then the worker defaults. */
function imagesOf(inline: Record<string, Uint8Array> | undefined): ImageSource {
  if (!inline) return defaultImages;
  const decoded = new Map<string, ReturnType<typeof loadImage>>();
  return {
    avatar: async (url) => {
      const bytes = inline[url];
      if (!bytes) return defaultImages.avatar(url);
      let image = decoded.get(url);
      if (!image) {
        image = loadImage(Buffer.from(bytes.buffer, bytes.byteOffset, bytes.length));
        decoded.set(url, image);
      }
      return image.catch(() => null);
    },
    asset: defaultImages.asset,
  };
}

async function handle(job: RenderJob): Promise<void> {
  try {
    setPaletteOverrides(job.palette);
    const card = await renderInline(job.kind, job.input as never, {
      ...job.options,
      images: imagesOf(job.inlineImages),
    });
    // a copy owned by this reply alone, so its buffer can be transferred
    const data = new Uint8Array(card.buffer);
    const { buffer: _buffer, ...meta } = card;
    const reply: RenderReply = { type: "result", id: job.id, ok: true, card: { ...meta, data } };
    self.postMessage(reply, [data.buffer]);
  } catch (error) {
    const reply: RenderReply = {
      type: "result",
      id: job.id,
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
    self.postMessage(reply, []);
  }
}

self.addEventListener("message", (event: MessageEvent<RenderJob>) => {
  if (event.data?.type === "render") void handle(event.data);
});
self.postMessage({ status: "ready" }, []);
