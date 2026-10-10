import { DEFAULT_PUBLIC_ORIGINS } from "@shenron/config/public-urls";

/** Serve owned scans from the page origin, independently of the CDN. */
export function readerAssetUrl(
  path: string,
  origins: readonly string[] = [DEFAULT_PUBLIC_ORIGINS.cdn, DEFAULT_PUBLIC_ORIGINS.api],
): string {
  const value = path.trim();
  if (/^(?:\.\/|\/)?assets\//.test(value)) {
    return `/${value.replace(/^(?:\.\/|\/)/, "")}`;
  }
  if (!URL.canParse(value)) return value;
  const url = new URL(value);
  if (
    url.pathname.startsWith("/assets/") &&
    origins.some((origin) => new URL(origin).origin === url.origin)
  ) {
    return `${url.pathname}${url.search}`;
  }
  return value;
}
