/**
 * Host and origin policy of each application (S2, 172cebb7^:docs/architecture/STACK.md §2.2).
 *
 * Runtime class `pure`: no platform import, no environment read. The caller
 * says whether it runs in production; nothing is inferred here.
 *
 * - No wildcard entry: a wildcard trusted host lets any matching deployment act as
 *   the site (open redirect through Better Auth callbacks).
 * - `localhost` entries exist only outside production.
 *
 * Every call returns a fresh array, so a consumer can never mutate the policy.
 */

export interface OriginPolicyInput {
  production: boolean;
}

const SITE_PRODUCTION_HOSTS = ["dragonballfr.com", "www.dragonballfr.com"] as const;
const SITE_DEVELOPMENT_HOSTS = ["localhost:3000"] as const;

const SITE_PRODUCTION_ORIGINS = [
  "https://dragonballfr.com",
  "https://www.dragonballfr.com",
] as const;
const SITE_DEVELOPMENT_ORIGINS = ["http://localhost:3000"] as const;

const BOT_PRODUCTION_ORIGINS = [
  "https://dragonballfr.com",
  "https://www.dragonballfr.com",
  "https://bot.dragonballfr.com",
] as const;
const BOT_DEVELOPMENT_ORIGINS = ["http://localhost:3000", "http://localhost:5006"] as const;

function compose(
  production: readonly string[],
  development: readonly string[],
  input: OriginPolicyInput,
): string[] {
  return input.production ? [...production] : [...production, ...development];
}

/** Hosts accepted by the dynamic `baseURL` of the site (Better Auth `allowedHosts`). */
export function siteAllowedHosts(input: OriginPolicyInput): string[] {
  return compose(SITE_PRODUCTION_HOSTS, SITE_DEVELOPMENT_HOSTS, input);
}

/** Origins trusted by the site's Better Auth instance (`trustedOrigins`). */
export function siteTrustedOrigins(input: OriginPolicyInput): string[] {
  return compose(SITE_PRODUCTION_ORIGINS, SITE_DEVELOPMENT_ORIGINS, input);
}

/** Origins trusted by the bot's Better Auth instance (`trustedOrigins`). */
export function botTrustedOrigins(input: OriginPolicyInput): string[] {
  return compose(BOT_PRODUCTION_ORIGINS, BOT_DEVELOPMENT_ORIGINS, input);
}
