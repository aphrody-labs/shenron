import "server-only";
import { isAdminIp } from "@/lib/admin-ip";
import { acceptedStaticTokens, verifyStaticBearer } from "@aphrody/shenron-auth/tokens";
import { ENV_ALIASES, envFirst } from "@aphrody/shenron-config/env";

/**
 * Authentification par jeton porteur pour les API d'écriture.
 *
 * Certaines routes doivent être appelables par un client HORS navigateur (outil
 * local, script d'ingest) : la session Better Auth par cookie ne s'y prête pas.
 * On accepte donc `Authorization: Bearer <jeton>`, en plus de la session admin.
 *
 * Jeton = `DATABOOKS_API_TOKEN` s'il est défini, sinon repli sur
 * `SHENRON_ADMIN_TOKEN` (déjà présent en production). Sans aucun des deux,
 * l'écriture est REFUSÉE — jamais ouverte par défaut.
 *
 * Façade de `verifyStaticBearer` (`@aphrody/shenron-auth/tokens`) : comparaison à durée
 * constante, schéma `Bearer` insensible à la casse, jeton de 16 caractères minimum.
 */

/**
 * Le jeton configuré : `DATABOOKS_API_TOKEN`, puis le jeton admin
 * (`SHENRON_ADMIN_TOKEN`, alias `API_ADMIN_TOKEN`). Une variable vide compte
 * comme absente (`envFirst` de `@aphrody/shenron-config/env`).
 */
function configuredApiToken(): string {
  return envFirst(process.env, ["DATABOOKS_API_TOKEN", ...ENV_ALIASES.adminToken])?.value ?? "";
}

/** Le jeton attendu, ou `null` si aucun n'est configuré (écriture fermée). */
export function expectedApiToken(): string | null {
  return acceptedStaticTokens([configuredApiToken()])[0] ?? null;
}

/**
 * Jeton porteur valide, ou requête d'un poste d'administration (`SHENRON_ADMIN_IPS`) :
 * le desktop, le CLI et les scripts de l'opérateur n'ont pas à porter le jeton depuis ses IP.
 */
export function hasValidApiToken(req: Request): boolean {
  return (
    verifyStaticBearer(req.headers, [configuredApiToken()]) === "valid" || isAdminIp(req.headers)
  );
}
