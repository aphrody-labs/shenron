/**
 * Le plugin « shenron » servi par le site, synchronisé avec l'arbre `plugin/` déployé.
 *
 * Un seul port pour l'API publique (`/api/public/plugin*`, montée par `site-api.ts`) et
 * pour les adresses lisibles destinées aux LLM (`/plugin`, `/plugin.md`, `/plugin.txt`,
 * `/plugin.json`, `/plugin/<fichier>`), qui ne font que déléguer à l'API dans le même
 * processus : mêmes rendus, même ETag, aucune seconde implémentation.
 *
 * Invisible pour le lecteur humain (aucun lien dans l'interface) ; annoncé aux robots par
 * `llms.txt`.
 */
import "server-only";
import { createPluginPort, resolvePluginRoot, type PluginPort } from "@shenron/api/plugin";

let port: PluginPort | null | undefined;

/** Port du plugin, ou `null` si `plugin/` est introuvable (groupe désactivé, 404). */
export function sitePluginPort(): PluginPort | null {
  if (port === undefined) {
    const root = resolvePluginRoot(process.env);
    port = root ? createPluginPort(root) : null;
  }
  return port;
}

/** Relaie `request` vers une route plugin de l'API publique du site (même processus). */
export async function forwardToPluginApi(request: Request, apiPath: string): Promise<Response> {
  const { siteShenronApi } = await import("@/lib/site-api");
  const target = new URL(apiPath, request.url);
  const headers = new Headers();
  const etag = request.headers.get("if-none-match");
  if (etag) headers.set("if-none-match", etag);
  return siteShenronApi.fetch(new Request(target, { method: request.method, headers }));
}
