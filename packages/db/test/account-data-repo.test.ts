// SPDX-License-Identifier: Apache-2.0
import { expect, test } from "bun:test";
import { getTableName, type SQL, type Table } from "drizzle-orm";
import { drizzle as bunDrizzle } from "drizzle-orm/bun-sql";
import { drizzle as pgDrizzle } from "drizzle-orm/postgres-js";
import { accountIdentityQuery, createAccountDataRepository } from "../src/repos/accounts";
import { fullSchema } from "../src/full-schema";
import type { ShenronPgDatabase } from "../src/types";

const identity = { authUserId: "auth-1", appUserId: "app-1", discordId: "discord-1" };
const drivers = [
  pgDrizzle.mock({ schema: fullSchema }),
  bunDrizzle.mock({ schema: fullSchema }),
] as unknown as ShenronPgDatabase[];

function recordingDatabase(driver: ShenronPgDatabase, failAt = -1) {
  const attempted: { table: string; operation: string; sql: string; params: unknown[] }[] = [];
  const committed: typeof attempted = [];
  let transactions = 0;
  let rolledBack = false;
  const execute = async (
    table: Table,
    operation: string,
    compiled: { sql: string; params: unknown[] },
  ) => {
    const index = attempted.length;
    attempted.push({ table: getTableName(table), operation, ...compiled });
    if (index === failAt) throw new Error("write failed");
  };
  const tx = {
    delete: (table: Table) => ({
      where: (predicate: SQL) =>
        execute(table, "delete", driver.delete(table).where(predicate).toSQL()),
    }),
    update: (table: Table) => ({
      set: (values: Record<string, unknown>) => ({
        where: (predicate: SQL) =>
          execute(table, "update", driver.update(table).set(values).where(predicate).toSQL()),
      }),
    }),
  };
  const database = {
    async transaction(body: (transaction: typeof tx) => Promise<void>) {
      transactions++;
      try {
        await body(tx);
        committed.push(...attempted);
      } catch (error) {
        rolledBack = true;
        throw error;
      }
    },
  } as unknown as ShenronPgDatabase;
  return {
    repository: createAccountDataRepository(database),
    attempted,
    committed,
    get transactions() {
      return transactions;
    },
    get rolledBack() {
      return rolledBack;
    },
  };
}

test("identity lookup binds the auth user and Discord provider identically on both drivers", () => {
  const queries = drivers.map((driver) =>
    accountIdentityQuery(driver, identity.authUserId).toSQL(),
  );
  expect(queries[0]).toEqual(queries[1]);
  expect(queries[0]?.params).toEqual([identity.authUserId, "discord", 1]);
  expect(queries[0]?.sql).toContain('inner join "User"');
  expect(queries[0]?.sql).toContain('"User"."discordId" = "ba_account"."accountId"');
});

test("purge targets one account, anonymizes retained history and preserves editorial content", async () => {
  for (const driver of drivers) {
    const recorded = recordingDatabase(driver);
    await recorded.repository.purgeAccountData(identity);
    expect(recorded.transactions).toBe(1);
    expect(recorded.committed).toHaveLength(9);
    for (const query of recorded.committed) {
      expect(query.sql).toContain(" where ");
      expect(query.params).toContain(
        query.table === "site_events" ? identity.authUserId : identity.appUserId,
      );
      if (["site_reports", "wiki_contributions", "wiki_revisions", "User"].includes(query.table)) {
        expect(query.operation).toBe("update");
        expect(query.params).toContain("Compte supprimé");
      }
      expect(["Post", "Comment", "Tierlist", "ba_user", "ba_account", "ba_session"]).not.toContain(
        query.table,
      );
    }
    const user = recorded.committed.find((query) => query.table === "User")!;
    expect(user.params).toContain(identity.discordId);
    expect(user.params).toContain(false);
    expect(
      user.params.some((value) => typeof value === "string" && value.startsWith("deleted:")),
    ).toBe(true);
    const preferences = recorded.committed.find((query) => query.table === "user_preferences")!;
    expect(preferences.params).toContain(`u:${identity.appUserId}`);
  }
});

test("an account with no business profile still loses its auth-linked event history", async () => {
  const recorded = recordingDatabase(drivers[0]!);
  await recorded.repository.purgeAccountData({ authUserId: identity.authUserId });
  expect(recorded.committed.map((query) => query.table)).toEqual(["site_events"]);
  expect(recorded.committed[0]?.params).toEqual([identity.authUserId]);
});

test("a write failure propagates to the transaction without scheduling later writes", async () => {
  const recorded = recordingDatabase(drivers[0]!, 2);
  await expect(recorded.repository.purgeAccountData(identity)).rejects.toThrow("write failed");
  expect(recorded.rolledBack).toBe(true);
  expect(recorded.committed).toEqual([]);
  expect(recorded.attempted).toHaveLength(3);
});
