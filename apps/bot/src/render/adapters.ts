/**
 * Glue between the card renderer and the bot services: image loaders backed by the shared
 * `BackgroundCacheService` (decoded banners kept once for every service) and the CDN cache
 * of avatars. Structural types only: the renderer never imports a DI class.
 */
import type { Image } from "@napi-rs/canvas";
import { loadRemoteImage } from "~/lib/canvas-kit";
import type { ImageSource } from "./types";

/** What the renderer needs from `BackgroundCacheService`. */
export interface BackgroundLoader {
  get(relativePath: string, options?: { optional?: boolean }): Promise<Image | null>;
}

/** Image source reading banners and backgrounds through the shared cache. */
export function imageSourceFrom(backgrounds: BackgroundLoader): ImageSource {
  return {
    avatar: (url) => loadRemoteImage(url),
    // Candidates are probed in order: an absent file is expected, not worth a warning.
    asset: (ref) => backgrounds.get(ref, { optional: true }),
  };
}

/** Extensions probed for a banner or card key given without one. */
export const PICTURE_EXTENSIONS = ["webp", "png", "jpg"] as const;

/** `base.webp`, `base.png`, `base.jpg`: candidates for a picture whose extension is unknown. */
export function withExtensions(base: string): string[] {
  return PICTURE_EXTENSIONS.map((extension) => `${base}.${extension}`);
}
