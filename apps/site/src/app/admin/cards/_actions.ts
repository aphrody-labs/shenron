"use server";

import { createId } from "@paralleldrive/cuid2";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db, schema } from "@/lib/db";
import { getCurrentUser, requireAdmin, revisionActorOf } from "@/lib/session";
import { recordRevisionStrict } from "@/lib/wiki-revisions";

type Kind = "series" | "set" | "card" | "valuation";
type Status = (typeof schema.CARD_CATALOG_STATUSES)[number];
const text = (form: FormData, key: string) => String(form.get(key) ?? "").trim();
const optional = (form: FormData, key: string) => text(form, key) || null;
function required(form: FormData, key: string) {
  const result = text(form, key);
  if (!result) throw new Error(`Missing ${key}`);
  return result;
}
function url(input: string | null, allowEmpty = false) {
  if (!input && allowEmpty) return null;
  if (!input) throw new Error("URL required");
  const parsed = new URL(input);
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") throw new Error("Invalid URL");
  return parsed.toString();
}
function date(input: string | null, allowEmpty = false) {
  if (!input && allowEmpty) return null;
  if (!input || !/^\d{4}-\d{2}-\d{2}$/.test(input)) throw new Error("Invalid date");
  const parsed = new Date(`${input}T00:00:00.000Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== input)
    throw new Error("Invalid date");
  return input;
}
function status(input: string): Status {
  if ((schema.CARD_CATALOG_STATUSES as readonly string[]).includes(input)) return input as Status;
  throw new Error("Invalid publication status");
}
function slugify(input: string) {
  return input
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .toLowerCase()
    .replace(/^-+|-+$/g, "");
}
function slug(form: FormData, base: string, id: string, existing?: string) {
  const supplied = optional(form, "slug");
  if (!supplied && existing) return existing;
  const value = slugify(supplied ?? base);
  if (!value) throw new Error("Invalid slug");
  const suffix = `-${id.slice(0, 6)}`;
  return value.endsWith(suffix) ? value : `${value}${suffix}`;
}
function amount(input: string) {
  if (!/^\d{1,12}(?:[.,]\d{1,4})?$/.test(input)) throw new Error("Invalid amount");
  return input.replace(",", ".");
}
function imageDimension(form: FormData, key: string) {
  const input = optional(form, key);
  if (!input) return null;
  if (!/^\d{1,5}$/.test(input)) throw new Error(`Invalid ${key}`);
  const value = Number(input);
  if (!Number.isInteger(value) || value < 1 || value > 10000) throw new Error(`Invalid ${key}`);
  return value;
}

export async function saveCardCatalogEntry(form: FormData) {
  await requireAdmin();
  const kind = text(form, "kind") as Kind;
  if (!["series", "set", "card", "valuation"].includes(kind))
    redirect("/admin/cards?status=invalid");
  const suppliedId = text(form, "id");
  const id = suppliedId || createId();
  const actor = revisionActorOf(await getCurrentUser());

  try {
    await db.transaction(async (tx) => {
      if (kind === "series") {
        const [before] = suppliedId
          ? await tx
              .select()
              .from(schema.cardCatalogSeries)
              .where(eq(schema.cardCatalogSeries.id, id))
              .limit(1)
          : [];
        if (suppliedId && !before) throw new Error("Series not found");
        const fields = {
          slug: slug(form, required(form, "name"), id, before?.slug),
          name: required(form, "name"),
          publisher: required(form, "publisher"),
          format: required(form, "format"),
          language: required(form, "language"),
          region: required(form, "region"),
          description: optional(form, "description"),
          sourceLabel: required(form, "sourceLabel"),
          sourceUrl: url(required(form, "sourceUrl"))!,
          sourceAccessedAt: date(required(form, "sourceAccessedAt"))!,
          status: status(text(form, "status")),
          updatedAt: new Date(),
        };
        const [after] = before
          ? await tx
              .update(schema.cardCatalogSeries)
              .set(fields)
              .where(eq(schema.cardCatalogSeries.id, id))
              .returning()
          : await tx
              .insert(schema.cardCatalogSeries)
              .values({ id, ...fields })
              .returning();
        await recordRevisionStrict(
          {
            table: "CardCatalogSeries",
            id,
            action: before ? "update" : "create",
            before,
            after,
            actor,
          },
          tx,
        );
      } else if (kind === "set") {
        const [before] = suppliedId
          ? await tx
              .select()
              .from(schema.cardCatalogSets)
              .where(eq(schema.cardCatalogSets.id, id))
              .limit(1)
          : [];
        if (suppliedId && !before) throw new Error("Set not found");
        const seriesId = required(form, "seriesId");
        const [series] = await tx
          .select()
          .from(schema.cardCatalogSeries)
          .where(eq(schema.cardCatalogSeries.id, seriesId))
          .limit(1);
        if (!series || (series.status === "archived" && before?.seriesId !== seriesId))
          throw new Error("Parent series not found");
        const nextStatus = status(text(form, "status"));
        const retainingPublishedSet =
          before?.seriesId === seriesId &&
          before.status === "published" &&
          series.status === "archived";
        if (nextStatus === "published" && series.status !== "published" && !retainingPublishedSet)
          throw new Error("Publish series first");
        const releaseDate = date(optional(form, "releaseDate"), true);
        const precision = optional(form, "releaseDatePrecision");
        if (
          Boolean(releaseDate) !== Boolean(precision) ||
          (precision && !["day", "month", "year", "approximate"].includes(precision))
        )
          throw new Error("Invalid date precision");
        const fields = {
          seriesId,
          slug: slug(form, required(form, "name"), id, before?.slug),
          name: required(form, "name"),
          productCode: optional(form, "productCode"),
          language: required(form, "language"),
          region: required(form, "region"),
          releaseDate,
          releaseDatePrecision: precision,
          description: optional(form, "description"),
          sourceLabel: required(form, "sourceLabel"),
          sourceUrl: url(required(form, "sourceUrl"))!,
          sourceAccessedAt: date(required(form, "sourceAccessedAt"))!,
          status: nextStatus,
          updatedAt: new Date(),
        };
        const [after] = before
          ? await tx
              .update(schema.cardCatalogSets)
              .set(fields)
              .where(eq(schema.cardCatalogSets.id, id))
              .returning()
          : await tx
              .insert(schema.cardCatalogSets)
              .values({ id, ...fields })
              .returning();
        await recordRevisionStrict(
          {
            table: "CardCatalogSet",
            id,
            action: before ? "update" : "create",
            before,
            after,
            actor,
          },
          tx,
        );
      } else if (kind === "card") {
        const [before] = suppliedId
          ? await tx
              .select()
              .from(schema.cardCatalogCards)
              .where(eq(schema.cardCatalogCards.id, id))
              .limit(1)
          : [];
        if (suppliedId && !before) throw new Error("Card not found");
        const setId = required(form, "setId");
        const [parent] = await tx
          .select({ set: schema.cardCatalogSets, seriesStatus: schema.cardCatalogSeries.status })
          .from(schema.cardCatalogSets)
          .innerJoin(
            schema.cardCatalogSeries,
            eq(schema.cardCatalogSets.seriesId, schema.cardCatalogSeries.id),
          )
          .where(eq(schema.cardCatalogSets.id, setId))
          .limit(1);
        if (
          !parent ||
          ((parent.set.status === "archived" || parent.seriesStatus === "archived") &&
            before?.setId !== setId)
        )
          throw new Error("Parent set not found");
        const nextStatus = status(text(form, "status"));
        const retainingPublishedCard =
          before?.setId === setId &&
          before.status === "published" &&
          (parent.set.status === "archived" || parent.seriesStatus === "archived");
        if (
          nextStatus === "published" &&
          (parent.set.status !== "published" || parent.seriesStatus !== "published") &&
          !retainingPublishedCard
        )
          throw new Error("Publish series and set first");
        const frontImageUrl = url(optional(form, "frontImageUrl"), true);
        const frontImageWidth = imageDimension(form, "frontImageWidth");
        const frontImageHeight = imageDimension(form, "frontImageHeight");
        const frontImageSourceUrl = url(optional(form, "frontImageSourceUrl"), true);
        const frontImageRights = optional(form, "frontImageRights");
        if (
          Boolean(frontImageWidth) !== Boolean(frontImageHeight) ||
          (!frontImageUrl && (frontImageWidth || frontImageHeight))
        )
          throw new Error("Front image dimensions must match the image");
        const backImageUrl = url(optional(form, "backImageUrl"), true);
        const backImageSourceUrl = url(optional(form, "backImageSourceUrl"), true);
        const backImageRights = optional(form, "backImageRights");
        if (
          frontImageUrl
            ? !frontImageSourceUrl || !frontImageRights
            : frontImageSourceUrl || frontImageRights
        )
          throw new Error("Front image provenance required");
        if (
          backImageUrl
            ? !backImageSourceUrl || !backImageRights
            : backImageSourceUrl || backImageRights
        )
          throw new Error("Back image provenance required");
        const cardNumber = required(form, "cardNumber");
        const name = required(form, "name");
        const language = required(form, "language");
        const fields = {
          setId,
          slug: slug(form, `${cardNumber}-${name}`, id, before?.slug),
          name,
          nameJa: optional(form, "nameJa"),
          nameFr: optional(form, "nameFr"),
          cardNumber,
          language,
          region: required(form, "region"),
          rarity: optional(form, "rarity"),
          releaseDate: date(optional(form, "releaseDate"), true),
          description: optional(form, "description"),
          frontImageUrl,
          frontImageWidth,
          frontImageHeight,
          frontImageSourceUrl,
          frontImageRights,
          backImageUrl,
          backImageSourceUrl,
          backImageRights,
          sourceLabel: required(form, "sourceLabel"),
          sourceUrl: url(required(form, "sourceUrl"))!,
          sourceAccessedAt: date(required(form, "sourceAccessedAt"))!,
          status: nextStatus,
          updatedAt: new Date(),
        };
        const [after] = before
          ? await tx
              .update(schema.cardCatalogCards)
              .set(fields)
              .where(eq(schema.cardCatalogCards.id, id))
              .returning()
          : await tx
              .insert(schema.cardCatalogCards)
              .values({ id, ...fields })
              .returning();
        await recordRevisionStrict(
          {
            table: "CardCatalogCard",
            id,
            action: before ? "update" : "create",
            before,
            after,
            actor,
          },
          tx,
        );
      } else {
        const [before] = suppliedId
          ? await tx
              .select()
              .from(schema.cardCatalogValuations)
              .where(eq(schema.cardCatalogValuations.id, id))
              .limit(1)
          : [];
        if (suppliedId && !before) throw new Error("Valuation not found");
        const cardId = required(form, "cardId");
        const [card] = await tx
          .select()
          .from(schema.cardCatalogCards)
          .where(eq(schema.cardCatalogCards.id, cardId))
          .limit(1);
        if (!card || (card.status === "archived" && before?.cardId !== cardId))
          throw new Error("Card not found");
        const valueMin = amount(required(form, "valueMin"));
        const valueMax = amount(required(form, "valueMax"));
        if (Number(valueMax) < Number(valueMin)) throw new Error("Invalid range");
        const currency = required(form, "currency").toUpperCase();
        if (!/^[A-Z]{3}$/.test(currency)) throw new Error("Invalid currency");
        const fields = {
          cardId,
          valueMin,
          valueMax,
          currency,
          condition: required(form, "condition"),
          observedAt: date(required(form, "observedAt"))!,
          sourceLabel: required(form, "sourceLabel"),
          sourceUrl: url(required(form, "sourceUrl"))!,
          updatedAt: new Date(),
        };
        const [after] = before
          ? await tx
              .update(schema.cardCatalogValuations)
              .set(fields)
              .where(eq(schema.cardCatalogValuations.id, id))
              .returning()
          : await tx
              .insert(schema.cardCatalogValuations)
              .values({ id, ...fields })
              .returning();
        await recordRevisionStrict(
          {
            table: "CardCatalogValuation",
            id,
            action: before ? "update" : "create",
            before,
            after,
            actor,
          },
          tx,
        );
      }
    });
  } catch {
    redirect("/admin/cards?status=invalid");
  }
  revalidatePath("/admin/cards");
  revalidatePath("/wiki/cards");
  revalidatePath("/wiki/cards/[slug]", "page");
  redirect("/admin/cards?status=saved");
}

export async function archiveCardCatalogEntry(form: FormData) {
  await requireAdmin();
  const kind = text(form, "kind") as Exclude<Kind, "valuation">;
  const id = required(form, "id");
  const actor = revisionActorOf(await getCurrentUser());
  await db.transaction(async (tx) => {
    if (kind === "series") {
      const [before] = await tx
        .select()
        .from(schema.cardCatalogSeries)
        .where(eq(schema.cardCatalogSeries.id, id))
        .limit(1);
      if (!before || before.status === "archived") return;
      const [after] = await tx
        .update(schema.cardCatalogSeries)
        .set({ status: "archived", updatedAt: new Date() })
        .where(eq(schema.cardCatalogSeries.id, id))
        .returning();
      await recordRevisionStrict(
        { table: "CardCatalogSeries", id, action: "visibility", before, after, actor },
        tx,
      );
    } else if (kind === "set") {
      const [before] = await tx
        .select()
        .from(schema.cardCatalogSets)
        .where(eq(schema.cardCatalogSets.id, id))
        .limit(1);
      if (!before || before.status === "archived") return;
      const [after] = await tx
        .update(schema.cardCatalogSets)
        .set({ status: "archived", updatedAt: new Date() })
        .where(eq(schema.cardCatalogSets.id, id))
        .returning();
      await recordRevisionStrict(
        { table: "CardCatalogSet", id, action: "visibility", before, after, actor },
        tx,
      );
    } else if (kind === "card") {
      const [before] = await tx
        .select()
        .from(schema.cardCatalogCards)
        .where(eq(schema.cardCatalogCards.id, id))
        .limit(1);
      if (!before || before.status === "archived") return;
      const [after] = await tx
        .update(schema.cardCatalogCards)
        .set({ status: "archived", updatedAt: new Date() })
        .where(eq(schema.cardCatalogCards.id, id))
        .returning();
      await recordRevisionStrict(
        { table: "CardCatalogCard", id, action: "visibility", before, after, actor },
        tx,
      );
    } else throw new Error("Invalid archive kind");
  });
  revalidatePath("/admin/cards");
  revalidatePath("/wiki/cards");
  revalidatePath("/wiki/cards/[slug]", "page");
  redirect("/admin/cards?status=saved");
}
