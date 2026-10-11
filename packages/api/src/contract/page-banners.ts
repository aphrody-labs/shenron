// SPDX-License-Identifier: Apache-2.0
import { z } from "zod";
import { PAGE_HERO_KEYS } from "@aphrody/shenron-config/page-banners";
export const PageBannersSchema = z
  .object({
    pages: z.object(Object.fromEntries(PAGE_HERO_KEYS.map((key) => [key, z.string()]))),
    series: z.record(z.string(), z.string()),
    fallback: z.string(),
  })
  .meta({ id: "PageBanners" });
export const PageBannersResponse = z
  .object({ banners: PageBannersSchema })
  .meta({ id: "PageBannersResponse" });
export const PageBannersSaveResponse = PageBannersResponse.extend({ ok: z.literal(true) }).meta({
  id: "PageBannersSaveResponse",
});
