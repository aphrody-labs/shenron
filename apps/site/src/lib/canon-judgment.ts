import "server-only";
import { DEFAULT_PUBLIC_ORIGINS } from "@aphrody/shenron-config/public-urls";
import { configuredCanonJudgment } from "@aphrody/shenron-pipeline/ai/jev-provider";
import { emptyCanonJudgment, type CanonContinuity, type CanonJudgment, type PublicCanonEvidence } from "@aphrody/shenron-pipeline/ai/canon-judgment";
import { env } from "@/lib/env";
import type { PlanchePreuve } from "./canon-preuves";

/** Plates are admitted only after canon-preuves has resolved their book with visible=true. */
export async function judgeCanonPlates(
  question: string,
  plates: readonly PlanchePreuve[],
  continuity?: CanonContinuity,
): Promise<CanonJudgment> {
  const evidence: PublicCanonEvidence[] = plates.flatMap((plate) => {
    const excerpt = plate.texte?.trim();
    if (!excerpt) return [];
    return [{ id: `databook:${plate.databookId}:${plate.numero}`, publicExcerpt: excerpt,
      url: new URL(plate.href, DEFAULT_PUBLIC_ORIGINS.site).href, sourceKind: "databook" as const,
      visibility: "public" as const, providerUseAllowed: true }];
  });
  if (evidence.length === 0) return emptyCanonJudgment("no_public_evidence");
  const port = await configuredCanonJudgment({ TYPESAFE_API_KEY: env.TYPESAFE_API_KEY });
  if (!port) return emptyCanonJudgment("unavailable");
  return port.judge({ question, evidence, ...(continuity ? { continuity } : {}) });
}
