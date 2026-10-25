/**
 * /api/admin/contribution-rights — lecture et écriture du droit de
 * contribution (wiki / databooks). Réservé au staff.
 */
import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser, isCurrentUserAdmin } from "@/lib/session";
import { getContributionRights, setContributionRights } from "@/lib/contribution-rights";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function gate(): Promise<"allowed" | "denied" | "unavailable"> {
  try {
    return (await isCurrentUserAdmin()) ? "allowed" : "denied";
  } catch (err) {
    console.error("[admin/contribution-rights] auth lookup failed", err);
    return "unavailable";
  }
}

function unavailable(error: string): NextResponse {
  return NextResponse.json(
    { ok: false, error },
    { status: 503, headers: { "Cache-Control": "private, no-store", "Retry-After": "30" } },
  );
}

export async function GET(): Promise<NextResponse> {
  const access = await gate();
  if (access === "unavailable") return unavailable("auth_unavailable");
  if (access === "denied") return NextResponse.json({ ok: false }, { status: 403 });
  try {
    return NextResponse.json({ ok: true, rights: await getContributionRights() });
  } catch (err) {
    console.error("[admin/contribution-rights] rights lookup failed", err);
    return unavailable("rights_unavailable");
  }
}

export async function PUT(req: NextRequest): Promise<NextResponse> {
  const access = await gate();
  if (access === "unavailable") return unavailable("auth_unavailable");
  if (access === "denied") return NextResponse.json({ ok: false }, { status: 403 });
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 });
  }
  let session: Awaited<ReturnType<typeof getCurrentUser>>;
  try {
    session = await getCurrentUser();
  } catch (err) {
    console.error("[admin/contribution-rights] session lookup failed", err);
    return unavailable("auth_unavailable");
  }
  // `sanitizeRights` filtre côté serveur : le formulaire peut envoyer
  // n'importe quoi, seules des valeurs connues et des identifiants au bon
  // format sont persistés.
  try {
    const rights = await setContributionRights(
      (body as { rights?: unknown })?.rights ?? body,
      session?.user?.id ?? null,
    );
    return NextResponse.json({ ok: true, rights });
  } catch (err) {
    console.error("[admin/contribution-rights] rights update failed", err);
    return unavailable("rights_unavailable");
  }
}
