// SPDX-License-Identifier: Apache-2.0
import { API_URL as API } from "@/lib/config";
import { assetUrl } from "@/lib/assets";
import {
  createDefaultPageBanners,
  resolvePageBanners as resolveSharedBanners,
  type PageBannersConfig,
} from "@shenron/config/page-banners";
export * from "@shenron/config/page-banners";
const FALLBACK = createDefaultPageBanners(API).fallback;
export const DEFAULT_PAGE_BANNERS = createDefaultPageBanners(API);
export function resolvePageBanners(patch: unknown): PageBannersConfig {
  return resolveSharedBanners(patch, DEFAULT_PAGE_BANNERS);
}

/** Normalise une valeur stockée en URL affichable. */
export function resolveBannerUrl(path: string | null | undefined, fallback = FALLBACK): string {
  const raw = (path ?? "").trim();
  if (!raw) return fallback;
  if (/^https?:\/\//i.test(raw)) return raw;
  const resolved = assetUrl(raw);
  return resolved || fallback;
}
