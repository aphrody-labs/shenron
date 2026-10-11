// SPDX-License-Identifier: Apache-2.0
/**
 * Network guards shared by every `@aphrody/shenron-*` package: the single loopback /
 * HTTPS URL doctrine (formerly copied in `compute.ts`, `shenron-embeddings.ts`,
 * `web.ts` and `ia-cockpit.ts`) and the client IP doctrine of
 * `apps/site/src/app/api/_client-ip.ts`.
 *
 * Runtime class: `pure` (only `URL` and `Headers`).
 */
import type { EnvIssue } from "./env";

/**
 * Exactly the loopback host forms accepted today by the Aphrody clients:
 * the IPv4 loopback literal, the bracketed IPv6 form produced by `URL`, the
 * bare IPv6 form produced by socket addresses, and `localhost`. The rest of
 * `127.0.0.0/8` is deliberately NOT accepted.
 */
const LOOPBACK_HOSTS: ReadonlySet<string> = new Set(["127.0.0.1", "[::1]", "::1", "localhost"]);

/** IPv4-mapped IPv6 form of the loopback literal reported by dual-stack sockets. */
const MAPPED_IPV4_LOOPBACK = "::ffff:127.0.0.1";

/** `true` for the loopback host forms listed in {@link LOOPBACK_HOSTS}, nothing else. */
export function isLoopbackHost(hostname: string): boolean {
  return LOOPBACK_HOSTS.has(hostname);
}

type UrlResult = { ok: true; url: URL } | { ok: false; issue: EnvIssue };

function parseUrl(raw: string | undefined, label: string): UrlResult {
  const value = typeof raw === "string" ? raw.trim() : "";
  if (value === "" || value === "undefined" || value === "null") {
    return { ok: false, issue: { name: label, problem: "missing" } };
  }
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return {
      ok: false,
      issue: { name: label, problem: "invalid", hint: "not a valid absolute URL" },
    };
  }
  if (url.username || url.password) {
    return {
      ok: false,
      issue: { name: label, problem: "invalid", hint: "credentials are not allowed in the URL" },
    };
  }
  return { ok: true, url };
}

/**
 * Parses a private service URL that must be plain HTTP on a loopback host,
 * without credentials. Query string and fragment are stripped.
 */
export function parseLoopbackHttpUrl(raw: string | undefined, label: string): UrlResult {
  const parsed = parseUrl(raw, label);
  if (!parsed.ok) return parsed;
  const { url } = parsed;
  if (url.protocol !== "http:") {
    return {
      ok: false,
      issue: { name: label, problem: "invalid", hint: "must use http:// on a loopback host" },
    };
  }
  if (!isLoopbackHost(url.hostname)) {
    return {
      ok: false,
      issue: { name: label, problem: "invalid", hint: "must target a loopback host" },
    };
  }
  url.search = "";
  url.hash = "";
  return { ok: true, url };
}

/**
 * Parses a URL that must use HTTPS, or plain HTTP on a loopback host, without
 * credentials. Query string and fragment are stripped.
 */
export function parseHttpsOrLoopbackUrl(raw: string | undefined, label: string): UrlResult {
  const parsed = parseUrl(raw, label);
  if (!parsed.ok) return parsed;
  const { url } = parsed;
  const loopbackHttp = url.protocol === "http:" && isLoopbackHost(url.hostname);
  if (url.protocol !== "https:" && !loopbackHttp) {
    return {
      ok: false,
      issue: {
        name: label,
        problem: "invalid",
        hint: "must use https://, or http:// on a loopback host",
      },
    };
  }
  url.search = "";
  url.hash = "";
  return { ok: true, url };
}

/**
 * Client IP as nginx sees it: `x-real-ip` (set by nginx to the socket address,
 * not spoofable), else the LAST `X-Forwarded-For` hop (the one appended by the
 * front proxy; the leftmost hop is client-controlled), else `"unknown"`.
 * Same output as `apps/site/src/app/api/_client-ip.ts`.
 */
export function clientIpFromHeaders(headers: Headers): string {
  const realIp = headers.get("x-real-ip")?.trim();
  if (realIp) return realIp;
  const xff = headers.get("x-forwarded-for");
  if (xff) {
    const parts = xff
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean);
    const last = parts[parts.length - 1];
    if (last) return last;
  }
  return "unknown";
}

/**
 * `true` for a direct loopback caller: the socket address is loopback (the
 * forms of {@link isLoopbackHost}, plus the IPv4-mapped `::ffff:127.0.0.1`
 * reported by dual-stack listeners) AND the request carries neither
 * `x-real-ip` nor `x-forwarded-for` (a proxied request is never "direct").
 */
export function isDirectLoopback(
  headers: Headers,
  remoteAddress: string | null | undefined,
): boolean {
  if (!remoteAddress) return false;
  if (!isLoopbackHost(remoteAddress) && remoteAddress !== MAPPED_IPV4_LOOPBACK) return false;
  return !headers.has("x-real-ip") && !headers.has("x-forwarded-for");
}

// ── Listes blanches d'adresses (administration par IP) ──────────────────────

/** Bloc d'adresses : famille, adresse de base en entier, longueur de préfixe. */
export interface IpRange {
  family: 4 | 6;
  base: bigint;
  prefix: number;
}

function ipv4ToBigInt(ip: string): bigint | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  let value = 0n;
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const n = Number(part);
    if (n > 255) return null;
    value = (value << 8n) | BigInt(n);
  }
  return value;
}

function ipv6ToBigInt(ip: string): bigint | null {
  let text = ip.toLowerCase();
  // Suffixe IPv4 (`::ffff:1.2.3.4`) : deux groupes de 16 bits.
  const dotted = /^(.*:)(\d{1,3}(?:\.\d{1,3}){3})$/.exec(text);
  if (dotted) {
    const v4 = ipv4ToBigInt(dotted[2]!);
    if (v4 === null) return null;
    text = `${dotted[1]}${(v4 >> 16n).toString(16)}:${(v4 & 0xffffn).toString(16)}`;
  }
  const halves = text.split("::");
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(":") : [];
  const tail = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  const missing = 8 - head.length - tail.length;
  if (halves.length === 1 ? missing !== 0 : missing < 1) return null;
  const groups = [...head, ...Array<string>(halves.length === 2 ? missing : 0).fill("0"), ...tail];
  let value = 0n;
  for (const group of groups) {
    if (!/^[0-9a-f]{1,4}$/.test(group)) return null;
    value = (value << 16n) | BigInt(Number.parseInt(group, 16));
  }
  return value;
}

/** Adresse IP (v4, v6, v4 mappée en v6) en bloc /32 ou /128, ou `null`. */
export function parseIp(raw: string): IpRange | null {
  const ip = raw
    .trim()
    .replace(/^\[|\]$/g, "")
    .replace(/%.*$/, "");
  const v4 = ipv4ToBigInt(ip);
  if (v4 !== null) return { family: 4, base: v4, prefix: 32 };
  const v6 = ipv6ToBigInt(ip);
  if (v6 === null) return null;
  // `::ffff:a.b.c.d` est l'adresse IPv4 a.b.c.d (écouteurs double pile).
  if (v6 >> 32n === 0xffffn) return { family: 4, base: v6 & 0xffffffffn, prefix: 32 };
  return { family: 6, base: v6, prefix: 128 };
}

/** `1.2.3.4`, `10.8.0.0/24`, `2001:db8::/32` → bloc normalisé, ou `null` si invalide. */
export function parseIpRange(raw: string): IpRange | null {
  const [address, length, extra] = raw.trim().split("/");
  if (!address || extra !== undefined) return null;
  const ip = parseIp(address);
  if (!ip) return null;
  if (length === undefined) return ip;
  if (!/^\d{1,3}$/.test(length)) return null;
  const max = ip.family === 4 ? 32 : 128;
  const prefix = Number(length);
  if (prefix > max) return null;
  const bits = BigInt(max - prefix);
  return { family: ip.family, base: (ip.base >> bits) << bits, prefix };
}

/**
 * Liste blanche depuis une variable d'environnement (`SHENRON_ADMIN_IPS`,
 * `SHENRON_MCP_ALLOWED_IPS`) : adresses ou CIDR séparés par virgules ou espaces.
 * Les entrées invalides sont rejetées dans `invalid` (jamais élargies).
 */
export function parseIpAllowlist(raw: string | undefined): {
  ranges: IpRange[];
  invalid: string[];
} {
  const ranges: IpRange[] = [];
  const invalid: string[] = [];
  for (const entry of (raw ?? "").split(/[\s,]+/)) {
    if (!entry) continue;
    const range = parseIpRange(entry);
    if (range) ranges.push(range);
    else invalid.push(entry);
  }
  return { ranges, invalid };
}

/** `true` si `ip` appartient à l'un des blocs (familles comparées séparément). */
export function ipInRanges(ip: string, ranges: readonly IpRange[]): boolean {
  const address = parseIp(ip);
  if (!address) return false;
  return ranges.some((range) => {
    if (range.family !== address.family) return false;
    const bits = BigInt((range.family === 4 ? 32 : 128) - range.prefix);
    return address.base >> bits === range.base >> bits;
  });
}
