/**
 * Catch-all `/api/public/*` du site (B14) : délègue à `@aphrody/shenron-api` (wiki
 * PostgreSQL, OpenAPI). Les routes statiques existantes sous `/api` gardent
 * la priorité ; un chemin non servi rend le 404 historique `{ "error": "Not found" }`.
 */
import { toNextRouteHandlers } from "@aphrody/shenron-api/next";
import { siteShenronApi } from "@/lib/site-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const { GET, HEAD, OPTIONS } = toNextRouteHandlers(siteShenronApi);
