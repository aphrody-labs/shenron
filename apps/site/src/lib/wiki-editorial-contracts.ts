// SPDX-License-Identifier: Apache-2.0
import { z } from "zod";

export const CONTRIBUTION_STATUSES = [
  "pending",
  "accepted",
  "rejected",
  "superseded",
  "withdrawn",
] as const;

/** A rejection must explain itself: the note is what the contributor reads. */
export const reviewContributionSchema = z
  .object({
    id: z.string().trim().min(1).max(64),
    action: z.enum(["accept", "reject"]),
    note: z.string().trim().max(4000).optional(),
  })
  .refine((review) => review.action !== "reject" || (review.note?.length ?? 0) > 0, {
    path: ["note"],
    message: "A rejection needs a reason",
  });

export const wikiAiRequestSchema = z.object({
  query: z.string().trim().min(1).max(2000),
  limit: z.number().int().min(1).max(12).default(8),
  entity: z.string().trim().min(1).max(200).optional(),
  action: z.enum(["search", "draft"]).default("search"),
  lang: z.enum(["fr", "en", "ja"]).default("fr"),
});

const contributionListSchema = z.object({
  status: z.enum(CONTRIBUTION_STATUSES).optional(),
  table: z.string().trim().min(1).max(64).optional(),
  rowId: z.string().trim().min(1).max(64).optional(),
  limit: z.coerce.number().int().min(1).max(200),
  offset: z.coerce.number().int().min(0).max(1_000_000),
});

/** Both member and moderation queues use the same bounded pagination contract. */
export function parseContributionListQuery(params: URLSearchParams, defaultLimit = 50) {
  return contributionListSchema.safeParse({
    status: params.get("status") ?? undefined,
    table: params.get("table") ?? undefined,
    rowId: params.get("rowId") ?? undefined,
    limit: params.get("limit") ?? defaultLimit,
    offset: params.get("offset") ?? 0,
  });
}
