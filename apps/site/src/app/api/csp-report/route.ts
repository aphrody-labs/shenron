/**
 * Collecteur des violations de la CSP en Report-Only (`script-src`, cf.
 * `next.config.ts`). Sert à mesurer ce qu'une `script-src` stricte casserait avant
 * de la rendre bloquante. Réponse 204 sans corps ; le rapport est tronqué, jamais
 * stocké, et seuls les champs utiles au diagnostic sont journalisés.
 */
export const dynamic = "force-dynamic";

const MAX_BYTES = 8 * 1024;

export async function POST(request: Request): Promise<Response> {
  try {
    const raw = (await request.text()).slice(0, MAX_BYTES);
    const parsed: unknown = JSON.parse(raw);
    const reports = Array.isArray(parsed) ? parsed : [parsed];
    for (const entry of reports.slice(0, 5)) {
      const body =
        entry && typeof entry === "object"
          ? ((entry as Record<string, unknown>).body ??
            (entry as Record<string, unknown>)["csp-report"] ??
            entry)
          : null;
      if (!body || typeof body !== "object") continue;
      const r = body as Record<string, unknown>;
      console.info(
        "[csp-report]",
        String(r.effectiveDirective ?? r["effective-directive"] ?? r.violatedDirective ?? "").slice(
          0,
          60,
        ),
        String(r.blockedURL ?? r["blocked-uri"] ?? "").slice(0, 200),
        String(r.documentURL ?? r["document-uri"] ?? "").slice(0, 200),
      );
    }
  } catch {
    // Rapport illisible : ignoré.
  }
  return new Response(null, { status: 204 });
}
