// SPDX-License-Identifier: Apache-2.0
import { expect, test } from "bun:test";
import { createBunDb } from "../src/bun-sql";
import { createAccountProfileRepository } from "../src/repos/accounts";

const url = process.env.SHENRON_PROFILE_PG_URL;

test.skipIf(!url)(
  "isolated PostgreSQL: profile repair, concurrency, rights and rollback",
  async () => {
    const target = new URL(url!);
    // This destructive fixture must never run against a product database.
    if (
      !["127.0.0.1", "localhost"].includes(target.hostname) ||
      target.pathname !== "/shenron_profile_fixture"
    )
      throw new Error("Isolated fixture URL required");
    const { db, client } = createBunDb({
      url: url!,
      max: 4,
      applicationName: "shenron-profile-fixture",
    });
    try {
      await client.unsafe(`create table ba_user (
      id text primary key, name text not null, image text);
      create table ba_account (
      id text primary key, "userId" text not null references ba_user(id),
      "providerId" text not null, "accountId" text not null);
      create table "User" (
      id text primary key, "discordId" text not null unique, username text not null,
      avatar text, "roleAdmin" boolean not null default false,
      "createdAt" timestamp not null default current_timestamp,
      check (username <> 'Invalid fixture'));`);
      await client.unsafe("insert into ba_user (id, name) values ($1, $2)", ["auth-1", "Goku"]);
      const repository = createAccountProfileRepository(db, () => false);
      expect(await repository.synchronize("auth-1")).toBeNull();
      await client.unsafe(
        'insert into ba_account (id, "userId", "providerId", "accountId") values ($1, $2, $3, $4)',
        ["account-1", "auth-1", "discord", "123456789012345678"],
      );
      const first = await repository.synchronize("auth-1");
      expect(first?.username).toBe("Goku");
      expect(first?.roleAdmin).toBe(false);
      const repeats = await Promise.all(
        Array.from({ length: 8 }, () => repository.synchronize("auth-1")),
      );
      expect(repeats.every((profile) => profile?.id === first?.id)).toBe(true);
      const count = await client.unsafe('select count(*)::int as count from "User"');
      expect(count[0]?.count).toBe(1);

      await client.unsafe('update "User" set "roleAdmin" = true where id = $1', [first!.id]);
      let release!: () => void;
      let acquired!: () => void;
      const hold = new Promise<void>((resolve) => {
        release = resolve;
      });
      const locked = new Promise<void>((resolve) => {
        acquired = resolve;
      });
      const writer = client.begin(async (tx) => {
        await tx.unsafe("update ba_user set name = $1, image = $2 where id = $3", [
          "Trunks",
          "https://example.test/trunks.png",
          "auth-1",
        ]);
        acquired();
        await hold;
      });
      await locked;
      const pending = repository.synchronize("auth-1");
      let waited = false;
      try {
        for (let attempt = 0; attempt < 100; attempt++) {
          const locks = await client.unsafe(`select 1 from pg_stat_activity where
          application_name = 'shenron-profile-fixture' and wait_event_type = 'Lock'
          and query like '%ba_user%'`);
          if (locks.length) {
            waited = true;
            break;
          }
          await Bun.sleep(5);
        }
      } finally {
        release();
      }
      await writer;
      const repaired = await pending;
      expect(waited).toBe(true);
      expect(repaired).toMatchObject({
        id: first!.id,
        username: "Trunks",
        avatar: "https://example.test/trunks.png",
        roleAdmin: true,
        createdAt: first!.createdAt,
      });

      await client.unsafe("update ba_user set name = 'Invalid fixture' where id = 'auth-1'");
      await expect(repository.synchronize("auth-1")).rejects.toThrow();
      const unchanged = await client.unsafe('select username from "User" where id = $1', [
        first!.id,
      ]);
      expect(unchanged[0]?.username).toBe("Trunks");
      await client.unsafe("update ba_user set name = 'Vegeta' where id = 'auth-1'");
      expect((await repository.synchronize("auth-1"))?.username).toBe("Vegeta");
    } finally {
      await client.unsafe('drop table if exists "User", ba_account, ba_user');
      await client.close();
    }
  },
  10_000,
);
