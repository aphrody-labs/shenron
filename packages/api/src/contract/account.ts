// SPDX-License-Identifier: Apache-2.0
import { z } from "zod";

/** Public business profile of the authenticated reader; no auth tokens or emails. */
export const AccountSessionProfile = z.object({
  id: z.string(),
  discordId: z.string(),
  username: z.string(),
  avatar: z.string().nullable(),
  roleAdmin: z.boolean(),
  createdAt: z.iso.datetime(),
});
export type AccountSessionProfile = z.infer<typeof AccountSessionProfile>;

export const AccountSessionResponse = z
  .object({
    sessionUserId: z.string(),
    discordId: z.string(),
    user: AccountSessionProfile.nullable(),
  })
  .nullable()
  .meta({ id: "AccountSessionResponse" });
