/**
 * Administration par adresse IP : les postes et serveurs de l'opérateur listés dans
 * `SHENRON_ADMIN_IPS` (adresses ou CIDR) sont staff sans session ni jeton — pages
 * `/admin`, routes « admin ou jeton », écritures (desktop, CLI et scripts compris).
 *
 * L'adresse est celle que nginx écrit dans `X-Real-IP` (`$remote_addr`, jamais celle du
 * client) ; à défaut, la dernière entrée de `X-Forwarded-For`, ajoutée par le proxy
 * (`clientIpFromHeaders`). Une entrée invalide de la liste est ignorée, jamais élargie.
 * Liste vide ou absente : aucun accès par IP. Lue par `@aphrody/shenron-config/env` comme les jetons
 * de `@/lib/api-token` : ce module reste importable sans valider tout l'environnement du site.
 */
import {
  clientIpFromHeaders,
  ipInRanges,
  parseIpAllowlist,
  type IpRange,
} from "@aphrody/shenron-config/net";
import { envString } from "@aphrody/shenron-config/env";

let cache: { raw: string | undefined; ranges: IpRange[] } | null = null;

/** Blocs de `SHENRON_ADMIN_IPS`, analysés une fois par valeur. */
export function adminIpRanges(
  raw: string | undefined = envString(process.env, "SHENRON_ADMIN_IPS"),
): IpRange[] {
  if (!cache || cache.raw !== raw) {
    const { ranges, invalid } = parseIpAllowlist(raw);
    if (invalid.length) console.warn(`[admin-ip] entrées ignorées : ${invalid.join(", ")}`);
    cache = { raw, ranges };
  }
  return cache.ranges;
}

/** `true` si la requête vient d'une adresse d'administration. */
export function isAdminIp(headers: Headers, ranges: readonly IpRange[] = adminIpRanges()): boolean {
  if (ranges.length === 0) return false;
  const ip = clientIpFromHeaders(headers);
  return ip !== "unknown" && ipInRanges(ip, ranges);
}
