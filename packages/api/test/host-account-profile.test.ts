// SPDX-License-Identifier: Apache-2.0
import { expect, test } from "bun:test";
import { betterAuth } from "better-auth";
import { memoryAdapter } from "better-auth/adapters/memory";
import { accountProfileHooks } from "../src/host/account-profile";
import { buildHostAuthOptions } from "../src/host/auth";

test("Better Auth synchronizes after Discord linking and valid HTTP profile writes only", async () => {
  const database: Record<string, Record<string, unknown>[]> = {
    user: [],
    account: [],
    session: [],
    verification: [],
  };
  const synchronized: { name: unknown; image: unknown }[] = [];
  const hooks = accountProfileHooks({
    async synchronize(id) {
      const user = database.user!.find((row) => row.id === id);
      if (!user) throw new Error("Auth user must be committed before the hook");
      if (database.account!.some((row) => row.userId === id && row.providerId === "discord"))
        synchronized.push({ name: user.name, image: user.image ?? null });
      return null;
    },
  });
  const options = buildHostAuthOptions(
    {
      DISCORD_CLIENT_ID: "id",
      DISCORD_CLIENT_SECRET: "secret",
      BETTER_AUTH_SECRET: "s".repeat(40),
    },
    undefined,
  );
  if ("reason" in options) throw new Error(options.reason);
  const auth = betterAuth({
    ...options,
    baseURL: "http://localhost:3000",
    database: memoryAdapter(database),
    emailAndPassword: { enabled: true },
    logger: { disabled: true },
    databaseHooks: {
      ...hooks,
      user: { update: { ...options.databaseHooks?.user?.update, ...hooks.user.update } },
    },
  });
  const request = (path: string, body: unknown, cookie = "") =>
    new Request(`http://localhost:3000/api/auth/${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: "http://localhost:3000", cookie },
      body: JSON.stringify(body),
    });
  const signed = await auth.handler(
    request("sign-up/email", {
      name: "Goku",
      email: "profile-sync@example.test",
      password: "test-password-123456",
    }),
  );
  expect(signed.status).toBe(200);
  expect(synchronized).toHaveLength(0); // The credential provider is not a Discord link.
  const body = (await signed.json()) as { user: { id: string } };
  const context = await auth.$context;
  await context.internalAdapter.createAccount({
    userId: body.user.id,
    providerId: "discord",
    accountId: "123456789012345678",
  });
  expect(synchronized).toEqual([{ name: "Goku", image: null }]);
  const cookie = signed.headers
    .getSetCookie()
    .map((value) => value.split(";")[0])
    .join("; ");
  const invalid = await auth.handler(request("update-user", { name: "x" }, cookie));
  expect(invalid.status).toBe(400);
  expect(synchronized).toHaveLength(1);
  const updated = await auth.handler(
    request(
      "update-user",
      {
        name: "  Vegeta  ",
        image: "https://example.test/v.png",
      },
      cookie,
    ),
  );
  expect(updated.status).toBe(200);
  expect(synchronized).toEqual([
    { name: "Goku", image: null },
    { name: "Vegeta", image: "https://example.test/v.png" },
  ]);
  const fresh = await auth.handler(
    new Request("http://localhost:3000/api/auth/get-session?disableCookieCache=true", {
      headers: { cookie },
    }),
  );
  expect(fresh.status).toBe(200);
  // Use the original sign-up cookie, rather than the refreshed update response.
  const session = (await fresh.json()) as { user: { name: string; image: string } };
  expect(session.user).toMatchObject({ name: "Vegeta", image: "https://example.test/v.png" });
  const token = database.session![0]?.token;
  if (typeof token !== "string") throw new Error("Missing persisted test session");
  await context.internalAdapter.deleteSession(token);
  expect(
    await auth.api.getSession({
      headers: new Headers({ cookie }),
      query: { disableCookieCache: true },
    }),
  ).toBeNull();
});

test("synchronization errors propagate for retry rather than silently leaving a stale profile", async () => {
  const hooks = accountProfileHooks({
    synchronize: async () => {
      throw new Error("DB down");
    },
  });
  await expect(
    hooks.user.update.after({
      id: "auth-1",
      name: "Goku",
      email: "goku@example.test",
      emailVerified: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    }),
  ).rejects.toThrow("DB down");
});
