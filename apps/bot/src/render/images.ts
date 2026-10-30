/**
 * Image loading of the cards. A missing, slow or corrupt image is never an error: the
 * loaders resolve `null` and the card draws its fallback (gradient, initial, no logo).
 */
import { existsSync } from "node:fs";
import { loadImage, type Image } from "@napi-rs/canvas";
import { botFile, uiAssetsDir } from "~/lib/asset-files";
import { isRemoteRef, loadFrameImage, loadRemoteImage } from "~/lib/canvas-kit";
import { RENDER_ASSET_FILES } from "./assets";
import type { ImageSource } from "./types";

/** Decoded banners weigh several MiB each: a small LRU keeps the resident set bounded. */
const ASSET_CACHE_MAX = 24;
/** A file that was absent is looked up again after this delay (an admin may upload it). */
const ABSENT_TTL_MS = 30_000;

const decoded = new Map<string, Image>();
const absent = new Map<string, number>();
const inflight = new Map<string, Promise<Image | null>>();

/** Forgets every decoded asset (tests, `/reload`, admin uploads). */
export function clearAssetCache(): void {
  decoded.clear();
  absent.clear();
}

/** `ui:` prefix: a file of `packages/ui/assets`, read from the source tree. */
function resolveRef(ref: string): string {
  return ref.startsWith("ui:") ? `${uiAssetsDir()}/${ref.slice(3)}` : botFile(ref);
}

/** Decodes a local image through the cache; `null` when it is absent or unreadable. */
export async function loadLocalImage(ref: string): Promise<Image | null> {
  const hit = decoded.get(ref);
  if (hit) {
    decoded.delete(ref);
    decoded.set(ref, hit);
    return hit;
  }
  const missedAt = absent.get(ref);
  if (missedAt !== undefined && Date.now() - missedAt < ABSENT_TTL_MS) return null;
  const pending = inflight.get(ref);
  if (pending) return pending;
  const task = (async (): Promise<Image | null> => {
    try {
      const path = resolveRef(ref);
      if (!existsSync(path)) throw new Error("absent");
      const image = await loadImage(Buffer.from(await Bun.file(path).arrayBuffer()));
      absent.delete(ref);
      decoded.set(ref, image);
      while (decoded.size > ASSET_CACHE_MAX) {
        const oldest = decoded.keys().next().value;
        if (oldest === undefined) break;
        decoded.delete(oldest);
      }
      return image;
    } catch {
      absent.set(ref, Date.now());
      return null;
    } finally {
      inflight.delete(ref);
    }
  })();
  inflight.set(ref, task);
  return task;
}

/** A local asset (relative to `apps/bot`, or `ui:`) or a frame URL, through their caches. */
export const loadAsset = (ref: string): Promise<Image | null> =>
  isRemoteRef(ref) ? loadFrameImage(ref) : loadLocalImage(ref);

/** Discord CDN avatars (shared bounded cache), the bot assets on disk and the episode frames. */
export const defaultImages: ImageSource = {
  avatar: (url) => loadRemoteImage(url),
  asset: loadAsset,
};

/** First of `refs` that decodes, in order; `null` when none does. */
export async function firstImage(
  source: ImageSource,
  refs: ReadonlyArray<string | null | undefined>,
): Promise<Image | null> {
  for (const ref of refs) {
    if (!ref) continue;
    const image = await source.asset(ref).catch(() => null);
    if (image) return image;
  }
  return null;
}

/** Avatar image, or `null` for no URL, a failed download or a throwing source. */
export async function avatarImage(
  source: ImageSource,
  url: string | null | undefined,
): Promise<Image | null> {
  if (!url) return null;
  return source.avatar(url).catch(() => null);
}

/** The DRAGONBALL.FR logo of the site: own asset first, then the UI source file. */
export const WORDMARK_REFS = [RENDER_ASSET_FILES[0], "ui:brand/dragonballfr-logo.svg"] as const;

export const loadWordmark = (source: ImageSource): Promise<Image | null> =>
  firstImage(source, WORDMARK_REFS);
