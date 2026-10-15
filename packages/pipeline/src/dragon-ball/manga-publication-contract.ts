// SPDX-License-Identifier: Apache-2.0
import { isAbsolute } from "node:path";
import { z } from "zod";
import { readerPublicationExtentSchema } from "./sosh-reader-manifest";
const digest = z.string().regex(/^[a-f0-9]{64}$/);
const positive = z.number().int().positive().max(2147483647);
const url = z
  .string()
  .url()
  .refine((value) => {
    const parsed = new URL(value);
    return (
      parsed.protocol === "https:" &&
      !parsed.username &&
      !parsed.password &&
      !parsed.hash &&
      !/(^|\.)fandom\.com$/i.test(parsed.hostname)
    );
  });
const filePin = z.object({ path: z.string().refine(isAbsolute), sha256: digest }).strict();
const row = z.record(z.string(), z.unknown());
export const mangaBundleSchema = z
  .object({
    schema: z.literal("shenron-manga-publication-bundle/v1"),
    series: z.string().regex(/^[A-Z][A-Z0-9_]{0,63}$/),
    volumeId: positive,
    volumeNumber: positive,
    chapterId: positive,
    chapterNumber: positive,
    isbn: z.string().min(10).max(32),
    activate: z.boolean(),
    publicationExtent: readerPublicationExtentSchema.optional(),
    expectedVolume: row,
    expectedVolumeSha256: digest,
    expectedChapter: row,
    expectedChapterSha256: digest,
    source: z
      .object({
        config: filePin,
        input: filePin,
        policy: filePin,
        media: filePin,
        documentUrl: url,
        editionToken: z.string().min(2).max(200),
        volumeToken: z.string().min(2).max(200),
        isbnToken: z.string().min(10).max(32),
      })
      .strict(),
    pages: z
      .array(
        z
          .object({
            sourceUrl: url,
            publicPath: z.string(),
            sha256: digest,
            size: positive.max(33 * 1024 * 1024),
            contentType: z.enum(["image/png", "image/jpeg", "image/webp"]),
            kind: z.enum(["manga", "cover", "supplement"]),
            printedPages: z.array(positive).max(2).nullable(),
          })
          .strict(),
      )
      .min(2)
      .max(2500),
  })
  .strict();
export type MangaBundle = z.infer<typeof mangaBundleSchema>;

export const mangaCandidateSchema = mangaBundleSchema
  .omit({
    schema: true,
    volumeId: true,
    chapterId: true,
    activate: true,
    expectedVolume: true,
    expectedVolumeSha256: true,
    expectedChapter: true,
    expectedChapterSha256: true,
    pages: true,
    source: true,
  })
  .extend({
    schema: z.literal("shenron-manga-acquisition-candidate/v1"),
    source: mangaBundleSchema.shape.source.omit({ media: true }),
    expectedImages: positive.max(2500).nullable(),
    pages: z
      .array(
        mangaBundleSchema.shape.pages.element.pick({
          sourceUrl: true,
          kind: true,
          printedPages: true,
        }),
      )
      .min(2)
      .max(2500),
  })
  .strict();
export type MangaCandidate = z.infer<typeof mangaCandidateSchema>;
