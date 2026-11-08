/**
 * /api/admin/wiki-contributions — modération des propositions communautaires.
 *
 *   GET  ?status&table&limit&offset → { rows, total, counts }
 *   POST { id, action: "accept" | "reject", note? }
 *
 * Gate admin. « accept » applique la valeur au wiki par le chemin normal
 * (`updateWiki` + révision au nom du CONTRIBUTEUR), donc annulable depuis
 * /admin/wiki/history comme n'importe quelle édition.
 */
import { getCurrentUser, isCurrentUserAdmin, revisionActorOf } from "@/lib/session";
import type { RevisionActor } from "@/lib/wiki-revisions";
import {
  acceptContribution,
  ContributionError,
  countByStatus,
  listContributions,
  rejectContribution,
} from "@/lib/wiki-contributions";
import {
  parseContributionListQuery,
  reviewContributionSchema,
} from "@/lib/wiki-editorial-contracts";
import { DatabooksFrozenError } from "@/lib/databooks-freeze";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function privateJson(body: unknown, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  headers.set("Cache-Control", "private, no-store");
  return Response.json(body, { ...init, headers });
}

function unavailable(error: string): Response {
  return privateJson({ error }, { status: 503, headers: { "Retry-After": "30" } });
}

async function requireAdmin(): Promise<Response | null> {
  try {
    return (await isCurrentUserAdmin())
      ? null
      : privateJson({ error: "Forbidden" }, { status: 403 });
  } catch (error) {
    console.error("[contributions] moderator authentication failed", error);
    return unavailable("auth_unavailable");
  }
}

async function currentActor(): Promise<RevisionActor> {
  return revisionActorOf(await getCurrentUser());
}

export async function GET(req: Request): Promise<Response> {
  const authError = await requireAdmin();
  if (authError) return authError;
  const parsed = parseContributionListQuery(new URL(req.url).searchParams);
  if (!parsed.success) return privateJson({ error: "bad_request" }, { status: 400 });
  try {
    const [result, counts] = await Promise.all([listContributions(parsed.data), countByStatus()]);
    return privateJson({ ...result, counts });
  } catch (error) {
    console.error("[contributions] moderation queue failed", error);
    return unavailable("list_unavailable");
  }
}

export async function POST(req: Request): Promise<Response> {
  const authError = await requireAdmin();
  if (authError) return authError;
  const parsed = reviewContributionSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return privateJson({ error: "bad_request" }, { status: 400 });
  const body = parsed.data;

  try {
    const actor = await currentActor();
    const contribution =
      body.action === "accept"
        ? await acceptContribution(body.id, actor, body.note ?? null)
        : await rejectContribution(body.id, actor, body.note ?? null);
    return privateJson({ ok: true, contribution });
  } catch (err) {
    if (err instanceof ContributionError) {
      return privateJson({ error: err.code, message: err.message }, { status: err.status });
    }
    if (err instanceof DatabooksFrozenError) {
      return privateJson({ error: "DATABOOKS_FROZEN" }, { status: 423 });
    }
    console.error("[contributions] moderation failed", err);
    return privateJson({ error: "moderation_unavailable" }, { status: 503 });
  }
}
