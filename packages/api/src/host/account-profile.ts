// SPDX-License-Identifier: Apache-2.0
import type { BetterAuthOptions } from "better-auth";
import type { AccountProfile } from "@aphrody/shenron-db/repos/accounts";

export interface AccountProfileRepository {
  synchronize(authUserId: string): Promise<AccountProfile | null>;
}

/** Hooks run after Better Auth commits, so the repository sees the current DB profile. */
export function accountProfileHooks(repository: AccountProfileRepository) {
  return {
    user: {
      update: {
        after: async (user) => {
          await repository.synchronize(user.id);
        },
      },
    },
    account: {
      create: {
        after: async (account) => {
          if (account.providerId === "discord") await repository.synchronize(account.userId);
        },
      },
    },
  } satisfies NonNullable<BetterAuthOptions["databaseHooks"]>;
}
