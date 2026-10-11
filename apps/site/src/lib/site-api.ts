/**
 * Montage de `@aphrody/shenron-api` dans le site (B14 — docs/architecture/STACK.md §2.2, D7) :
 * mêmes routes additives que le bot (`/api/public/wiki/categories`,
 * `/api/public/wiki/{category}[/{idOrSlug}]`, `/api/public/openapi.json`),
 * servies par le catch-all `app/api/public/[...route]/route.ts` sur la base
 * PostgreSQL du site, plus le plugin « shenron » (`/api/public/plugin*`). Pas de catch-all `/api` racine : les routes existantes
 * du site gardent leur priorité (un segment statique prime sur `[...route]`).
 *
 * L'application est construite paresseusement à la première requête : aucun
 * pool PostgreSQL n'est ouvert au chargement du module. Sans base configurée,
 * le groupe wiki est désactivé et les chemins rendent le 404 historique.
 */
import "server-only";
import { clientIpFromHeaders } from "@aphrody/shenron-config/net";
import { createWikiReadRepository } from "@aphrody/shenron-db/repos/wiki";
import {
  createMemoryRateLimiter,
  createPublicCache,
  noopInvalidation,
} from "@aphrody/shenron-api/http";
import type { FetchableApi } from "@aphrody/shenron-api/next";
import { createShenronApi, type ShenronApi, type WikiReadPort } from "@aphrody/shenron-api/server";
import { SITE_HOST, SITE_URL } from "@/lib/config";
import { sitePluginPort } from "@/lib/plugin";

/** Origines CORS du site : l'URL configurée, le domaine canonique et son `www`. */
const SITE_PUBLIC_CORS_ORIGINS: readonly string[] = [
  ...new Set([SITE_URL, SITE_HOST, SITE_HOST.replace("https://", "https://www.")]),
];

/** Application `@aphrody/shenron-api` du site sur un port wiki donné (`null` → groupe désactivé). */
function createSiteShenronApi(wiki: WikiReadPort | null): ShenronApi {
  return createShenronApi(
    {
      wiki,
      // Le plugin « shenron » relu depuis `plugin/` : `/api/public/plugin*` (cf. `@/lib/plugin`).
      plugin: sitePluginPort(),
      // Liens absolus du plugin sur l'URL publique configurée, jamais l'origine interne
      // (`https://localhost:5011` derrière nginx).
      publicOrigin: SITE_URL,
      rateLimit: createMemoryRateLimiter(),
      publicCache: createPublicCache(),
      invalidation: noopInvalidation,
      cors: { allowedOrigins: SITE_PUBLIC_CORS_ORIGINS },
      clientIp: (request) => clientIpFromHeaders(request.headers),
      // Next ne donne pas l'adresse de socket : aucune requête n'est « loopback direct ».
      isDirectLoopback: () => false,
      log: (event) => {
        if ((event.status ?? 0) >= 500)
          console.error(`[${event.event}] ${event.path} → ${event.status}`);
      },
    },
    { service: "shenron-site" },
  );
}

let injectedWiki: WikiReadPort | null | undefined;
let pending: Promise<ShenronApi> | null = null;

/**
 * Remplace le port wiki (tests, scripts) : `undefined` rétablit la base du
 * site. Réinitialise l'application construite.
 */
export function setSiteWikiPort(port: WikiReadPort | null | undefined): void {
  injectedWiki = port;
  pending = null;
}

async function siteWikiPort(): Promise<WikiReadPort | null> {
  if (injectedWiki !== undefined) return injectedWiki;
  try {
    const { db } = await import("@/lib/db");
    return createWikiReadRepository(db) as WikiReadPort;
  } catch (error) {
    console.error("[shenron-site.api] PostgreSQL indisponible, groupe wiki désactivé:", error);
    return null;
  }
}

/** Application partagée du process, construite à la première requête. */
function getSiteShenronApi(): Promise<ShenronApi> {
  pending ??= siteWikiPort().then(createSiteShenronApi);
  return pending;
}

/** Adaptateur `fetch` paresseux pour `toNextRouteHandlers`. */
export const siteShenronApi: FetchableApi = {
  fetch: async (request) => (await getSiteShenronApi()).fetch(request),
};
