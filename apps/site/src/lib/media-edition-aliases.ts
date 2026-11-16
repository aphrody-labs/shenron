// SPDX-License-Identifier: Apache-2.0
import { eq } from "drizzle-orm";
import { botMediaEditionAliases } from "@shenron/db/bot-schema";
import { db } from "@/lib/db";

type CatalogTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Missing aliases preserve the requested identity; SQL forbids alias chains. */
export async function resolveMediaEditionId(
  client: Pick<CatalogTransaction, "select">,
  requestedId: number,
): Promise<number> {
  const [alias] = await client
    .select({ canonicalId: botMediaEditionAliases.canonicalId })
    .from(botMediaEditionAliases)
    .where(eq(botMediaEditionAliases.aliasId, requestedId))
    .limit(1);
  return alias ? Number(alias.canonicalId) : requestedId;
}
