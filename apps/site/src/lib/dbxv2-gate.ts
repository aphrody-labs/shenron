/**
 * Gate of the private game features of the site. Pure and dependency free: it decides, from the
 * environment alone, whether the private DBXV2 admin tools may run, WITHOUT importing the private
 * package (which therefore never enters a public bundle). Same rules as `isDbxv2Enabled` of the
 * private package, which is checked again once it is loaded: off by default, always off in a
 * public render or build and in production.
 */

type Env = Readonly<Record<string, string | undefined>>;

export type SiteGate =
  | { readonly enabled: true }
  | {
      readonly enabled: false;
      readonly reason: "public" | "production" | "unconfigured";
    };

const truthy = (value: string | undefined): boolean =>
  value !== undefined && /^(?:1|true|yes|on)$/i.test(value.trim());

export function dbxv2SiteGate(env: Env = process.env): SiteGate {
  if (
    env.SHENRON_PROFILE === "public" ||
    truthy(env.SHENRON_PUBLIC_RENDER) ||
    truthy(env.SHENRON_PUBLIC_BUILD)
  )
    return { enabled: false, reason: "public" };
  if (env.NODE_ENV === "production") return { enabled: false, reason: "production" };
  const url = env.DBXV2_SERVER_URL?.trim();
  const token = env.DBXV2_TOKEN ?? "";
  if (!url || token.length < 16) return { enabled: false, reason: "unconfigured" };
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:")
      return { enabled: false, reason: "unconfigured" };
  } catch {
    return { enabled: false, reason: "unconfigured" };
  }
  return { enabled: true };
}
