// SPDX-License-Identifier: Apache-2.0

/** Playback of the version 1 atlas exported by the Rust `shenron-panels` owner. */
export interface SpriteAtlasFrame {
  readonly index: number;
  readonly bounds: readonly [number, number, number, number];
  readonly content: readonly [number, number, number, number];
  readonly source: readonly [number, number];
  readonly panel: readonly [number, number, number, number];
}

export interface SpriteAtlas {
  readonly image: string;
  readonly size: readonly [number, number];
  readonly tile: readonly [number, number];
  readonly fps: number;
  readonly frames: readonly SpriteAtlasFrame[];
}

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Invalid sprite atlas object");
  }
  return value as Record<string, unknown>;
}

function integer(value: unknown, minimum: number, maximum = 8192): number {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < minimum ||
    value > maximum
  ) {
    throw new Error("Invalid sprite atlas geometry");
  }
  return value;
}

function tuple(value: unknown, length: 2): readonly [number, number];
function tuple(value: unknown, length: 4): readonly [number, number, number, number];
function tuple(value: unknown, length: number): readonly number[] {
  if (!Array.isArray(value) || value.length !== length)
    throw new Error("Invalid sprite atlas tuple");
  return Object.freeze(value.map((part) => integer(part, 0)));
}

/** Validate and detach an untrusted JSON document before it reaches drawImage. */
export function parseSpriteAtlas(input: unknown): SpriteAtlas {
  const value = object(input);
  if (
    value.version !== 1 ||
    typeof value.image !== "string" ||
    !value.image.endsWith(".png") ||
    /[\\/?:#%]/u.test(value.image) ||
    Array.from(value.image).some((part) => part.charCodeAt(0) < 32)
  ) {
    throw new Error("Invalid sprite atlas version or image name");
  }
  const size = tuple(value.size, 2);
  const tile = tuple(value.tile, 2);
  const padding = tuple(value.padding, 2);
  const offset = tuple(value.offset, 2);
  const columns = integer(value.columns, 1);
  const rows = integer(value.rows, 1);
  const count = integer(value.frame_count, 1, 4096);
  if (
    tile.some((side) => side === 0) ||
    size.some((side) => side === 0) ||
    offset.some((side) => side !== 0) ||
    columns * tile[0] + (columns - 1) * padding[0] !== size[0] ||
    rows * tile[1] + (rows - 1) * padding[1] !== size[1] ||
    count > columns * rows ||
    !Array.isArray(value.frames) ||
    value.frames.length !== count ||
    typeof value.fps !== "number" ||
    !Number.isFinite(value.fps) ||
    value.fps < 1 ||
    value.fps > 100
  ) {
    throw new Error("Inconsistent sprite atlas grid or timing");
  }
  const frames = value.frames.map((entry, index): SpriteAtlasFrame => {
    const frame = object(entry);
    const bounds = tuple(frame.bounds, 4);
    const content = tuple(frame.content, 4);
    const source = tuple(frame.source, 2);
    const panel = frame.panel;
    const x = (index % columns) * (tile[0] + padding[0]);
    const y = Math.floor(index / columns) * (tile[1] + padding[1]);
    if (
      frame.index !== index ||
      bounds[0] !== x ||
      bounds[1] !== y ||
      bounds[2] !== tile[0] ||
      bounds[3] !== tile[1] ||
      content[2] === 0 ||
      content[3] === 0 ||
      source.some((side) => side === 0) ||
      content[0] < x ||
      content[1] < y ||
      content[0] + content[2] > x + tile[0] ||
      content[1] + content[3] > y + tile[1] ||
      !Array.isArray(panel) ||
      panel.length !== 4 ||
      panel.some(
        (part) => typeof part !== "number" || !Number.isFinite(part) || part < 0 || part > 1,
      ) ||
      panel[2] === 0 ||
      panel[3] === 0 ||
      panel[0] + panel[2] > 1.00001 ||
      panel[1] + panel[3] > 1.00001
    ) {
      throw new Error("Invalid sprite atlas frame");
    }
    return Object.freeze({
      index,
      bounds,
      content,
      source,
      panel: Object.freeze([...panel]) as readonly [number, number, number, number],
    });
  });
  return Object.freeze({
    image: value.image,
    size,
    tile,
    fps: value.fps,
    frames: Object.freeze(frames),
  });
}

/** Deterministic playback; no timer or animation loop is created implicitly. */
export class SpriteAtlasPlayer {
  readonly atlas: SpriteAtlas;

  constructor(manifest: unknown) {
    this.atlas = parseSpriteAtlas(manifest);
  }

  frameAt(elapsedMs: number, loop = true): SpriteAtlasFrame {
    if (!Number.isFinite(elapsedMs) || elapsedMs < 0)
      throw new Error("Invalid sprite playback time");
    const { fps, frames } = this.atlas;
    const duration = (frames.length * 1000) / fps;
    const position = loop ? elapsedMs % duration : Math.min(elapsedMs, duration);
    return frames[Math.min(frames.length - 1, Math.floor((position * fps) / 1000))];
  }

  /** Draw one original atlas tile at integer pixel coordinates and integer scale. */
  draw(
    context: Pick<
      CanvasRenderingContext2D,
      "save" | "restore" | "drawImage" | "imageSmoothingEnabled"
    >,
    image: CanvasImageSource & { width: number; height: number },
    elapsedMs: number,
    {
      x = 0,
      y = 0,
      scale = 1,
      loop = true,
    }: { x?: number; y?: number; scale?: number; loop?: boolean } = {},
  ): number {
    if (
      !Number.isFinite(x) ||
      !Number.isFinite(y) ||
      !Number.isInteger(scale) ||
      scale < 1 ||
      scale > 32 ||
      image.width !== this.atlas.size[0] ||
      image.height !== this.atlas.size[1]
    ) {
      throw new Error("Sprite image dimensions or destination do not match the atlas");
    }
    const frame = this.frameAt(elapsedMs, loop);
    context.save();
    try {
      context.imageSmoothingEnabled = false;
      context.drawImage(
        image,
        ...frame.bounds,
        Math.round(x),
        Math.round(y),
        frame.bounds[2] * scale,
        frame.bounds[3] * scale,
      );
    } finally {
      context.restore();
    }
    return frame.index;
  }
}

async function bytes(response: Response, maximum: number): Promise<Uint8Array<ArrayBuffer>> {
  if (!response.ok || !response.body) throw new Error(`Sprite asset HTTP ${response.status}`);
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > maximum) throw new Error("Sprite asset exceeds its byte limit");
      chunks.push(chunk.value);
    }
  } catch (error) {
    await reader.cancel().catch(() => undefined);
    throw error;
  } finally {
    reader.releaseLock();
  }
  const output = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.length;
  }
  return output;
}

/** Explicit browser loading of a Rust manifest and its sibling PNG; close the returned bitmap. */
export async function loadSpriteAtlas(manifestUrl: string | URL, signal?: AbortSignal) {
  const url = new URL(manifestUrl);
  if (url.protocol !== "https:" && url.protocol !== "http:")
    throw new Error("Invalid sprite asset URL");
  const options: RequestInit = { signal, credentials: "omit", redirect: "error" };
  const manifest = JSON.parse(
    new TextDecoder().decode(await bytes(await fetch(url, options), 1024 * 1024)),
  );
  const player = new SpriteAtlasPlayer(manifest);
  const data = await bytes(
    await fetch(new URL(player.atlas.image, url), options),
    64 * 1024 * 1024,
  );
  return decodeSpriteAtlas(player, data, signal);
}

/** Opens an explicitly selected local atlas without uploading its source files. */
export async function openSpriteAtlas(manifest: unknown, png: Blob, signal?: AbortSignal) {
  signal?.throwIfAborted();
  if (png.size > 64 * 1024 * 1024) throw new Error("Sprite asset exceeds its byte limit");
  const player = new SpriteAtlasPlayer(manifest);
  return decodeSpriteAtlas(player, new Uint8Array(await png.arrayBuffer()), signal);
}

async function decodeSpriteAtlas(
  player: SpriteAtlasPlayer,
  data: Uint8Array<ArrayBuffer>,
  signal?: AbortSignal,
) {
  signal?.throwIfAborted();
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  if (
    data.length < 24 ||
    view.getUint32(0) !== 0x89504e47 ||
    view.getUint32(4) !== 0x0d0a1a0a ||
    view.getUint32(12) !== 0x49484452 ||
    view.getUint32(16) !== player.atlas.size[0] ||
    view.getUint32(20) !== player.atlas.size[1]
  )
    throw new Error("Sprite PNG dimensions differ from the manifest");
  const image = await createImageBitmap(new Blob([data], { type: "image/png" }));
  if (signal?.aborted) {
    image.close();
    signal.throwIfAborted();
  }
  return { player, image, close: () => image.close() };
}
