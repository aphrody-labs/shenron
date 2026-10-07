// SPDX-License-Identifier: Apache-2.0
import { and, eq, sql } from "drizzle-orm";
import { baAccount, baUser, users } from "../schema";
import type { ShenronPgDatabase } from "../types";

// oxlint-disable-next-line no-explicit-any -- repositories accept either PostgreSQL driver
type AnyDb = ShenronPgDatabase<any>;

export type AccountProfile = typeof users.$inferSelect;

/** Read the authoritative auth profile, never the signed session cookie's snapshot. */
export function accountProfileQuery(db: AnyDb, authUserId: string) {
  return (
    db
      .select({
        discordId: baAccount.accountId,
        name: baUser.name,
        image: baUser.image,
        profile: users,
      })
      .from(baUser)
      .innerJoin(baAccount, eq(baAccount.userId, baUser.id))
      .leftJoin(users, eq(users.discordId, baAccount.accountId))
      .where(and(eq(baUser.id, authUserId), eq(baAccount.providerId, "discord")))
      .limit(1)
      // Serialize with profile updates and deletion; do not lock the nullable outer join.
      .for("update", { of: baUser })
  );
}

export function accountProfileUpsert(
  db: AnyDb,
  input: {
    discordId: string;
    name: string;
    image: string | null;
    staff: boolean;
  },
) {
  return db
    .insert(users)
    .values({
      discordId: input.discordId,
      username: input.name,
      avatar: input.image,
      roleAdmin: input.staff,
    })
    .onConflictDoUpdate({
      target: users.discordId,
      set: {
        username: input.name,
        avatar: input.image,
        // Preserve manually granted rights, including a concurrent admin change.
        roleAdmin: sql`${users.roleAdmin} or ${input.staff}`,
      },
    })
    .returning();
}

export function createAccountProfileRepository(db: AnyDb, isStaff: (discordId: string) => boolean) {
  return {
    async synchronize(authUserId: string): Promise<AccountProfile | null> {
      return db.transaction(async (tx) => {
        const [linked] = await accountProfileQuery(tx, authUserId);
        if (!linked) return null;
        const staff = isStaff(linked.discordId);
        const profile = linked.profile;
        if (
          profile &&
          profile.username === linked.name &&
          profile.avatar === linked.image &&
          (!staff || profile.roleAdmin)
        )
          return profile;
        const [updated] = await accountProfileUpsert(tx, { ...linked, staff });
        if (!updated) throw new Error("Account profile synchronization returned no row");
        return updated;
      });
    },
  };
}
