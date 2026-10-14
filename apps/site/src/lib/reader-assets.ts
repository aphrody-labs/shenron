import { DEFAULT_PUBLIC_ORIGINS } from "@aphrody/shenron-config/public-urls";
import { reviewedSourceMediaUrl } from "./reviewed-source-media";

/** Serve owned scans from the page origin, independently of the CDN. */
export function readerAssetUrl(
  path: string,
  origins: readonly string[] = [
    DEFAULT_PUBLIC_ORIGINS.cdn,
    DEFAULT_PUBLIC_ORIGINS.api,
    DEFAULT_PUBLIC_ORIGINS.site,
  ],
): string {
  const value = path.trim();
  const publication = reviewedSourceMediaUrl(value);
  if (publication) return publication;
  const localPath = (asset: string) => asset.replace(/^\/assets\/wiki\//, "/wiki/");
  if (/^(?:\.\/|\/)?assets\//.test(value)) {
    return localPath(`/${value.replace(/^(?:\.\/|\/)/, "")}`);
  }
  if (!URL.canParse(value)) return value;
  const url = new URL(value);
  if (
    url.pathname.startsWith("/assets/") &&
    origins.some((origin) => new URL(origin).origin === url.origin)
  ) {
    return localPath(`${url.pathname}${url.search}`);
  }
  return value;
}
