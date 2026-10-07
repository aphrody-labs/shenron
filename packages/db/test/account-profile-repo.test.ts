// SPDX-License-Identifier: Apache-2.0
import { expect, test } from "bun:test";
import { drizzle as bunDrizzle } from "drizzle-orm/bun-sql";
import { drizzle as pgDrizzle } from "drizzle-orm/postgres-js";
import { fullSchema } from "../src/full-schema";
import {
  accountProfileQuery,
  accountProfileUpsert,
  createAccountProfileRepository,
  type AccountProfile,
} from "../src/repos/accounts";
import type { ShenronPgDatabase } from "../src/types";

const drivers = [pgDrizzle.mock({ schema: fullSchema }), bunDrizzle.mock({ schema: fullSchema })];
const profile: AccountProfile = {
  id: "app-1",
  discordId: "123456789012345678",
  username: "Goku",
  avatar: null,
  roleAdmin: false,
  createdAt: new Date(0),
};

test("both PG drivers read the current auth profile and lock only the auth user", () => {
  const queries = drivers.map((driver) => accountProfileQuery(driver, "auth-1").toSQL());
  expect(queries[0]).toEqual(queries[1]);
  expect(queries[0]?.params).toEqual(["auth-1", "discord", 1]);
  expect(queries[0]?.sql).toContain('inner join "ba_account"');
  expect(queries[0]?.sql).toContain('left join "User"');
  expect(queries[0]?.sql).toContain('for update of "ba_user"');
});

test("upsert preserves identity, preferences, dates and concurrent manually granted rights", () => {
  for (const driver of drivers) {
    const query = accountProfileUpsert(driver, {
      discordId: profile.discordId,
      name: "Vegeta",
      image: "https://example.test/v.png",
      staff: false,
    }).toSQL();
    const update = query.sql.slice(query.sql.indexOf("do update"));
    expect(update).toContain('"roleAdmin" = "User"."roleAdmin" or');
    expect(update).not.toContain('"id" =');
    expect(update).not.toContain('"createdAt" =');
    expect(update).not.toContain('"discordId" =');
    expect(query.params).toContain("Vegeta");
    expect(query.params).toContain(false);
  }
});

function fixture(
  existing: AccountProfile | null,
  name = "Goku",
  image: string | null = null,
  linked = true,
  fail = false,
) {
  const writes: Record<string, unknown>[] = [];
  let transactions = 0;
  let locked = false;
  let committed = false;
  const tx = {
    select: () => ({
      from: () => ({
        innerJoin: () => ({
          leftJoin: () => ({
            where: () => ({
              limit: () => ({
                for: async () => {
                  locked = true;
                  return linked
                    ? [{ discordId: profile.discordId, name, image, profile: existing }]
                    : [];
                },
              }),
            }),
          }),
        }),
      }),
    }),
    insert: () => ({
      values: (values: Record<string, unknown>) => ({
        onConflictDoUpdate: () => ({
          returning: async () => {
            expect(locked).toBe(true);
            writes.push(values);
            if (fail) throw new Error("write failed");
            return [
              {
                ...profile,
                ...existing,
                ...values,
                roleAdmin: existing?.roleAdmin === true || values.roleAdmin === true,
              },
            ];
          },
        }),
      }),
    }),
  };
  const db = {
    async transaction(body: (value: typeof tx) => Promise<unknown>) {
      transactions++;
      const result = await body(tx);
      committed = true;
      return result;
    },
  } as unknown as ShenronPgDatabase;
  return {
    db,
    writes,
    get transactions() {
      return transactions;
    },
    get committed() {
      return committed;
    },
  };
}

test("creates on first Discord link and repairs divergent auth data without changing the business id", async () => {
  const first = fixture(null);
  expect(
    await createAccountProfileRepository(first.db, () => false).synchronize("auth-1"),
  ).toMatchObject(profile);
  expect(first.writes).toHaveLength(1);
  const changed = fixture(profile, "Vegeta", "https://example.test/v.png");
  expect(
    await createAccountProfileRepository(changed.db, () => false).synchronize("auth-1"),
  ).toMatchObject({ id: profile.id, username: "Vegeta", avatar: "https://example.test/v.png" });
  expect(changed.transactions).toBe(1);
});

test("unchanged profiles do not write; an absent Discord link never creates a business account", async () => {
  const unchanged = fixture(profile);
  expect(
    await createAccountProfileRepository(unchanged.db, () => false).synchronize("auth-1"),
  ).toEqual(profile);
  expect(unchanged.writes).toHaveLength(0);
  const unlinked = fixture(null, "Goku", null, false);
  expect(
    await createAccountProfileRepository(unlinked.db, () => true).synchronize("auth-1"),
  ).toBeNull();
  expect(unlinked.writes).toHaveLength(0);
});

test("staff policy elevates, but removing it never revokes a manually granted admin role", async () => {
  const elevated = fixture(profile);
  expect(
    (await createAccountProfileRepository(elevated.db, () => true).synchronize("auth-1"))
      ?.roleAdmin,
  ).toBe(true);
  const manual = fixture({ ...profile, roleAdmin: true }, "Vegeta");
  expect(
    (await createAccountProfileRepository(manual.db, () => false).synchronize("auth-1"))?.roleAdmin,
  ).toBe(true);
});

test("DB failure propagates without reporting a committed synchronization", async () => {
  const failed = fixture(profile, "Vegeta", null, true, true);
  await expect(
    createAccountProfileRepository(failed.db, () => false).synchronize("auth-1"),
  ).rejects.toThrow("write failed");
  expect(failed.committed).toBe(false);
});
