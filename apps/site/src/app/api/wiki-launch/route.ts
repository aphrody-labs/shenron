/**
 * /api/wiki-launch — contrôle d'accès et classement des rubriques (gate admin).
 *
 *   GET → { openKeys, order, access }   configuration courante
 *   PUT → { ok, ...config }             enregistre + revalide le layout
 *
 * Le PUT accepte n'importe quel sous-ensemble des trois champs : la page
 * /admin/launch envoie l'accès et l'ordre séparément sans écraser le reste.
 * Le nettoyage (clés inconnues, modes invalides, rôles non-snowflake) est fait
 * dans `wiki-launch-config`, source unique de vérité.
 */
import { adminUserOrToken, isAdminOrToken } from "@/lib/admin-guard";
import { getLaunchConfig, saveLaunchConfig } from "@/lib/wiki-launch-config";
import { HostLaunchError } from "@/lib/host-launch-error";
import { ENV_ALIASES, envFirst } from "@aphrody/shenron-config/env";
import type { AccessRule } from "@/lib/wiki-launch";
import { revalidatePath } from "next/cache";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function privateJson(body: unknown, init: ResponseInit = {}): NextResponse {
  const headers = new Headers(init.headers);
  headers.set("Cache-Control", "private, no-store");
  return NextResponse.json(body, { ...init, headers });
}

function unavailable(error: string): NextResponse {
  return privateJson({ error }, { status: 503, headers: { "Retry-After": "30" } });
}

export async function GET(req: NextRequest) {
  let allowed: boolean;
  try {
    allowed = await isAdminOrToken(req);
  } catch (error) {
    console.error("[wiki-launch] admin lookup failed", error);
    return unavailable("auth_unavailable");
  }
  if (!allowed) return privateJson({ error: "Forbidden" }, { status: 403 });
  try {
    return privateJson(await getLaunchConfig());
  } catch (error) {
    console.error("[wiki-launch] configuration read failed", error);
    return unavailable("launch_service_unavailable");
  }
}

export async function PUT(req: NextRequest) {
  let decision: Awaited<ReturnType<typeof adminUserOrToken>>;
  try {
    decision = await adminUserOrToken(req);
  } catch (error) {
    console.error("[wiki-launch] admin lookup failed", error);
    return unavailable("auth_unavailable");
  }
  const { allowed, me } = decision;
  if (!allowed) return privateJson({ error: "Forbidden" }, { status: 403 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return privateJson({ error: "JSON body requis" }, { status: 400 });
  }

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return privateJson({ error: "Launch object required" }, { status: 400 });
  }
  const b = body as {
    openKeys?: unknown;
    order?: unknown;
    access?: unknown;
  };
  const strings = (v: unknown) =>
    Array.isArray(v) ? (v.filter((k) => typeof k === "string") as string[]) : undefined;

  const patch: Parameters<typeof saveLaunchConfig>[0] = {};
  const openKeys = strings(b.openKeys);
  if (openKeys) patch.openKeys = openKeys;
  const order = strings(b.order);
  if (order) patch.order = order;
  if (b.access && typeof b.access === "object") {
    patch.access = b.access as Record<string, AccessRule>;
  }

  if (Object.keys(patch).length === 0) {
    return privateJson({ error: "openKeys[], order[] ou access{} attendu" }, { status: 400 });
  }

  let config;
  try {
    config = await saveLaunchConfig(
      patch,
      me?.discordId || me?.user?.id || "token-admin",
      req.headers,
      envFirst(process.env, ENV_ALIASES.adminToken)?.value,
    );
  } catch (err) {
    console.error("[wiki-launch] configuration write failed", err);
    const status = err instanceof HostLaunchError ? err.status : 502;
    return privateJson(
      { error: "Launch service unavailable" },
      { status, headers: status >= 500 ? { "Retry-After": "30" } : undefined },
    );
  }
  // Le gating/nav/teaser lisent la config dans le layout → revalide tout le site.
  revalidatePath("/", "layout");
  return privateJson({ ok: true, ...config });
}
