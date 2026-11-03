// SPDX-License-Identifier: Apache-2.0
import "server-only";
import { DEFAULT_PUBLIC_ORIGINS } from "@aphrody/shenron-config/public-urls";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { verifyAdminImage } from "@/lib/admin-image-verify";
import { recordRevisionStrict, type RevisionActor } from "@/lib/wiki-revisions";
import { wikiUpdateSnapshotHash } from "@/lib/wiki-update-precondition";
import {
  cardImageCompositeKey,
  cardImageImportRequest,
  type CardImageImportItem,
  type CardImageImportRequest,
} from "./card-image-contract";

export class CardImageImportError extends Error {
  constructor(
    readonly code:
      | "card_not_found"
      | "card_archived"
      | "image_unavailable"
      | "image_integrity_mismatch"
      | "preview_changed",
    readonly status: number,
  ) {
    super(code);
  }
}
const table = schema.cardCatalogCards;
const imageFields = [
  "frontImageUrl",
  "frontImageWidth",
  "frontImageHeight",
  "frontImageSourceUrl",
  "frontImageRights",
] as const;
type Card = typeof table.$inferSelect;
export const cardImageSnapshot = (
  row: Pick<CardImageImportItem, (typeof imageFields)[number]> | Card,
) => Object.fromEntries(imageFields.map((field) => [field, row[field]]));
const condition = (item: CardImageImportItem) =>
  and(
    eq(table.setId, item.setId),
    eq(table.cardNumber, item.cardNumber),
    eq(table.language, item.language),
    eq(table.region, item.region),
  );
const ordered = (items: CardImageImportItem[]) =>
  [...items].toSorted((a, b) =>
    cardImageCompositeKey(a).localeCompare(cardImageCompositeKey(b), "en"),
  );
export const cardImagePlanHash = (items: CardImageImportItem[]) =>
  wikiUpdateSnapshotHash({ schema: "shenron-card-images/v1", items: ordered(items) });

/** Read only owned public raster namespaces; historical UUIDs retain their original URL. */
export async function readCardImageAsset(
  item: {
    frontImageUrl: string;
    frontImageWidth: number | null;
    frontImageHeight: number | null;
    sha256?: string;
  },
  signal: AbortSignal,
) {
  let url: URL;
  try {
    url = new URL(item.frontImageUrl);
  } catch {
    throw new CardImageImportError("image_integrity_mismatch", 422);
  }
  const addressed =
    url.origin === DEFAULT_PUBLIC_ORIGINS.cdn &&
    /^\/publications\/[a-z0-9-]+\/objects\/([a-f0-9]{64})\.(?:png|jpe?g|webp|gif|avif)$/.exec(
      url.pathname,
    );
  const legacy =
    Object.values(DEFAULT_PUBLIC_ORIGINS).includes(
      url.origin as typeof DEFAULT_PUBLIC_ORIGINS.site,
    ) &&
    /^\/assets\/wiki\/(?:[a-z0-9-]{1,32}\/)?[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}\.(?:png|jpe?g|webp|gif|avif)$/.test(
      url.pathname,
    );
  if (
    url.href !== item.frontImageUrl ||
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    (!addressed && !legacy)
  )
    throw new CardImageImportError("image_integrity_mismatch", 422);
  let response: Response;
  try {
    response = await fetch(item.frontImageUrl, { cache: "no-store", redirect: "error", signal });
  } catch {
    throw new CardImageImportError("image_unavailable", 503);
  }
  if (!response.ok) {
    await response.body?.cancel();
    throw new CardImageImportError("image_unavailable", 503);
  }
  const limit = 16 * 1024 * 1024;
  if (!response.body || Number(response.headers.get("content-length")) > limit) {
    await response.body?.cancel();
    throw new CardImageImportError("image_integrity_mismatch", 422);
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > limit) throw new CardImageImportError("image_integrity_mismatch", 422);
      chunks.push(value);
    }
  } catch (error) {
    if (error instanceof CardImageImportError) throw error;
    throw new CardImageImportError("image_unavailable", 503);
  } finally {
    await reader.cancel().catch(() => {});
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  const sha256 = new Bun.CryptoHasher("sha256").update(bytes).digest("hex");
  const expectedSha256 = item.sha256 ?? (addressed ? addressed[1] : undefined);
  if (expectedSha256 && sha256 !== expectedSha256)
    throw new CardImageImportError("image_integrity_mismatch", 422);
  try {
    const dimensions = await verifyAdminImage(bytes);
    if (
      (item.frontImageWidth !== null && dimensions.width !== item.frontImageWidth) ||
      (item.frontImageHeight !== null && dimensions.height !== item.frontImageHeight)
    )
      throw new Error("Dimensions differ");
    return { sha256, ...dimensions };
  } catch {
    throw new CardImageImportError("image_integrity_mismatch", 422);
  }
}

export async function verifyCardImagePublications(
  items: CardImageImportItem[],
  signal?: AbortSignal,
) {
  const deadline = AbortSignal.timeout(45_000);
  const combined = signal ? AbortSignal.any([signal, deadline]) : deadline;
  const unique = [...new Map(items.map((item) => [item.frontImageUrl, item])).values()];
  // Dimensions and hash are per requested association even when artwork is shared.
  for (const item of items) {
    const shared = unique.find((candidate) => candidate.frontImageUrl === item.frontImageUrl)!;
    if (
      shared.sha256 !== item.sha256 ||
      shared.frontImageWidth !== item.frontImageWidth ||
      shared.frontImageHeight !== item.frontImageHeight
    )
      throw new CardImageImportError("image_integrity_mismatch", 422);
  }
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(4, unique.length) }, async () => {
      for (;;) {
        const item = unique[next++];
        if (!item) return;
        await readCardImageAsset(item, combined);
      }
    }),
  );
}

/** Image-only publication: row identity and journal belong to the existing card catalogue. */
export async function importCardImages(
  input: CardImageImportRequest,
  actor: RevisionActor,
  signal?: AbortSignal,
) {
  input = cardImageImportRequest.parse(input);
  const items = ordered(input.items);
  if (
    input.intent === "commit" &&
    (!input.planSha256 ||
      cardImagePlanHash(items) !== input.planSha256 ||
      items.some((item) => !item.expectedSha256))
  )
    throw new CardImageImportError("preview_changed", 409);
  await verifyCardImagePublications(items, signal);
  if (input.intent === "preview") {
    const previews = [];
    for (const item of items) {
      const [before] = await db.select().from(table).where(condition(item)).limit(1);
      if (!before) throw new CardImageImportError("card_not_found", 404);
      if (before.status === "archived") throw new CardImageImportError("card_archived", 409);
      const planned = { ...item, expectedSha256: wikiUpdateSnapshotHash(before) };
      previews.push({
        id: before.id,
        item: planned,
        before: cardImageSnapshot(before),
        after: cardImageSnapshot(item),
        changed:
          wikiUpdateSnapshotHash(cardImageSnapshot(before)) !==
          wikiUpdateSnapshotHash(cardImageSnapshot(item)),
      });
    }
    return {
      schema: "shenron-card-images/v1",
      intent: "preview" as const,
      lang: input.lang,
      planSha256: cardImagePlanHash(previews.map((preview) => preview.item)),
      items: previews,
    };
  }
  const result = await db.transaction(async (tx) => {
    const locked: { item: CardImageImportItem; before: Card }[] = [];
    // Every batch takes row locks in the same composite order, before any write.
    for (const item of items) {
      const [before] = await tx.select().from(table).where(condition(item)).limit(1).for("update");
      if (!before) throw new CardImageImportError("card_not_found", 404);
      if (before.status === "archived") throw new CardImageImportError("card_archived", 409);
      if (wikiUpdateSnapshotHash(before) !== item.expectedSha256)
        throw new CardImageImportError("preview_changed", 409);
      locked.push({ item, before });
    }
    const rows = [];
    for (const { item, before } of locked) {
      if (
        wikiUpdateSnapshotHash(cardImageSnapshot(before)) ===
        wikiUpdateSnapshotHash(cardImageSnapshot(item))
      ) {
        rows.push({
          id: before.id,
          changed: false,
          revisionId: null,
          image: cardImageSnapshot(before),
        });
        continue;
      }
      const [after] = await tx
        .update(table)
        .set({ ...cardImageSnapshot(item), updatedAt: new Date() })
        .where(eq(table.id, before.id))
        .returning();
      if (!after) throw new Error("Card update returned no row");
      const revisionId = await recordRevisionStrict(
        { table: "CardCatalogCard", id: before.id, action: "update", before, after, actor },
        tx,
      );
      rows.push({ id: after.id, changed: true, revisionId, image: cardImageSnapshot(after) });
    }
    return rows;
  });
  return {
    schema: "shenron-card-images/v1",
    intent: "commit" as const,
    lang: input.lang,
    planSha256: input.planSha256,
    updated: result.filter((row) => row.changed).length,
    skipped: result.filter((row) => !row.changed).length,
    items: result,
  };
}
