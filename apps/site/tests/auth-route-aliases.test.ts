/**
 * Conventional account addresses (`/login`, `/register`, `/account`…) answer a single
 * 308 to the sign-in page or the account space, query kept, and land on a real route.
 */
import { describe, expect, test } from "bun:test";
import { AUTH_ROUTE_ALIASES } from "../src/lib/legacy-routes";
import { followRedirects, servingRoute } from "./next-config-routes";

describe("auth and account aliases", () => {
  test.each([
    ["/login", "/signin"],
    ["/sign-in", "/signin"],
    ["/auth/sign-in", "/signin"],
    ["/signup", "/signin"],
    ["/register", "/signin"],
    ["/account", "/account/billing"],
  ])("%s → %s in one hop", (from, to) => {
    expect(followRedirects(from)).toEqual({ target: to, hops: 1 });
  });

  test("the query string survives (callbackURL)", () => {
    expect(followRedirects("/login?callbackURL=%2Fvip").target).toBe("/signin?callbackURL=%2Fvip");
  });

  test("real pages are not captured", () => {
    expect(followRedirects("/signin")).toEqual({ target: "/signin", hops: 0 });
    expect(followRedirects("/account/billing")).toEqual({ target: "/account/billing", hops: 0 });
  });

  test("every target is served by a route of src/app", () => {
    for (const alias of AUTH_ROUTE_ALIASES) {
      expect(servingRoute(alias.to)).toBe(alias.to);
      expect(servingRoute(alias.from)).toBeNull();
    }
  });
});
