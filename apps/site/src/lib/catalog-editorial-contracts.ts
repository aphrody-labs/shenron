// SPDX-License-Identifier: Apache-2.0
import { z } from "zod";
import { parseMediaCatalogBody } from "./catalog-media-contracts";

const httpUrl = z
  .string()
  .url()
  .refine((value) => {
    try {
      const url = new URL(value);
      return (
        (url.protocol === "https:" || url.protocol === "http:") && !url.username && !url.password
      );
    } catch {
      return false;
    }
  });
const subtitleSource = z.string().refine((value) => {
  if (httpUrl.safeParse(value).success) return true;
  return /^\/?assets\/subtitles\//.test(value) && !value.includes("..") && !/[\\?#]/.test(value);
});
const subtitle = z
  .object({
    lang: z.string().regex(/^[a-z]{2,3}(?:-[A-Za-z]{2,4})?$/),
    label: z.string().min(1).max(200),
    src: subtitleSource,
  })
  .strict();
const player = z
  .object({
    name: z.string().min(1).max(200),
    provider: z.string().min(1).max(200),
    embedUrl: httpUrl,
    lang: z.enum(["vf", "vostfr", "vost"]).optional(),
  })
  .strict();
const availability = z
  .object({
    provider: z.string().min(1).max(200),
    label: z.string().min(1).max(200),
    url: httpUrl,
    embedUrl: httpUrl.nullable(),
    langs: z.array(z.enum(["vf", "vostfr", "vost"])).max(3),
    available: z.boolean(),
    checkedAt: z.number().int().nonnegative().safe(),
  })
  .strict();

// Generic JSON editors send strings; normalize before the CRUD coercion can
// silently turn malformed JSON into null and erase the existing metadata.
const jsonInput = (schema: z.ZodType) =>
  z.preprocess((value) => {
    if (typeof value !== "string") return value;
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  }, schema);
const episodeFrame = z
  .object({
    source: z.enum(["ffmpeg", "bun-video"]),
    sourceId: z.string().min(1).max(512),
    sourceUrl: z.string().max(4096).nullable(),
    episodeNumber: z.number().int().nonnegative().nullable(),
    imagePath: z.string().min(1).max(4096).nullable(),
    timecodeSec: z.number().finite().min(0).max(86400).nullable(),
    width: z.number().int().min(1).max(16384).nullable(),
    height: z.number().int().min(1).max(16384).nullable(),
    characterNames: z.array(z.string().max(200)).max(100),
    tags: z.array(z.string().max(200)).max(100),
    caption: z.string().max(4000).nullable(),
    isNotable: z.boolean(),
    sortOrder: z.number().int().nonnegative(),
  })
  .strict()
  .superRefine((frame, ctx) => {
    if (frame.source !== "bun-video") return;
    const publicUrl = (value: string | null, png = false): boolean => {
      if (!value || !URL.canParse(value)) return false;
      const url = new URL(value);
      return (
        url.protocol === "https:" &&
        !url.username &&
        !url.password &&
        !url.search &&
        !url.hash &&
        url.href === value &&
        !url.hostname.endsWith(".r2.dev") &&
        !url.hostname.endsWith(".r2.cloudflarestorage.com") &&
        (!png || url.pathname.toLowerCase().endsWith(".png"))
      );
    };
    const parts = frame.sourceId.match(/^bun-video:([a-f0-9]{64}):(.+)$/);
    if (
      !parts ||
      frame.timecodeSec === null ||
      parts[2] !== String(frame.timecodeSec) ||
      frame.width === null ||
      frame.height === null ||
      !publicUrl(frame.sourceUrl) ||
      !publicUrl(frame.imagePath, true)
    ) {
      ctx.addIssue({ code: "custom", message: "Invalid native frame source, timestamp or PNG" });
    }
  });
const episodeMetadata = z
  .object({
    streamUrl: httpUrl.nullable().optional(),
    durationSec: z.preprocess(
      (value) => (typeof value === "string" && /^\d+$/.test(value) ? Number(value) : value),
      z.number().int().min(0).max(86400).nullable().optional(),
    ),
    frames: jsonInput(z.array(episodeFrame).max(600).nullable()).optional(),
    // Public language flags are derived from qualified offers, never stored columns.
    hasVf: z.never().optional(),
    hasVost: z.never().optional(),
    hasVostfr: z.never().optional(),
    officialSourceUrl: z
      .union([httpUrl, z.literal("")])
      .nullable()
      .optional(),
    synopsisFr: z.string().max(100_000).nullable().optional(),
    subtitles: jsonInput(z.array(subtitle).max(100).nullable()).optional(),
    players: jsonInput(z.array(player).max(100).nullable()).optional(),
    availability: jsonInput(z.array(availability).max(100).nullable()).optional(),
  })
  .passthrough();

export function validateCatalogEditorialBody(
  table: string,
  body: Record<string, unknown>,
  forInsert = false,
) {
  if (["media_works", "media_editions", "media_volumes"].includes(table)) {
    try {
      return { ok: true as const, value: parseMediaCatalogBody(table, body, forInsert) };
    } catch (error) {
      if (!(error instanceof z.ZodError)) throw error;
      return { ok: false as const, fields: error.issues.map((issue) => issue.path.join(".")) };
    }
  }
  if (table !== "db_episodes") return { ok: true as const, value: body };
  const parsed = episodeMetadata.safeParse(body);
  if (!parsed.success) {
    return {
      ok: false as const,
      fields: parsed.error.issues.map((issue) => issue.path.join(".")),
    };
  }
  return { ok: true as const, value: parsed.data };
}

/** Whole-page JSON includes OCR and translations; bibliography remains writable. */
export function writesDatabookPages(table: string, body: Record<string, unknown>): boolean {
  return table === "db_databooks" && Object.hasOwn(body, "pages");
}
