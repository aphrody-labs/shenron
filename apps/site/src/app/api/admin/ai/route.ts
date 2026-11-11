import { revalidatePath } from "next/cache";
import {
  CanonConfigWriteError,
  getCanonConfig,
  getCanonConfigSnapshot,
  saveCanonConfig,
} from "@/lib/canon-config";
import { DEFAULT_CANON_CONFIG, analyzeCanon } from "@/lib/canon-engine";
import { canonPreuves } from "@/lib/canon-preuves";
import { canonEvidenceView } from "@/lib/canon-preuves-view";
import { chercherPlanches } from "@/lib/manga-api";
import { sendAdminLabMessage } from "@/lib/admin-lab";
import { collectIaCockpit, describeError, probeSource } from "@/lib/ia-cockpit";
import {
  IA_NO_STORE as NO_STORE,
  parseEvalSamples,
  readJsonObject,
  requireIaAdmin,
} from "@/lib/ia-aphrody";
import {
  CompleteGoalBody,
  CreateGoalBody,
  FeedbackStatus,
  GoldCaseBody,
} from "@aphrody/shenron-api/contract";
import {
  botCockpit,
  CockpitActionError,
  createIaCockpitFetchers,
  currentRagBackend,
  evaluateConfiguredRag,
  searchConfiguredRag,
  runAphrodyOcr,
} from "@/lib/ia-cockpit-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Writes land in the bot SQLite; the site reads the PostgreSQL mirror. */
const MIRROR_NOTICE =
  "Enregistré par le bot : visible ici après la prochaine synchronisation du miroir PostgreSQL bot.*.";

export async function GET() {
  const gate = await requireIaAdmin();
  if (!gate.ok) return gate.response;

  try {
    const backend = currentRagBackend();
    const [cockpit, canonConfig] = await Promise.all([
      collectIaCockpit(createIaCockpitFetchers(), backend),
      getCanonConfigSnapshot(),
    ]);
    return Response.json(
      {
        ...cockpit,
        canonConfig: canonConfig.config,
        canonExpected: canonConfig.expected,
        canonDefaults: DEFAULT_CANON_CONFIG,
        timestamp: new Date().toISOString(),
      },
      { headers: NO_STORE },
    );
  } catch (error) {
    console.error("[api/admin/ai] GET failed:", error);
    return Response.json({ error: describeError(error) }, { status: 500, headers: NO_STORE });
  }
}

function positiveId(value: unknown): number | null {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

export async function POST(req: Request) {
  const gate = await requireIaAdmin();
  if (!gate.ok) return gate.response;
  const me = gate.me;
  const author = {
    userId: me.discordId || me.user.id,
    userTag: me.user.username || "Admin",
  };

  try {
    const body = await readJsonObject(req);
    const action = String(body.action ?? "");
    const backend = currentRagBackend();

    // ── Live multi-engine probe ───────────────────────────────────────────
    if (action === "test_prompt") {
      const query = String(body.query ?? "").trim();
      if (!query) {
        return Response.json({ error: "Le paramètre 'query' est requis." }, { status: 400 });
      }

      const t0 = performance.now();
      const canonConfig = await getCanonConfig();
      const [rag, canonVerdict, canonRefs, manga] = await Promise.all([
        probeSource({
          label: backend.engine,
          target:
            backend.value === "aphrody"
              ? "GET /api/v1/shenron/rag/search"
              : "GET /api/public/rag/search",
          run: () => searchConfiguredRag(query, 5, backend),
        }),
        (async () => {
          try {
            return analyzeCanon(query, canonConfig);
          } catch (error) {
            console.error("[api/admin/ai] canon analysis failed:", error);
            return null;
          }
        })(),
        canonPreuves(query).catch(() => null),
        probeSource({
          label: "Recherche manga",
          target: "manga OCR",
          run: async () =>
            (await chercherPlanches(query, { limit: 5 })).map((p: any) => ({
              series: p.series,
              volume: p.volume,
              page: p.page,
              excerpt: p.excerpt,
              score: p.score,
              // Former names, deprecated until 1.4.0.
              tome: p.tome,
              planche: p.planche,
              extrait: p.extrait,
            })),
        }),
      ]);

      return Response.json({
        ok: true,
        query,
        backend,
        latencyMs: Math.round(performance.now() - t0),
        rag,
        canon: canonVerdict
          ? {
              ...canonVerdict,
              origin: canonVerdict.origine,
              evidence: canonRefs ? { ...canonRefs, ...canonEvidenceView(canonRefs) } : null,
              // Former names, deprecated: removed in 1.4.0.
              preuves: canonRefs,
            }
          : null,
        manga,
      });
    }

    if (action === "ocr_probe") {
      const image = String(body.imageBase64 ?? "").trim();
      const language = String(body.language ?? "ja");
      if (!image) return Response.json({ error: "Image OCR requise." }, { status: 400 });
      const result = await runAphrodyOcr(image, language);
      return Response.json({ ok: true, engine: "Aphrody AI", language, result });
    }

    // ── Live RAG evaluation on the gold set ───────────────────────────────
    if (action === "evaluate_rag") {
      const samples = parseEvalSamples(body.samples);
      if (samples === null) {
        return Response.json(
          { error: "Le paramètre 'samples' doit être un entier positif (0 = tout le jeu doré)." },
          { status: 400 },
        );
      }
      const metrics = await evaluateConfiguredRag(samples, backend);
      return Response.json({ ok: true, metrics });
    }

    // ── Gold set: the bot owns the versioned file and the feedback trace ──
    if (action === "add_gold_case") {
      const q = String(body.q ?? "").trim();
      const expect = Array.isArray(body.expect)
        ? body.expect.map((value) => String(value).trim()).filter(Boolean)
        : [];
      const gold = GoldCaseBody.safeParse({ q, expect, ...author });
      if (!q || expect.length === 0 || !gold.success) {
        return Response.json({ error: "Question et mots-clés attendus requis." }, { status: 400 });
      }
      await botCockpit.addGold(gold.data);
      return Response.json({ ok: true, q, expect, notice: MIRROR_NOTICE });
    }

    if (action === "update_feedback") {
      const id = positiveId(body.id);
      const parsed = FeedbackStatus.safeParse(String(body.status ?? ""));
      if (!id || !parsed.success) {
        return Response.json({ error: "Paramètres invalides." }, { status: 400 });
      }
      const status = parsed.data;
      await botCockpit.setFeedbackStatus(id, { status });
      return Response.json({ ok: true, id, status, notice: MIRROR_NOTICE });
    }

    // ── Canon doctrine (PostgreSQL public."CanonConfig") ──────────────────
    if (action === "save_canon") {
      const config = body.config;
      if (!config || typeof config !== "object" || Array.isArray(config)) {
        return Response.json({ error: "Configuration canon requise." }, { status: 400 });
      }
      const saved = await saveCanonConfig(config, me.discordId || me.user.id, body.expected);
      revalidatePath("/wiki/canon");
      revalidatePath("/admin/ai");
      return Response.json({ ok: true, ...saved });
    }

    // ── Admin lab Discord channel ─────────────────────────────────────────
    if (action === "send_lab_message") {
      const text = String(body.message ?? "").trim();
      if (!text) {
        return Response.json({ error: "Message requis." }, { status: 400 });
      }
      const res = await sendAdminLabMessage({
        content: `[**${author.userTag}** via Web Cockpit] : ${text}`,
      });
      return Response.json({ ok: true, id: res.id });
    }

    // ── Session goals (bot admin_goals → var/reports/GOALS.md) ──────────────────
    if (action === "create_goal") {
      const title = String(body.title ?? "").trim();
      const description = String(body.description ?? "").trim();
      if (!title) return Response.json({ error: "Titre requis." }, { status: 400 });
      const goal = CreateGoalBody.safeParse({
        title,
        description: description || title,
        ...author,
      });
      if (!goal.success) return Response.json({ error: "Paramètres invalides." }, { status: 400 });
      const result = await botCockpit.createGoal(goal.data);
      return Response.json({ ok: true, goal: result.goal ?? null, notice: MIRROR_NOTICE });
    }

    if (action === "complete_goal") {
      const id = positiveId(body.id);
      if (!id) return Response.json({ error: "ID requis." }, { status: 400 });
      const completion = CompleteGoalBody.safeParse({
        notes: String(body.notes ?? "").trim() || "Complété via Cockpit Admin IA",
      });
      if (!completion.success)
        return Response.json({ error: "Paramètres invalides." }, { status: 400 });
      await botCockpit.completeGoal(id, completion.data);
      return Response.json({ ok: true, id, notice: MIRROR_NOTICE });
    }

    return Response.json({ error: "Action non reconnue." }, { status: 400 });
  } catch (error) {
    if (error instanceof CanonConfigWriteError) {
      return Response.json({ ok: false, error: error.message }, { status: error.status });
    }
    if (error instanceof CockpitActionError) {
      return Response.json({ ok: false, error: error.message }, { status: error.status });
    }
    console.error("[api/admin/ai] POST failed:", error);
    return Response.json({ ok: false, error: describeError(error) }, { status: 500 });
  }
}
