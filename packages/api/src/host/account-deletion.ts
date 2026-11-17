// SPDX-License-Identifier: Apache-2.0
import type { BetterAuthOptions } from "better-auth";
import type { AccountDeletionIdentity, AccountIdentity } from "@aphrody/shenron-db/repos/accounts";

interface AccountDeletionRepository {
  identityForAuthUser(authUserId: string): Promise<AccountIdentity | null>;
  purgeAccountData(identity: AccountDeletionIdentity): Promise<void>;
}

/** Preserve the linked identity across the Better Auth cascade, scoped to the deletion request. */
export function buildAccountDeletionHooks(repository: AccountDeletionRepository) {
  const pending = new WeakMap<object, AccountDeletionIdentity>();
  return {
    enabled: true,
    async beforeDelete(user, request?: Request) {
      const key = request ?? user;
      pending.delete(key);
      const linked = await repository.identityForAuthUser(user.id);
      pending.set(key, linked ?? { authUserId: user.id });
    },
    async afterDelete(user, request?: Request) {
      const key = request ?? user;
      const identity = pending.get(key);
      if (!identity || identity.authUserId !== user.id) return;
      await repository.purgeAccountData(identity);
      pending.delete(key);
    },
  } satisfies NonNullable<NonNullable<BetterAuthOptions["user"]>["deleteUser"]>;
}
