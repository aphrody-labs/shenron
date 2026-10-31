/**
 * /api/wiki/contributions — dépôt et suivi des propositions de correction par
 * les **membres** (pas les admins : eux éditent directement via /api/wiki-admin).
 *
 *   POST { table, rowId, column, valueAfter, comment?, sources?, path? }
 *        → dépose une proposition (statut `pending`, n'écrit rien dans le wiki)
 *   GET  ?table&rowId    → mes propositions (les miennes uniquement)
 *   DELETE ?id           → je retire ma proposition tant qu'elle est en attente
 *
 * Auth requise. Rate-limit mémoire par utilisateur : une contribution demande
 * d'aller lire une source, personne n'en dépose dix en cinq minutes de bonne foi.
 */
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getCurrentUser, isCurrentUserAdmin } from "@/lib/session";
import {
  CONTRIBUTION_COMMENT_MAX,
  CONTRIBUTION_MAX,
  CONTRIBUTION_SOURCES_MAX,
} from "@/lib/contributions-shared";
import {
  ContributionError,
  createContribution,
  listContributions,
  withdrawContribution,
} from "@/lib/wiki-contributions";
import { canContribute, scopeOf } from "@/lib/contribution-rights";
import { sanitizeInternalPath } from "@aphrody/shenron-config/favorites";
import { createMemoryRateLimiter } from "@/lib/memory-rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  table: z.string().min(1).max(64),
  rowId: z.string().min(1).max(64),
  column: z.string().min(1).max(64),
  valueAfter: z.string().min(1).max(CONTRIBUTION_MAX),
  comment: z.string().max(CONTRIBUTION_COMMENT_MAX).nullish(),
  sources: z.string().max(CONTRIBUTION_SOURCES_MAX).nullish(),
  path: z.string().max(512).nullish(),
});

// 10 propositions / heure / membre.
const contributionRateLimit = createMemoryRateLimiter({
  windowMs: 60 * 60_000,
  limit: 10,
  namespace: "wiki-contributions",
});

function privateJson(body: unknown, init: ResponseInit = {}): NextResponse {
  const headers = new Headers(init.headers);
  headers.set("Cache-Control", "private, no-store");
  return NextResponse.json(body, { ...init, headers });
}

function unavailable(error: string): NextResponse {
  return privateJson({ ok: false, error }, { status: 503, headers: { "Retry-After": "30" } });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  let session: Awaited<ReturnType<typeof getCurrentUser>>;
  try {
    session = await getCurrentUser();
  } catch (err) {
    console.error("[contributions] session lookup failed", err);
    return unavailable("auth_unavailable");
  }
  if (!session?.user?.id) {
    return privateJson({ ok: false, error: "auth_required" }, { status: 401 });
  }
  const rate = await contributionRateLimit.consume(session.user.id);
  if (rate.limited) {
    return privateJson(
      { ok: false, error: "rate_limited" },
      { status: 429, headers: { "Retry-After": String(rate.retryAfter) } },
    );
  }

  let parsed: z.infer<typeof bodySchema>;
  try {
    parsed = bodySchema.parse(await req.json());
  } catch {
    return privateJson({ ok: false, error: "bad_request" }, { status: 400 });
  }
  const entityPath = parsed.path
    ? sanitizeInternalPath(parsed.path.split("?")[0]!.split("#")[0], 512)
    : null;
  if (parsed.path && !entityPath) {
    return privateJson({ ok: false, error: "bad_path" }, { status: 400 });
  }

  // Droit de contribution du périmètre visé (wiki / databooks), réglé depuis
  // l'admin. Vérifié ICI et pas seulement dans l'interface : le bouton peut
  // être masqué côté client, la route reste appelable directement.
  let autorise: boolean;
  try {
    const isAdmin = await isCurrentUserAdmin();
    autorise = await canContribute(scopeOf(parsed.table), {
      isAdmin,
      authenticated: true,
      discordId: session.user.discordId ?? session.discordId ?? null,
    });
  } catch (err) {
    console.error("[contributions] rights lookup failed", err);
    return unavailable("rights_unavailable");
  }
  if (!autorise) {
    return privateJson({ ok: false, error: "not_allowed" }, { status: 403 });
  }

  try {
    const contribution = await createContribution({
      table: parsed.table,
      rowId: parsed.rowId,
      column: parsed.column,
      valueAfter: parsed.valueAfter,
      comment: parsed.comment ?? null,
      sources: parsed.sources ?? null,
      entityPath,
      author: {
        id: session.user.id,
        name: session.user.username ?? null,
        discordId: session.user.discordId ?? session.discordId ?? null,
      },
    });
    return privateJson({ ok: true, contribution });
  } catch (err) {
    if (err instanceof ContributionError) {
      return privateJson(
        { ok: false, error: err.code, message: err.message },
        { status: err.status },
      );
    }
    console.error("[contributions] create failed", err);
    return privateJson({ ok: false, error: "insert_failed" }, { status: 500 });
  }
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  let session: Awaited<ReturnType<typeof getCurrentUser>>;
  try {
    session = await getCurrentUser();
  } catch (err) {
    console.error("[contributions] session lookup failed", err);
    return privateJson(
      { ok: false, error: "auth_unavailable" },
      { status: 503, headers: { "Retry-After": "30" } },
    );
  }
  if (!session?.user?.id) {
    return privateJson({ ok: false, error: "auth_required" }, { status: 401 });
  }
  const sp = req.nextUrl.searchParams;
  try {
    const result = await listContributions({
      authorId: session.user.id,
      table: sp.get("table") ?? undefined,
      rowId: sp.get("rowId") ?? undefined,
      limit: Number(sp.get("limit")) || 20,
    });
    return privateJson({ ok: true, ...result });
  } catch (err) {
    console.error("[contributions] list failed", err);
    return privateJson(
      { ok: false, error: "list_unavailable" },
      { status: 503, headers: { "Retry-After": "30" } },
    );
  }
}

export async function DELETE(req: NextRequest): Promise<NextResponse> {
  let session: Awaited<ReturnType<typeof getCurrentUser>>;
  try {
    session = await getCurrentUser();
  } catch (err) {
    console.error("[contributions] session lookup failed", err);
    return unavailable("auth_unavailable");
  }
  if (!session?.user?.id) {
    return privateJson({ ok: false, error: "auth_required" }, { status: 401 });
  }
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return privateJson({ ok: false, error: "bad_request" }, { status: 400 });
  try {
    await withdrawContribution(id, session.user.id);
    return privateJson({ ok: true });
  } catch (err) {
    if (err instanceof ContributionError) {
      return privateJson({ ok: false, error: err.code }, { status: err.status });
    }
    console.error("[contributions] withdraw failed", err);
    return privateJson({ ok: false, error: "withdraw_unavailable" }, { status: 503 });
  }
}
