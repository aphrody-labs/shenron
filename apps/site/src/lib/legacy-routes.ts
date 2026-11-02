// SPDX-License-Identifier: Apache-2.0
import type { RouteRename } from "@aphrody/shenron-config/legacy-routes";

export * from "@aphrody/shenron-config/legacy-routes";

/**
 * Conventional account addresses that visitors and other sites guess (`/login`,
 * `/register`, `/account`…). The site has a single sign-in page (`/signin`, sign-up
 * included) and the account space lives under `/account/billing` and `/settings`.
 * Exact matches only: `/account/billing` is a real page. Answered with a 308 by
 * `next.config.ts`; the query string (`callbackURL`…) is kept.
 */
export const AUTH_ROUTE_ALIASES: readonly RouteRename[] = [
  { from: "/login", to: "/signin", exact: true },
  { from: "/log-in", to: "/signin", exact: true },
  { from: "/sign-in", to: "/signin", exact: true },
  { from: "/auth/sign-in", to: "/signin", exact: true },
  { from: "/auth/login", to: "/signin", exact: true },
  { from: "/auth/signin", to: "/signin", exact: true },
  { from: "/connexion", to: "/signin", exact: true },
  { from: "/signup", to: "/signin", exact: true },
  { from: "/sign-up", to: "/signin", exact: true },
  { from: "/register", to: "/signin", exact: true },
  { from: "/auth/sign-up", to: "/signin", exact: true },
  { from: "/auth/register", to: "/signin", exact: true },
  { from: "/inscription", to: "/signin", exact: true },
  { from: "/account", to: "/account/billing", exact: true },
  { from: "/compte", to: "/account/billing", exact: true },
  { from: "/dons", to: "/donations", exact: true },
  { from: "/don", to: "/donations", exact: true },
  { from: "/donate", to: "/donations", exact: true },
  { from: "/abonnement", to: "/vip", exact: true },
  { from: "/subscribe", to: "/vip", exact: true },
  { from: "/premium", to: "/vip", exact: true },
];
