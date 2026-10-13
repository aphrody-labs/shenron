import { isWorkshopStaffPath } from "@/lib/library";
import { staffLegacyRedirect } from "@/lib/legacy-routes";

export function allowsPublicAds(pathname: string | null): boolean {
  if (!pathname) return false;
  const privatePrefixes = ["/admin", "/studio", "/desktop"];
  return (
    !privatePrefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)) &&
    !isWorkshopStaffPath(pathname) &&
    staffLegacyRedirect(pathname) === null
  );
}

export function needsAdvertisingReset(
  previousPath: string | null,
  nextPath: string | null,
): boolean {
  return allowsPublicAds(previousPath) && !allowsPublicAds(nextPath);
}
