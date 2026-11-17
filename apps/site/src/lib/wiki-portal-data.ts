// SPDX-License-Identifier: Apache-2.0
import "server-only";
import { asc, eq, sql } from "drizzle-orm";
import { botBattles } from "@aphrody/shenron-db/bot-schema";
import { db } from "./db";

/** One server-loader clock sample is serialized with the ISR catalogue, never read at hydration. */
export async function getWikiPortalRenderTime() {
  return Date.now();
}

/** Bounded portal projection of the existing public battle artwork column. */
export async function getWikiPortalBattleArtwork() {
  return db
    .select({
      id: botBattles.id,
      slug: botBattles.slug,
      title: botBattles.title,
      image: sql<string | null>`image`,
    })
    .from(botBattles)
    .where(eq(botBattles.visible, true))
    .orderBy(asc(botBattles.id))
    .limit(24);
}
