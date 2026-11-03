// SPDX-License-Identifier: Apache-2.0
import "server-only";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/lib/db";
import { wikiRevisions } from "@/db/schema";
import { recordRevisionStrict, type RevisionActor } from "@/lib/wiki-revisions";
import { wikiUpdateSnapshotHash as hash } from "@/lib/wiki-update-precondition";
import {
  cardImageCompositeKey,
  cardImageRestoreRequest,
  type CardImageRestoreRequest,
} from "./card-image-contract";
import { CardImageImportError, cardImageSnapshot, readCardImageAsset } from "./card-image-import";

const table = schema.cardCatalogCards;
type Card = typeof table.$inferSelect;
const historicalImage = z.object({
  frontImageUrl: z.string().max(2048).nullable(),
  frontImageWidth: z.number().int().positive().max(10000).nullable(),
  frontImageHeight: z.number().int().positive().max(10000).nullable(),
  frontImageSourceUrl: z.string().max(2048).nullable(),
  frontImageRights: z.string().max(500).nullable(),
});
const identity = z.object({
  setId: z.string(),
  cardNumber: z.string(),
  language: z.string(),
  region: z.string(),
});
const fields = [
  "frontImageUrl",
  "frontImageWidth",
  "frontImageHeight",
  "frontImageSourceUrl",
  "frontImageRights",
] as const;
type Item = CardImageRestoreRequest["items"][number];
const ordered = (items: Item[]) =>
  [...items].toSorted((a, b) => a.revisionId.localeCompare(b.revisionId, "en"));
export const cardImageRestorePlanHash = (items: Item[]) =>
  hash({ schema: "shenron-card-image-restore/v1", items: ordered(items) });
const conflict = () => new CardImageImportError("preview_changed", 409);

async function readTargets(client: Pick<typeof db, "select">, items: Item[]) {
  const targets = [];
  for (const item of items) {
    const [revision] = await client
      .select()
      .from(wikiRevisions)
      .where(eq(wikiRevisions.id, item.revisionId))
      .limit(1);
    if (
      !revision ||
      revision.tableName !== "CardCatalogCard" ||
      !["update", "revert"].includes(revision.action) ||
      !revision.before ||
      !revision.after
    )
      throw conflict();
    const beforeImage = historicalImage.safeParse(
      Object.fromEntries(fields.map((field) => [field, revision.before![field]])),
    );
    const afterImage = historicalImage.safeParse(
      Object.fromEntries(fields.map((field) => [field, revision.after![field]])),
    );
    const beforeIdentity = identity.safeParse(revision.before);
    const afterIdentity = identity.safeParse(revision.after);
    if (
      !beforeImage.success ||
      !afterImage.success ||
      !beforeIdentity.success ||
      !afterIdentity.success ||
      cardImageCompositeKey(beforeIdentity.data) !== cardImageCompositeKey(afterIdentity.data)
    )
      throw conflict();
    targets.push({
      item,
      id: revision.rowId,
      identity: afterIdentity.data,
      before: beforeImage.data,
      after: afterImage.data,
    });
  }
  if (new Set(targets.map((target) => target.id)).size !== targets.length) throw conflict();
  return targets.toSorted((a, b) =>
    cardImageCompositeKey(a.identity).localeCompare(cardImageCompositeKey(b.identity), "en"),
  );
}

function assertCurrent(
  card: Card | undefined,
  target: Awaited<ReturnType<typeof readTargets>>[number],
) {
  if (
    !card ||
    card.status === "archived" ||
    cardImageCompositeKey(card) !== cardImageCompositeKey(target.identity) ||
    hash(cardImageSnapshot(card)) !== hash(target.after)
  )
    throw conflict();
}

/** Restore only persisted image history; nullable original images need no network fetch. */
export async function restoreCardImages(
  input: CardImageRestoreRequest,
  actor: RevisionActor,
  signal?: AbortSignal,
) {
  input = cardImageRestoreRequest.parse(input);
  if (
    input.intent === "restore-commit" &&
    cardImageRestorePlanHash(input.items) !== input.planSha256
  )
    throw conflict();
  const targets = await readTargets(db, input.items);
  const assetHashes = new Map<string, string>();
  const deadline = AbortSignal.timeout(45_000);
  const combined = signal ? AbortSignal.any([signal, deadline]) : deadline;
  for (const target of targets) {
    if (target.before.frontImageUrl === null) {
      if (fields.some((field) => target.before[field] !== null)) throw conflict();
      continue;
    }
    if (target.before.frontImageSourceUrl !== null) {
      let source: URL;
      try {
        source = new URL(target.before.frontImageSourceUrl);
      } catch {
        throw conflict();
      }
      if (
        source.protocol !== "https:" ||
        source.username ||
        source.password ||
        /(?:^|\.)(?:fandom|wikia)\.com$/.test(source.hostname)
      )
        throw conflict();
    }
    const asset = await readCardImageAsset(
      { ...target.before, frontImageUrl: target.before.frontImageUrl },
      combined,
    );
    if (input.intent === "restore-commit" && target.item.assetSha256 !== asset.sha256)
      throw conflict();
    assetHashes.set(target.id, asset.sha256);
  }
  if (input.intent === "restore-preview") {
    const items = [];
    for (const target of targets) {
      const [card] = await db.select().from(table).where(eq(table.id, target.id)).limit(1);
      assertCurrent(card, target);
      items.push({
        id: target.id,
        identity: target.identity,
        item: {
          ...target.item,
          expectedSha256: hash(card!),
          ...(assetHashes.has(target.id) ? { assetSha256: assetHashes.get(target.id)! } : {}),
        },
        before: target.after,
        after: target.before,
      });
    }
    return {
      schema: "shenron-card-image-restore/v1",
      intent: "restore-preview" as const,
      lang: input.lang,
      planSha256: cardImageRestorePlanHash(items.map((item) => item.item)),
      items,
    };
  }
  const rows = await db.transaction(async (tx) => {
    const currentTargets = await readTargets(tx, input.items);
    if (hash({ targets: currentTargets }) !== hash({ targets })) throw conflict();
    const locked = [];
    for (const target of currentTargets) {
      const [card] = await tx
        .select()
        .from(table)
        .where(eq(table.id, target.id))
        .limit(1)
        .for("update");
      assertCurrent(card, target);
      if (hash(card!) !== target.item.expectedSha256) throw conflict();
      locked.push({ target, card: card! });
    }
    const restored = [];
    for (const { target, card } of locked) {
      const [after] = await tx
        .update(table)
        .set({ ...target.before, updatedAt: new Date() })
        .where(eq(table.id, target.id))
        .returning();
      if (!after) throw new Error("Historical card restoration returned no row");
      const revisionId = await recordRevisionStrict(
        { table: "CardCatalogCard", id: target.id, action: "revert", before: card, after, actor },
        tx,
      );
      restored.push({
        id: target.id,
        restoredRevisionId: target.item.revisionId,
        revisionId,
        image: cardImageSnapshot(after),
      });
    }
    return restored;
  });
  return {
    schema: "shenron-card-image-restore/v1",
    intent: "restore-commit" as const,
    lang: input.lang,
    planSha256: input.planSha256,
    restored: rows.length,
    items: rows,
  };
}
