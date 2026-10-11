// SPDX-License-Identifier: Apache-2.0
import { expect, test } from "bun:test";
import { ADMIN_ROUTES, adminUrl, dashboardRedirect } from "../src/admin";

test("every historical dashboard entry redirects to the single authenticated administration", () => {
  for (const [route, path] of Object.entries(ADMIN_ROUTES)) {
    const concrete = route.replace(":table", "users").replace(":id", "42");
    const expected = path.replace(":table", "users").replace(":id", "42");
    const response = dashboardRedirect(
      new Request("https://bot.example" + concrete + "?token=fixture#secret"),
      { SHENRON_PUBLIC_SITE_URL: "https://admin.example" },
    );
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("https://admin.example" + expected);
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
  }
});
test("unknown paths and malformed destinations are refused", () => {
  expect(dashboardRedirect(new Request("https://bot.example/api/secret")).status).toBe(404);
  expect(() => adminUrl({ SHENRON_PUBLIC_SITE_URL: "https://user:pass@example.test" })).toThrow();
  expect(() => adminUrl({}, "//other.example")).toThrow();
  expect(() => adminUrl({}, "/admin\\evil")).toThrow();
});

test("the bot auth origin never becomes the administration host", () => {
  const env = { BETTER_AUTH_URL: "https://bot.example" };
  expect(adminUrl(env)).toBe("https://dragonballfr.com/admin/dashboard");
  expect(adminUrl({ ...env, SHENRON_PUBLIC_SITE_URL: "https://site.example" })).toBe(
    "https://site.example/admin/dashboard",
  );
});
