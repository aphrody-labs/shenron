/**
 * Browser Better Auth client (runtime class `react`). The browser origin wins;
 * `fallbackURL` is only used during SSR/prerender where there is no `window`.
 */
import { createAuthClient } from "better-auth/react";
import { magicLinkClient, twoFactorClient } from "better-auth/client/plugins";
import { oauthProviderClient } from "@better-auth/oauth-provider/client";
import { passkeyClient } from "@better-auth/passkey/client";

/** Origin to send auth calls to: the browser origin first, else the fallback. */
export function resolveClientBaseURL(fallbackURL: string): string {
  if (typeof window !== "undefined" && window.location?.origin) return window.location.origin;
  return fallbackURL.replace(/\/+$/, "");
}

export function createShenronAuthClient(options: { fallbackURL: string }) {
  return createAuthClient({
    baseURL: resolveClientBaseURL(options.fallbackURL),
    plugins: [
      magicLinkClient(),
      twoFactorClient({ twoFactorPage: "/two-factor" }),
      passkeyClient(),
      oauthProviderClient(),
    ],
  });
}
