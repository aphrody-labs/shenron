// SPDX-License-Identifier: Apache-2.0
import { expect, mock, test } from "bun:test";

mock.module("server-only", () => ({}));

mock.module("@/lib/db", () => ({
  db: {
    select: () => {
      throw new Error("database unavailable");
    },
  },
}));

mock.module("@/db/schema", () => ({
  contributionRights: { data: "data", id: "id" },
}));

mock.module("drizzle-orm", () => ({ eq: () => ({}) }));

const { ContributionRightsUnavailableError, getContributionRights } =
  await import("../src/lib/contribution-rights");

test("une panne DB ne réouvre pas les contributions avec les droits par défaut", async () => {
  await expect(getContributionRights()).rejects.toBeInstanceOf(ContributionRightsUnavailableError);
});
