// SPDX-License-Identifier: Apache-2.0
import { z } from "zod";
import { getCurrentUser, revisionActorOf } from "@/lib/session";
import {
  CharacterConsolidationConflict,
  consolidateWikiCharacters,
} from "@/lib/wiki-character-consolidation";
import { revalidateWikiEntity } from "@/lib/wiki-revalidate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store" };
const requestSchema = z
  .object({
    winnerId: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
    duplicateId: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
    dryRun: z.boolean().default(true),
    expectedPlanSha256: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .optional(),
  })
  .strict()
  .refine(
    (value) => value.winnerId !== value.duplicateId && (value.dryRun || !!value.expectedPlanSha256),
  );

export async function POST(request: Request): Promise<Response> {
  try {
    const user = await getCurrentUser();
    if (!user?.user?.roleAdmin)
      return Response.json({ error: "forbidden" }, { status: 403, headers });
    const parsed = requestSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success)
      return Response.json({ error: "invalid_consolidation_request" }, { status: 400, headers });
    const result = await consolidateWikiCharacters({
      ...parsed.data,
      actor: revisionActorOf(user),
    });
    if (result.applied) {
      revalidateWikiEntity("db_characters");
      revalidateWikiEntity("db_character_variants");
      for (const change of result.plan.changes)
        revalidateWikiEntity(change.table, change.after ?? change.before);
    }
    return Response.json({ ok: true, ...result }, { headers });
  } catch (error) {
    if (error instanceof CharacterConsolidationConflict)
      return Response.json({ error: error.message, plan: error.plan }, { status: 409, headers });
    console.error("[wiki-character-consolidation] request failed", error);
    return Response.json(
      { error: "character_consolidation_unavailable" },
      { status: 503, headers },
    );
  }
}
