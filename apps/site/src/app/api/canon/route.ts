/**
 * /api/canon — l'arbitre de canonicité de `/wiki/canon` en API publique.
 *
 *   GET /api/canon?q=<affirmation>   → { question, verdict, references, plates, records, suggestions, mode }
 *   GET /api/canon                    → { intro, tiers, doctrine, admittedSources, forbiddenSources,
 *                                         entries, heuristics, stats }
 *
 * The former French names stay as deprecated duplicates until 1.4.0: `sourcesAdmises`,
 * `sourcesInterdites`, `stats.parProvenance`, `verdict.origine`, `planches` (now `plates`,
 * each plate with `numero`, `texte`, `texteFr`, `verifiee`, `databookTitre`), `fiches` (now
 * `records`, each with `titre` and `extrait`), `suggestions[].titre`, and `court`, `couleur`,
 * `inclut` on each tier (now `shortLabel`, `color`, `includes`).
 *
 * Lecture seule, CORS ouvert, sans authentification : c'est la surface que
 * consomment le MCP (`canon_check`), la skill du plugin et tout outil externe.
 * The curated canon tier remains editorial. Jev assesses explicitly public source excerpts
 * through a typed judgment, with provenance and abstention, and never publishes canon.
 *
 * Chaque question posée est comptée dans `canon_verdicts` (la mémoire de
 * l'arbitre) ; l'échec de ce compteur n'empêche jamais la réponse.
 */
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { canonPreuves } from "@/lib/canon-preuves";
import { canonEvidenceView } from "@/lib/canon-preuves-view";
import { getCanonConfig, getCanonReferences } from "@/lib/canon-config";
import { slugCanon } from "@/lib/canon-engine";
import { canonEvidenceDecision, isCanonEvidenceEnabled } from "@/lib/canon-yolo-server";
import type { CanonContinuity } from "@aphrody/shenron-pipeline/ai/canon-judgment";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
};

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}

const QUESTION_MAX = 400;

async function compterQuestion(question: string, tier: string, score: number, origine: string) {
  try {
    const id = slugCanon(question, "question").slice(0, 80) || "question";
    await db.execute(sql`
			insert into public.canon_verdicts (id, question, tier, score, origine)
			values (${id}, ${question.slice(0, QUESTION_MAX)}, ${tier}, ${score}, ${origine})
			on conflict (id) do update set
				asked_count = public.canon_verdicts.asked_count + 1,
				tier = excluded.tier, score = excluded.score, origine = excluded.origine,
				last_asked_at = now()
		`);
  } catch (e) {
    console.error("[api/canon] compteur de questions indisponible :", e);
  }
}

export async function GET(req: Request) {
  const q = (new URL(req.url).searchParams.get("q") ?? "").trim().slice(0, QUESTION_MAX);
  const assessEvidence = new URL(req.url).searchParams.get("assessEvidence") === "1";
  const headers = {
    ...CORS,
    "Cache-Control": assessEvidence
      ? "no-store"
      : "public, s-maxage=300, stale-while-revalidate=3600",
  };

  if (!q) {
    const [config, references] = await Promise.all([getCanonConfig(), getCanonReferences()]);
    const byProvenance: Record<string, number> = {};
    for (const r of references) byProvenance[r.provenance] = (byProvenance[r.provenance] ?? 0) + 1;
    return Response.json(
      {
        intro: config.intro,
        tiers: config.tiers.map((tier) => ({
          ...tier,
          shortLabel: tier.court,
          color: tier.couleur,
          includes: tier.inclut,
        })),
        doctrine: config.doctrine,
        admittedSources: config.sourcesAdmises,
        forbiddenSources: config.sourcesInterdites,
        entries: config.entries.map((e) => ({
          id: e.id,
          title: e.title,
          category: e.category,
          tier: e.tier,
          score: e.score,
          verdict: e.verdict,
        })),
        heuristics: config.heuristics.map((h) => ({ id: h.id, label: h.label, tier: h.tier })),
        stats: { references: references.length, byProvenance, parProvenance: byProvenance },
        // Former names, deprecated: removed in 1.4.0.
        sourcesAdmises: config.sourcesAdmises,
        sourcesInterdites: config.sourcesInterdites,
      },
      { headers },
    );
  }

  const requestedContinuity = new URL(req.url).searchParams.get("continuity");
  const continuities = ["original_manga", "super", "anime", "gt", "daima", "unspecified"] as const;
  const continuity = continuities.includes(requestedContinuity as CanonContinuity)
    ? (requestedContinuity as CanonContinuity)
    : undefined;
  const preuves = await canonPreuves(q, continuity);
  const { verdict } = preuves;
  const evidenceDecision = assessEvidence
    ? await canonEvidenceDecision(q, verdict.references ?? [])
    : null;
  void compterQuestion(q, verdict.tier, verdict.score, verdict.origine);
  return Response.json(
    {
      question: q,
      evidenceAssessmentEnabled: isCanonEvidenceEnabled(),
      ...(evidenceDecision ? { evidenceDecision } : {}),
      verdict: {
        tier: verdict.tier,
        tierLabel: verdict.tierLabel,
        tierDefinition: verdict.tierDefinition ?? null,
        score: verdict.score,
        color: verdict.color,
        verdict: verdict.verdict,
        explanation: verdict.explanation,
        toriyamaQuote: verdict.toriyamaQuote ?? null,
        sources: verdict.sources,
        matchedKeywords: verdict.matchedKeywords,
        doctrine: verdict.doctrineRules ?? [],
        origin: verdict.origine,
        nature: verdict.nature,
        suggestions: verdict.suggestions,
        // Former name, deprecated: removed in 1.4.0.
        origine: verdict.origine,
      },
      references: (verdict.references ?? []).map((r) => ({
        id: r.id,
        subject: r.subject,
        text: r.text,
        textFr: r.textFr ?? null,
        source: r.source,
        year: r.year ?? null,
        lang: r.lang,
        provenance: r.provenance,
        href: r.href ?? null,
      })),
      ...canonEvidenceView(preuves),
    },
    { headers },
  );
}
