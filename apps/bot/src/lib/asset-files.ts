/**
 * Disk resolution of the bot's static files through the dedup alias manifest
 * (`@shenron/images/asset-aliases.json`).
 *
 * Byte-identical copies shared with the site (fonts, `dbz/`, banners) live once,
 * under `apps/site/public/`; the bot keeps serving them at their historical
 * `/assets/**` URLs and loads them for canvas from the canonical copy. Roots
 * follow the process cwd (`apps/bot`), like the rest of the static handlers
 * (`assets/…`, `../site/public/wiki`).
 *
 * The UI artwork (favicons, app icons, brand PNGs under `dbz/marque/`) is only
 * copied into `apps/site/public/` by the site's predev/prebuild
 * (`packages/ui/scripts/sync-assets.ts --to public`). The bot therefore reads
 * it from its source, `packages/ui/assets/`, under the same name: a bot
 * deployed without a site build still finds it.
 */
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { type AssetRoots, resolveAppFile } from "@shenron/images/resolve";

function assetRoots(cwd: string = process.cwd()): AssetRoots {
  return { bot: resolve(cwd), site: resolve(cwd, "..", "site") };
}

const posix = (path: string) => path.replaceAll("\\", "/");

/** `packages/ui/assets`, source of the artwork the site copies into `public/`. */
export function uiAssetsDir(cwd: string = process.cwd()): string {
  return posix(resolve(cwd, "..", "..", "packages", "ui", "assets"));
}

/**
 * Absolute disk path of a bot file given relative to `apps/bot`
 * (`assets/fonts/Inter-Bold.ttf`, `public/favicon.ico`), following aliases.
 * An alias into `apps/site/public/` whose name exists in `packages/ui/assets/`
 * resolves to that source file.
 */
export function botFile(relative: string, cwd?: string): string {
  const roots = assetRoots(cwd);
  const path = posix(resolveAppFile("bot", relative, roots));
  const sitePublic = `${posix(resolve(roots.site, "public"))}/`;
  if (path.startsWith(sitePublic)) {
    const source = `${uiAssetsDir(cwd)}/${path.slice(sitePublic.length)}`;
    if (existsSync(source)) return source;
  }
  return path;
}
