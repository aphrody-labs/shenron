// SPDX-License-Identifier: Apache-2.0
import { z } from "zod";

const citation = z
  .string()
  .url()
  .refine((value) => {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      !/(^|\.)fandom\.com$/i.test(url.hostname)
    );
  });
const imageUrl = citation.refine((value) => {
  const url = new URL(value);
  return (
    [
      "dragonballfr.com",
      "cdn.dragonballfr.com",
      "bot.dragonballfr.com",
      "shenron-cdn.aphrody-labs.workers.dev",
    ].includes(url.hostname) &&
    url.pathname.startsWith("/assets/") &&
    !url.search &&
    !url.hash
  );
});
export const soshReaderManifestSchema = z
  .object({
    version: z.literal(1),
    collection: z.literal("SOSH"),
    rightsEvidence: z.string().trim().min(1),
    volumes: z
      .array(
        z
          .object({
            volumeId: z.number().int().min(701).max(718),
            volumeNumber: z.number().int().min(1).max(18),
            chapterId: z.number().int().positive().max(2147483647),
            title: z.string().trim().min(1).max(500),
            titleJa: z.string().trim().min(1).max(500),
            sourceUrl: citation,
            pageCountEvidence: citation,
            expectedPages: z.number().int().positive().max(2000),
            review: z.literal("approved"),
            pages: z
              .array(
                z
                  .object({
                    number: z.number().int().nonnegative(),
                    readerImage: imageUrl,
                    sha256: z.string().regex(/^[a-f0-9]{64}$/),
                  })
                  .strict(),
              )
              .min(1)
              .max(2000),
          })
          .strict(),
      )
      .min(1)
      .max(18),
  })
  .strict();
export type SoshReaderManifest = z.infer<typeof soshReaderManifestSchema>;

export function validateSoshReaderManifest(value: unknown): SoshReaderManifest {
  const manifest = soshReaderManifestSchema.parse(value);
  const ids = new Set<number>();
  const chapters = new Set<number>();
  const images = new Set<string>();
  for (const volume of manifest.volumes) {
    if (
      volume.volumeId !== 700 + volume.volumeNumber ||
      ids.has(volume.volumeId) ||
      chapters.has(volume.chapterId)
    )
      throw new Error("Duplicate or inconsistent SOSH identity");
    ids.add(volume.volumeId);
    chapters.add(volume.chapterId);
    if (volume.pages.length !== volume.expectedPages)
      throw new Error("Incomplete page enumeration");
    let previous = -1;
    for (const page of volume.pages) {
      if (page.number <= previous || images.has(page.readerImage))
        throw new Error("Page order or identity differs");
      previous = page.number;
      images.add(page.readerImage);
    }
  }
  return manifest;
}
