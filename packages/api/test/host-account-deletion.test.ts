// SPDX-License-Identifier: Apache-2.0
import { expect, test } from "bun:test";
import { betterAuth } from "better-auth";
import { memoryAdapter } from "better-auth/adapters/memory";
import type { AccountDeletionIdentity } from "@aphrody/shenron-db/repos/accounts";
import { buildAccountDeletionHooks } from "../src/host/account-deletion";

const user = (id: string) => ({
  id,
  name: id,
  email: `${id}@example.test`,
  emailVerified: false,
  createdAt: new Date(),
  updatedAt: new Date(),
});

test("identities survive the cascade independently for concurrent requests", async () => {
  const purged: AccountDeletionIdentity[] = [];
  let revision = 0;
  const hooks = buildAccountDeletionHooks({
    identityForAuthUser: async (authUserId) => ({
      authUserId,
      appUserId: `app-${++revision}`,
      discordId: "123",
    }),
    purgeAccountData: async (identity) => {
      purged.push(identity);
    },
  });
  const first = new Request("http://localhost/api/auth/delete-user");
  const second = new Request("http://localhost/api/auth/delete-user");
  await hooks.beforeDelete(user("ba"), first);
  await hooks.beforeDelete(user("ba"), second);
  await hooks.afterDelete(user("ba"), second);
  await hooks.afterDelete(user("ba"), first);
  await hooks.afterDelete(user("ba"), first);
  expect(purged.map((identity) => ("appUserId" in identity ? identity.appUserId : null))).toEqual([
    "app-2",
    "app-1",
  ]);
});

test("a failed purge propagates and retains the identity for a retry", async () => {
  let attempts = 0;
  const hooks = buildAccountDeletionHooks({
    identityForAuthUser: async () => null,
    purgeAccountData: async () => {
      if (++attempts === 1) throw new Error("db down");
    },
  });
  const authUser = user("unlinked");
  await hooks.beforeDelete(authUser);
  await expect(hooks.afterDelete(authUser)).rejects.toThrow("db down");
  await hooks.afterDelete(authUser);
  await hooks.afterDelete(authUser);
  expect(attempts).toBe(2);
});

test("lookup failure prevents deletion and cannot reuse a previous identity", async () => {
  let fail = false;
  let purged = false;
  const hooks = buildAccountDeletionHooks({
    identityForAuthUser: async () => {
      if (fail) throw new Error("db down");
      return null;
    },
    purgeAccountData: async () => {
      purged = true;
    },
  });
  const authUser = user("ba");
  await hooks.beforeDelete(authUser);
  fail = true;
  await expect(hooks.beforeDelete(authUser)).rejects.toThrow("db down");
  await hooks.afterDelete(authUser);
  expect(purged).toBe(false);
});

test("a real Better Auth HTTP deletion purges auth-only data and revokes the session", async () => {
  const purged: AccountDeletionIdentity[] = [];
  const hooks = buildAccountDeletionHooks({
    identityForAuthUser: async () => null,
    purgeAccountData: async (identity) => {
      purged.push(identity);
    },
  });
  const auth = betterAuth({
    baseURL: "http://localhost:3000",
    secret: "test-account-deletion-secret-0123456789abcdef",
    database: memoryAdapter({ user: [], session: [], account: [], verification: [] }),
    emailAndPassword: { enabled: true },
    user: { deleteUser: hooks },
    logger: { disabled: true },
  });
  const signed = await auth.handler(
    new Request("http://localhost:3000/api/auth/sign-up/email", {
      method: "POST",
      headers: { "content-type": "application/json", origin: "http://localhost:3000" },
      body: JSON.stringify({
        name: "Goku",
        email: "goku@example.test",
        password: "test-password-123456",
      }),
    }),
  );
  expect(signed.status).toBe(200);
  const body = (await signed.json()) as { user: { id: string } };
  const cookie = signed.headers
    .getSetCookie()
    .map((value) => value.split(";")[0])
    .join("; ");
  expect(cookie).not.toBe("");
  const deleted = await auth.handler(
    new Request("http://localhost:3000/api/auth/delete-user", {
      method: "POST",
      headers: { "content-type": "application/json", origin: "http://localhost:3000", cookie },
      body: "{}",
    }),
  );
  expect(deleted.status).toBe(200);
  expect(purged).toEqual([{ authUserId: body.user.id }]);
  expect(await auth.api.getSession({ headers: new Headers({ cookie }) })).toBeNull();
});
