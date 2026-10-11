// SPDX-License-Identifier: Apache-2.0
import { afterAll, expect, mock, test } from "bun:test";
import { hostCurrentUser } from "../src/lib/host-current-user";

mock.module("server-only", () => ({}));
mock.module("@aphrody/shenron-auth/next", () => ({
  requestHeaders: async () => new Headers({ cookie: "reader=session" }),
}));
mock.module("@/lib/env", () => ({ env: { OWNER_ID: "owner", OAUTH_ALLOWED_USERS: [] } }));
mock.module("@/lib/admin-token", () => ({
  ADMIN_COOKIE: "dbfr_admin",
  adminTokenEnabled: () => false,
  verifyAdminCookie: () => false,
  verifyAdminTokenOrBearer: () => false,
}));
mock.module("@/lib/admin-ip", () => ({ isAdminIp: () => false }));
mock.module("@/lib/db", () => {
  throw new Error("Next must not load its DB for a hosted reader");
});
mock.module("@/lib/auth", () => {
  throw new Error("Next must not initialize Better Auth for a hosted reader");
});

let body: unknown = {
  sessionUserId: "auth-goku",
  discordId: "discord-goku",
  user: {
    id: "goku",
    discordId: "discord-goku",
    username: "Goku",
    avatar: null,
    roleAdmin: true,
    createdAt: "2026-01-01T00:00:00.000Z",
  },
};
let status = 200;
const headers: Headers[] = [];
const server = Bun.serve({
  port: 0,
  hostname: "127.0.0.1",
  fetch(request) {
    expect(new URL(request.url).pathname).toBe("/api/v1/account/session");
    headers.push(request.headers);
    return Response.json(body, { status });
  },
});
const previous = process.env.SHENRON_HOST_URL;
process.env.SHENRON_HOST_URL = server.url.origin;
afterAll(() => {
  server.stop(true);
  if (previous === undefined) delete process.env.SHENRON_HOST_URL;
  else process.env.SHENRON_HOST_URL = previous;
});

test("Next reads the Bun profile without loading DB/auth or caching profile and permissions", async () => {
  const { getCurrentUser, getSessionUser } = await import("../src/lib/session");
  const first = await getCurrentUser();
  expect(first?.user?.username).toBe("Goku");
  expect(first?.user?.createdAt).toBeInstanceOf(Date);
  body = {
    ...first,
    user: {
      ...first!.user,
      username: "Vegeta",
      roleAdmin: false,
      createdAt: "2026-01-01T00:00:00.000Z",
    },
  };
  expect((await getSessionUser())?.user).toMatchObject({ username: "Vegeta", roleAdmin: false });
  body = null;
  expect(await getCurrentUser()).toBeNull();
  status = 503;
  expect(await getCurrentUser()).toBeNull();
});

test("the host client validates responses and forwards only reader credentials", async () => {
  status = 200;
  body = { sessionUserId: "auth-goku", discordId: "discord-goku", user: { roleAdmin: true } };
  expect(
    await hostCurrentUser(
      server.url.origin,
      new Headers({
        cookie: "reader=session",
        authorization: "Bearer reader",
        "x-admin-token": "admin",
        "x-shenron-owner": "discord:owner",
      }),
    ),
  ).toBeNull();
  expect(headers.at(-1)?.get("cookie")).toBe("reader=session");
  expect(headers.at(-1)?.get("authorization")).toBe("Bearer reader");
  expect(headers.at(-1)?.get("x-admin-token")).toBeNull();
  expect(headers.at(-1)?.get("x-shenron-owner")).toBeNull();
  expect(await hostCurrentUser("http://127.0.0.1:1", new Headers())).toBeNull();
});
