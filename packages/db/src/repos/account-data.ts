// SPDX-License-Identifier: Apache-2.0
/** Account deletion data operations shared by Next and the Bun host. Runtime class: pure. */
import { and, eq, or } from "drizzle-orm";
import {
  baAccount,
  editorDrafts,
  siteEvents,
  siteRatings,
  siteReports,
  tierlistVotes,
  userPreferences,
  users,
  wikiContributions,
  wikiRevisions,
} from "../schema";
import type { ShenronPgDatabase } from "../types";

export interface AccountIdentity {
  authUserId: string;
  appUserId: string;
  discordId: string;
}
export type AccountDeletionIdentity = AccountIdentity | { authUserId: string };

// oxlint-disable-next-line no-explicit-any -- both Drizzle PostgreSQL drivers are supported
type AnyDb = ShenronPgDatabase<any>;

export function accountIdentityQuery(db: AnyDb, authUserId: string) {
  return db
    .select({ appUserId: users.id, discordId: users.discordId })
    .from(baAccount)
    .innerJoin(users, eq(users.discordId, baAccount.accountId))
    .where(and(eq(baAccount.userId, authUserId), eq(baAccount.providerId, "discord")))
    .limit(1);
}

export function createAccountDataRepository(db: AnyDb) {
  async function purgeAccountData(identity: AccountDeletionIdentity): Promise<void> {
    await db.transaction(async (tx) => {
      // Execute sequentially on the transaction connection; a failure rolls back the batch.
      await tx.delete(siteEvents).where(eq(siteEvents.userId, identity.authUserId));
      if (!("appUserId" in identity)) return;
      await tx
        .delete(userPreferences)
        .where(
          or(
            eq(userPreferences.userId, identity.appUserId),
            eq(userPreferences.identity, `u:${identity.appUserId}`),
          ),
        );
      await tx.delete(tierlistVotes).where(eq(tierlistVotes.userId, identity.appUserId));
      await tx.delete(siteRatings).where(eq(siteRatings.userId, identity.appUserId));
      await tx.delete(editorDrafts).where(eq(editorDrafts.userId, identity.appUserId));
      await tx
        .update(siteReports)
        .set({
          userId: null,
          discordId: null,
          username: "Compte supprimé",
          userAgent: null,
        })
        .where(eq(siteReports.userId, identity.appUserId));
      await tx
        .update(wikiContributions)
        .set({
          authorId: null,
          authorName: "Compte supprimé",
          authorDiscordId: null,
        })
        .where(eq(wikiContributions.authorId, identity.appUserId));
      await tx
        .update(wikiRevisions)
        .set({ editorId: null, editorName: "Compte supprimé" })
        .where(eq(wikiRevisions.editorId, identity.appUserId));

      await tx
        .update(users)
        .set({
          discordId: `deleted:${crypto.randomUUID()}`,
          username: "Compte supprimé",
          avatar: null,
          roleAdmin: false,
        })
        .where(and(eq(users.id, identity.appUserId), eq(users.discordId, identity.discordId)));
    });
  }

  return {
    async identityForAuthUser(authUserId: string): Promise<AccountIdentity | null> {
      const [linked] = await accountIdentityQuery(db, authUserId);
      return linked ? { authUserId, ...linked } : null;
    },
    purgeAccountData,
  };
}
