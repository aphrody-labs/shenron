// SPDX-License-Identifier: Apache-2.0
/** Pure wire schemas shared by the native Web owner and Node consumers. */
import { z } from "zod";

export const WEB_PATHS = {
  status: "/api/v1/web/status",
  framesStats: "/api/v1/web/frames/stats",
  framesVector: "/api/v1/web/frames/vector",
  framesSearch: "/api/v1/web/frames/search",
  mediaResolve: "/api/v1/web/media/resolve",
  mediaSearch: "/api/v1/web/media/search",
} as const;
export const WebCapability = z.enum([
  "frames-stats",
  "frames-vector",
  "frames-search",
  "media-resolve",
  "media-search",
]);
export const WebStatus = z.object({
  version: z.string().min(1),
  capabilities: z.array(WebCapability),
});
export const WebImage = z.object({
  imageBase64: z
    .string()
    .min(4)
    .max(24 * 1024 * 1024)
    .regex(/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/),
});
export const WebFrameSearch = WebImage.extend({
  mode: z.enum(["--local", "--remote"]).default("--local"),
  limit: z.number().int().positive().max(100).optional(),
});
export const WebMediaResolve = z.object({
  url: z
    .string()
    .url()
    .refine((value) => {
      const url = new URL(value);
      return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password;
    }),
});
export const WebMediaSearch = z.object({ query: z.string().trim().min(1).max(512) });
export const WebMediaSource = z.object({
  host: z.string(),
  originalUrl: z.string().optional(),
  directUrl: z.string().optional(),
  hlsUrl: z.string().optional(),
  qualities: z.record(z.string(), z.string()).optional(),
  headers: z.record(z.string(), z.string()).optional(),
});
export const WebMediaResults = z.object({
  animesama: z.array(z.unknown()),
  voiranime: z.array(z.unknown()),
});

export type DbcnCatalogCategory =
  | "full_color"
  | "jp_original"
  | "zh_cn"
  | "zh_hk"
  | "taiwan"
  | "kanzenban"
  | "anime_movie"
  | "anime_z"
  | "arale_cn"
  | "arale_jp"
  | "arale_hk"
  | "all";

export const DbcnVolumeItemSchema = z.object({
  id: z.string(),
  title: z.string(),
  category: z.string(),
  categoryTitle: z.string().optional(),
  arc: z.string().optional(),
  coverUrl: z.string().optional(),
  url: z.string().optional(),
  date: z.string().optional(),
});
export type DbcnVolumeItem = z.infer<typeof DbcnVolumeItemSchema>;

export const DbcnPageItemSchema = z.object({
  pageNumber: z.number(),
  name: z.string().default(""),
  size: z.string().optional(),
  thumbUrl: z.string().default(""),
  imageUrl: z.string().default(""),
  pageUrl: z.string().default(""),
});
export type DbcnPageItem = z.infer<typeof DbcnPageItemSchema>;

export const DbcnVolumeInfoSchema = z.object({
  id: z.string(),
  title: z.string(),
  totalPages: z.number(),
  pages: z.array(DbcnPageItemSchema).default([]),
});
export type DbcnVolumeInfo = z.infer<typeof DbcnVolumeInfoSchema>;

export const DbcnSinglePageViewSchema = z.object({
  pageNumber: z.number(),
  name: z.string().default(""),
  thumbUrl: z.string().default(""),
  imageUrl: z.string().default(""),
  pageUrl: z.string().default(""),
});
export type DbcnSinglePageView = z.infer<typeof DbcnSinglePageViewSchema>;

// ==========================================
// 6. FRAMES (COLORLAYOUT & TRACE.MOE) SCHEMAS & TYPES
// ==========================================

export const FrameMatchPreviewSchema = z.object({
  image: z.string().default(""),
  video: z.string().default(""),
});

export const FrameMatchSchema = z.object({
  title: z.string(),
  episode: z.number().nullable().optional(),
  season: z.number().nullable().optional(),
  fromMs: z.number().default(0),
  atMs: z.number().default(0),
  toMs: z.number().default(0),
  similarity: z.number().default(0),
  source: z.string().default(""),
  anilist: z.number().default(0),
  preview: FrameMatchPreviewSchema.default({ image: "", video: "" }),
});
export type FrameMatch = z.infer<typeof FrameMatchSchema>;

export const BxcSearchOutputSchema = z.object({
  origin: z.string().default("local"),
  matches: z.array(FrameMatchSchema).default([]),
  quota: z
    .object({
      used: z.number(),
      total: z.number(),
    })
    .optional(),
});
export type BxcSearchOutput = z.infer<typeof BxcSearchOutputSchema>;

export const BxcVectorOutputSchema = z.object({
  hash: z.string(),
  vector: z.array(z.number()),
});
export type BxcVectorOutput = z.infer<typeof BxcVectorOutputSchema>;

export const BxcFramesStatsSchema = z.object({
  path: z.string(),
  media: z.number(),
  frames: z.number(),
  durationMs: z.number(),
});
export type BxcFramesStats = z.infer<typeof BxcFramesStatsSchema>;
