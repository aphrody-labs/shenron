/**
 * Pictures of `apps/bot` the card renderer needs besides banners and fonts, relative to
 * `apps/bot`. One list for the loader, the release copy (`scripts/ship-canvas-assets.ts`)
 * and the `--smoke` check of the compiled binary: a release missing one of them fails.
 */
export const RENDER_ASSET_FILES = ["assets/render/wordmark.png"] as const;
