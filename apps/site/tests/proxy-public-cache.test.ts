import { beforeAll, describe, expect, mock, test } from "bun:test";
import { NextRequest } from "next/server";

mock.module("server-only", () => ({}));
mock.module("@/lib/env", () => ({ env: { SHENRON_SITE_SURFACE: "site" } }));

let launch: { openKeys: string[]; access: Record<string, { mode: string; roleIds: string[] }> } = {
  openKeys: [],
  access: {},
};
mock.module("@/lib/wiki-launch-config", () => ({ getLaunchConfig: async () => launch }));

const SHARED = "public, max-age=0, s-maxage=60, stale-while-revalidate=600";
const STATIC_PATHS = ["/about", "/commands", "/license", "/privacy", "/credits"];
const ADMIN_IP = "203.0.113.7";

let proxy: (request: NextRequest) => Promise<Response>;

beforeAll(async () => {
  process.env.SHENRON_ADMIN_IPS = ADMIN_IP;
  ({ proxy } = await import("../src/proxy"));
});

function request(
  path: string,
  init: ConstructorParameters<typeof NextRequest>[1] = {},
): NextRequest {
  return new NextRequest(`http://localhost${path}`, init);
}

describe("proxy shared cache on static public pages", () => {
  for (const path of STATIC_PATHS) {
    test(`${path}: anonymous GET and HEAD get the shared-cache header`, async () => {
      for (const method of ["GET", "HEAD"]) {
        const response = await proxy(request(path, { method }));
        expect(response.headers.get("cache-control")).toBe(SHARED);
      }
    });

    test(`${path}: session cookie keeps the origin header`, async () => {
      const response = await proxy(
        request(path, { headers: { cookie: "better-auth.session_token=abc.def" } }),
      );
      expect(response.headers.get("cache-control")).toBeNull();
    });

    test(`${path}: admin IP keeps the origin header`, async () => {
      const response = await proxy(request(path, { headers: { "x-real-ip": ADMIN_IP } }));
      expect(response.headers.get("cache-control")).toBeNull();
    });

    test(`${path}: POST keeps the origin header`, async () => {
      const response = await proxy(request(path, { method: "POST" }));
      expect(response.headers.get("cache-control")).toBeNull();
    });
  }

  test("authorization header and admin token disable the shared cache", async () => {
    const bearer = await proxy(request("/about", { headers: { authorization: "Bearer x" } }));
    const admin = await proxy(request("/about", { headers: { "x-admin-token": "x" } }));
    expect(bearer.headers.get("cache-control")).toBeNull();
    expect(admin.headers.get("cache-control")).toBeNull();
  });

  test("paths outside the allowlist are not shared-cached", async () => {
    for (const path of ["/catalog", "/rankings", "/leaderboard", "/about/extra"]) {
      const response = await proxy(request(path));
      expect(response.headers.get("cache-control")).toBeNull();
    }
  });

  test("a closed /commands section redirects without the shared-cache header", async () => {
    launch = { openKeys: [], access: { commands: { mode: "admin", roleIds: [] } } };
    try {
      const response = await proxy(request("/commands"));
      expect(response.status).toBe(307);
      expect(response.headers.get("cache-control")).toBeNull();
    } finally {
      launch = { openKeys: [], access: {} };
    }
  });
});
