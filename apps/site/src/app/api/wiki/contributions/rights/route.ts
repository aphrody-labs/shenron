/**
 * /api/wiki/contributions/rights — « ai-je le droit de proposer ici ? »
 *
 * Interrogée par la modale de contribution à son ouverture, jamais au rendu de
 * la page : la réponse dépend de la session ET des rôles Discord du visiteur,
 * deux choses qui feraient basculer une fiche en `private, no-store` si elles
 * étaient lues au rendu (cf. piège latence). Le vrai contrôle reste dans la
 * route de dépôt — celle-ci ne sert qu'à ne pas proposer un formulaire qui
 * serait refusé.
 */
import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser, isCurrentUserAdmin } from "@/lib/session";
import { canContribute } from "@/lib/contribution-rights";
import { CONTRIBUTION_SCOPES, scopeOf } from "@/lib/contribution-rights-shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function unavailable(error: string): NextResponse {
  return NextResponse.json(
    { ok: false, error },
    { status: 503, headers: { "cache-control": "private, no-store", "retry-after": "30" } },
  );
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const table = req.nextUrl.searchParams.get("table") ?? "";
  const scope = table ? scopeOf(table) : "wiki";
  if (!CONTRIBUTION_SCOPES.includes(scope)) {
    return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 });
  }

  let session: Awaited<ReturnType<typeof getCurrentUser>>;
  try {
    session = await getCurrentUser();
  } catch (err) {
    console.error("[contributions/rights] session lookup failed", err);
    return unavailable("auth_unavailable");
  }
  const authenticated = !!session?.user?.id;
  let allowed: boolean;
  try {
    const isAdmin = authenticated ? await isCurrentUserAdmin() : false;
    allowed = await canContribute(scope, {
      isAdmin,
      authenticated,
      discordId: session?.user?.discordId ?? session?.discordId ?? null,
    });
  } catch (err) {
    console.error("[contributions/rights] rights lookup failed", err);
    return unavailable("rights_unavailable");
  }

  return NextResponse.json(
    { ok: true, scope, allowed, authenticated },
    { headers: { "cache-control": "private, no-store" } },
  );
}
