// SPDX-License-Identifier: Apache-2.0
import { z } from "zod";
import { DEFAULT_PUBLIC_ORIGINS } from "@aphrody/shenron-config/public-urls";

type CardImageEvidence = {
  frontImageUrl?: string;
  frontImageWidth?: number;
  frontImageHeight?: number;
  frontImageSourceUrl?: string;
  frontImageRights?: string;
};

/** Shared by the existing catalogue import and the image-only administrative writer. */
export function validateCardImageEvidence(row: CardImageEvidence, context: z.RefinementCtx) {
  if (
    (row.frontImageWidth === undefined) !== (row.frontImageHeight === undefined) ||
    ((row.frontImageWidth !== undefined || row.frontImageHeight !== undefined) &&
      !row.frontImageUrl)
  )
    context.addIssue({
      code: "custom",
      message: "Front image dimensions must be supplied together with the image",
      path: ["frontImageWidth"],
    });
  const fields = [row.frontImageUrl, row.frontImageSourceUrl, row.frontImageRights];
  if (fields.some(Boolean) && !fields.every(Boolean)) {
    context.addIssue({
      code: "custom",
      message: "Image URL, source and rights must be provided together",
      path: ["frontImageUrl"],
    });
    return;
  }
  if (!row.frontImageUrl) return;
  try {
    const image = new URL(row.frontImageUrl);
    const source = new URL(row.frontImageSourceUrl!);
    if (
      image.origin !== DEFAULT_PUBLIC_ORIGINS.cdn ||
      image.href !== row.frontImageUrl ||
      image.username ||
      image.password ||
      image.search ||
      image.hash ||
      !/^\/publications\/[a-z0-9-]+\/objects\/[a-f0-9]{64}\.(?:png|jpe?g|webp|gif|avif)$/.test(
        image.pathname,
      ) ||
      source.protocol !== "https:" ||
      source.username ||
      source.password ||
      /(?:^|\.)(?:fandom|wikia)\.com$/.test(source.hostname)
    )
      throw new Error("Invalid image evidence");
  } catch {
    context.addIssue({
      code: "custom",
      message: "Imported card images require a content-addressed DBFR CDN URL and HTTPS source",
      path: ["frontImageUrl"],
    });
  }
}

export const CARD_IMAGE_BATCH_MAX_ROWS = 100;
export const CARD_IMAGE_BATCH_MAX_BYTES = 800_000;
export const cardImageImportItem = z
  .object({
    setId: z.string().trim().min(1).max(180),
    cardNumber: z.string().trim().min(1).max(100),
    language: z.string().trim().min(1).max(30),
    region: z.string().trim().min(1).max(80),
    frontImageUrl: z.string().url().max(2048),
    frontImageWidth: z.number().int().min(1).max(10000),
    frontImageHeight: z.number().int().min(1).max(10000),
    frontImageSourceUrl: z.string().url().max(2048),
    frontImageRights: z.string().trim().min(1).max(500),
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
    expectedSha256: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .optional(),
  })
  .strict()
  .superRefine((row, context) => {
    validateCardImageEvidence(row, context);
    if (
      URL.canParse(row.frontImageUrl) &&
      !new URL(row.frontImageUrl).pathname.includes(`/objects/${row.sha256}.`)
    )
      context.addIssue({
        code: "custom",
        message: "Image SHA must match its public content address",
        path: ["sha256"],
      });
  });

export const cardImageImportRequest = z
  .object({
    intent: z.enum(["preview", "commit"]),
    lang: z.enum(["fr", "en", "ja"]).default("fr"),
    items: z.array(cardImageImportItem).min(1).max(CARD_IMAGE_BATCH_MAX_ROWS),
    planSha256: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .optional(),
  })
  .strict()
  .superRefine((body, context) => {
    const identities = new Set<string>();
    for (const item of body.items) {
      const key = cardImageCompositeKey(item);
      if (identities.has(key))
        context.addIssue({
          code: "custom",
          message: "Duplicate card composite identity",
          path: ["items"],
        });
      identities.add(key);
    }
    if (
      body.intent === "commit" &&
      (!body.planSha256 || body.items.some((item) => !item.expectedSha256))
    )
      context.addIssue({
        code: "custom",
        message: "A complete preview plan is required for commit",
        path: ["planSha256"],
      });
  });

export type CardImageImportItem = z.infer<typeof cardImageImportItem>;
export type CardImageImportRequest = z.infer<typeof cardImageImportRequest>;
export const cardImageRestoreRequest = z
  .object({
    intent: z.enum(["restore-preview", "restore-commit"]),
    lang: z.enum(["fr", "en", "ja"]).default("fr"),
    items: z
      .array(
        z
          .object({
            revisionId: z.string().min(1).max(180),
            expectedSha256: z
              .string()
              .regex(/^[a-f0-9]{64}$/)
              .optional(),
            assetSha256: z
              .string()
              .regex(/^[a-f0-9]{64}$/)
              .optional(),
          })
          .strict(),
      )
      .min(1)
      .max(CARD_IMAGE_BATCH_MAX_ROWS),
    planSha256: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .optional(),
  })
  .strict()
  .superRefine((request, context) => {
    if (new Set(request.items.map((item) => item.revisionId)).size !== request.items.length)
      context.addIssue({
        code: "custom",
        message: "Duplicate historical revision",
        path: ["items"],
      });
    if (
      request.intent === "restore-commit" &&
      (!request.planSha256 || request.items.some((item) => !item.expectedSha256))
    )
      context.addIssue({
        code: "custom",
        message: "Historical preview plan required",
        path: ["planSha256"],
      });
  });
export const cardImageAdminRequest = z.union([cardImageImportRequest, cardImageRestoreRequest]);
export type CardImageRestoreRequest = z.infer<typeof cardImageRestoreRequest>;
export function isCardImageRestoreRequest(
  input: CardImageImportRequest | CardImageRestoreRequest,
): input is CardImageRestoreRequest {
  return input.intent === "restore-preview" || input.intent === "restore-commit";
}
export function cardImageCompositeKey(
  row: Pick<CardImageImportItem, "setId" | "cardNumber" | "language" | "region">,
): string {
  return JSON.stringify([row.setId, row.cardNumber, row.language, row.region]);
}
