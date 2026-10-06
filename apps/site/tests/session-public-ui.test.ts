/**
 * Admin access by IP, cookie or token is an automation actor for the admin guards and the
 * API, never a signed-in reader: an anonymous visitor from an admin address must not see
 * the `OWNER_ID` account in the public UI (`/api/me`, the shell account block, member pages).
 */
import { beforeEach, describe, expect, mock, test } from "bun:test";

const OWNER_ROW = {
  id: "user-owner",
  discordId: "owner-discord",
  username: "Omar",
  avatar: "https://cdn.discordapp.com/avatars/x.png",
  roleAdmin: true,
  createdAt: new Date("2026-01-01T00:00:00Z"),
};

let headers = new Headers();
let adminIp = false;

mock.module("server-only", () => ({}));
mock.module("@shenron/auth/next", () => ({ requestHeaders: async () => headers }));
mock.module("@/lib/auth", () => ({ auth: { api: { getSession: async () => null } } }));
mock.module("@/lib/env", () => ({ env: { OWNER_ID: "owner-discord", OAUTH_ALLOWED_USERS: [] } }));
mock.module("@/lib/admin-ip", () => ({ isAdminIp: () => adminIp }));
mock.module("@/lib/admin-token", () => ({
  ADMIN_COOKIE: "dbfr_admin",
  adminTokenEnabled: () => false,
  verifyAdminCookie: () => false,
  verifyAdminTokenOrBearer: () => false,
}));
mock.module("@shenron/db/repos/accounts", () => ({
  createDiscordAccountLookup: () => ({ discordIdForUser: async () => null }),
}));
mock.module("@/lib/db", () => {
  const chain = { from: () => chain, where: () => chain, limit: async () => [OWNER_ROW] };
  return { db: { select: () => chain } };
});

const session = await import("../src/lib/session");
const { GET } = await import("../src/app/api/me/route");

beforeEach(() => {
  headers = new Headers({ "x-real-ip": "81.64.138.142" });
});

describe("public UI session", () => {
  test("anonymous request from an admin IP: admin guard yes, reader no", async () => {
    adminIp = true;
    const actor = await session.getCurrentUser();
    expect(actor?.user?.roleAdmin).toBe(true);
    expect(await session.getSessionUser()).toBeNull();
    const body = (await (await GET()).json()) as Record<string, unknown>;
    expect(body).toEqual({ authenticated: false, username: null, avatar: null, isAdmin: false });
  });

  test("anonymous request from elsewhere: nobody", async () => {
    adminIp = false;
    expect(await session.getCurrentUser()).toBeNull();
    expect(await session.getSessionUser()).toBeNull();
  });
});
