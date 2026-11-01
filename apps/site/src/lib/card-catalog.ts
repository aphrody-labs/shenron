import "server-only";

import { and, asc, count, desc, eq, gt, ilike, inArray, or } from "drizzle-orm";
import { cache } from "react";
import { db, schema } from "@/lib/db";

export const CARD_CATALOG_ADMIN_PAGE_SIZE = 50;

const publishedCatalogWhere = and(
  eq(schema.cardCatalogCards.status, "published"),
  eq(schema.cardCatalogSets.status, "published"),
  eq(schema.cardCatalogSeries.status, "published"),
);

export const getPublishedCardCount = cache(async (): Promise<number> => {
  const [row] = await db
    .select({ value: count() })
    .from(schema.cardCatalogCards)
    .innerJoin(schema.cardCatalogSets, eq(schema.cardCatalogCards.setId, schema.cardCatalogSets.id))
    .innerJoin(
      schema.cardCatalogSeries,
      eq(schema.cardCatalogSets.seriesId, schema.cardCatalogSeries.id),
    )
    .where(publishedCatalogWhere);
  return Number(row?.value ?? 0);
});

export async function getPublicCardCatalog(
  filters: {
    search?: string;
    seriesId?: string;
    language?: string;
    region?: string;
  } = {},
) {
  const conditions = [publishedCatalogWhere];
  if (filters.seriesId) conditions.push(eq(schema.cardCatalogSeries.id, filters.seriesId));
  if (filters.language) conditions.push(eq(schema.cardCatalogCards.language, filters.language));
  if (filters.region) conditions.push(eq(schema.cardCatalogCards.region, filters.region));
  const term = filters.search?.trim().slice(0, 80);
  if (term) {
    const pattern = `%${term.replace(/[\\%_]/g, (part) => `\\${part}`)}%`;
    conditions.push(
      or(
        ilike(schema.cardCatalogCards.name, pattern),
        ilike(schema.cardCatalogCards.cardNumber, pattern),
        ilike(schema.cardCatalogSets.name, pattern),
        ilike(schema.cardCatalogSeries.name, pattern),
      )!,
    );
  }

  const [rows, totalRows] = await Promise.all([
    db
      .select({
        card: schema.cardCatalogCards,
        set: schema.cardCatalogSets,
        series: schema.cardCatalogSeries,
      })
      .from(schema.cardCatalogCards)
      .innerJoin(
        schema.cardCatalogSets,
        eq(schema.cardCatalogCards.setId, schema.cardCatalogSets.id),
      )
      .innerJoin(
        schema.cardCatalogSeries,
        eq(schema.cardCatalogSets.seriesId, schema.cardCatalogSeries.id),
      )
      .where(and(...conditions))
      .orderBy(asc(schema.cardCatalogCards.slug)),
    db
      .select({ value: count() })
      .from(schema.cardCatalogCards)
      .innerJoin(
        schema.cardCatalogSets,
        eq(schema.cardCatalogCards.setId, schema.cardCatalogSets.id),
      )
      .innerJoin(
        schema.cardCatalogSeries,
        eq(schema.cardCatalogSets.seriesId, schema.cardCatalogSeries.id),
      )
      .where(and(...conditions)),
  ]);

  const visibleRows = rows;
  const [series, languages, regions] = await Promise.all([
    db
      .selectDistinct({ id: schema.cardCatalogSeries.id, name: schema.cardCatalogSeries.name })
      .from(schema.cardCatalogCards)
      .innerJoin(
        schema.cardCatalogSets,
        eq(schema.cardCatalogCards.setId, schema.cardCatalogSets.id),
      )
      .innerJoin(
        schema.cardCatalogSeries,
        eq(schema.cardCatalogSets.seriesId, schema.cardCatalogSeries.id),
      )
      .where(publishedCatalogWhere)
      .orderBy(asc(schema.cardCatalogSeries.name)),
    db
      .selectDistinct({ value: schema.cardCatalogCards.language })
      .from(schema.cardCatalogCards)
      .innerJoin(
        schema.cardCatalogSets,
        eq(schema.cardCatalogCards.setId, schema.cardCatalogSets.id),
      )
      .innerJoin(
        schema.cardCatalogSeries,
        eq(schema.cardCatalogSets.seriesId, schema.cardCatalogSeries.id),
      )
      .where(publishedCatalogWhere)
      .orderBy(asc(schema.cardCatalogCards.language)),
    db
      .selectDistinct({ value: schema.cardCatalogCards.region })
      .from(schema.cardCatalogCards)
      .innerJoin(
        schema.cardCatalogSets,
        eq(schema.cardCatalogCards.setId, schema.cardCatalogSets.id),
      )
      .innerJoin(
        schema.cardCatalogSeries,
        eq(schema.cardCatalogSets.seriesId, schema.cardCatalogSeries.id),
      )
      .where(publishedCatalogWhere)
      .orderBy(asc(schema.cardCatalogCards.region)),
  ]);

  const cardIds = visibleRows.map(({ card }) => card.id);
  const valuationRows = cardIds.length
    ? await db
        .select()
        .from(schema.cardCatalogValuations)
        .where(inArray(schema.cardCatalogValuations.cardId, cardIds))
        .orderBy(
          desc(schema.cardCatalogValuations.observedAt),
          desc(schema.cardCatalogValuations.createdAt),
        )
    : [];
  const latest = new Map<string, (typeof valuationRows)[number]>();
  for (const valuation of valuationRows) {
    if (!latest.has(valuation.cardId)) latest.set(valuation.cardId, valuation);
  }
  return {
    rows: visibleRows,
    latestValuations: latest,
    total: Number(totalRows[0]?.value ?? 0),
    series,
    languages: languages.map((row) => row.value),
    regions: regions.map((row) => row.value),
  };
}

export async function getPublishedCardBySlug(slug: string) {
  const [row] = await db
    .select({
      card: schema.cardCatalogCards,
      set: schema.cardCatalogSets,
      series: schema.cardCatalogSeries,
    })
    .from(schema.cardCatalogCards)
    .innerJoin(schema.cardCatalogSets, eq(schema.cardCatalogCards.setId, schema.cardCatalogSets.id))
    .innerJoin(
      schema.cardCatalogSeries,
      eq(schema.cardCatalogSets.seriesId, schema.cardCatalogSeries.id),
    )
    .where(and(eq(schema.cardCatalogCards.slug, slug), publishedCatalogWhere))
    .limit(1);
  if (!row) return null;
  const valuations = await db
    .select()
    .from(schema.cardCatalogValuations)
    .where(eq(schema.cardCatalogValuations.cardId, row.card.id))
    .orderBy(
      desc(schema.cardCatalogValuations.observedAt),
      desc(schema.cardCatalogValuations.createdAt),
    );
  return { ...row, valuations };
}

export async function getCardCatalogAdminData(filters: { search?: string; after?: string } = {}) {
  const term = filters.search?.trim().slice(0, 80);
  const cardFilterConditions = [];
  if (term) {
    const pattern = `%${term.replace(/[\\%_]/g, (part) => `\\${part}`)}%`;
    cardFilterConditions.push(
      or(
        ilike(schema.cardCatalogCards.name, pattern),
        ilike(schema.cardCatalogCards.cardNumber, pattern),
        ilike(schema.cardCatalogSets.name, pattern),
        ilike(schema.cardCatalogSeries.name, pattern),
      )!,
    );
  }
  const cardConditions = [...cardFilterConditions];
  if (filters.after) cardConditions.push(gt(schema.cardCatalogCards.slug, filters.after));
  const [series, sets, cards, cardCountRow, filteredCardCountRow] = await Promise.all([
    db.select().from(schema.cardCatalogSeries).orderBy(asc(schema.cardCatalogSeries.name)),
    db
      .select({
        set: schema.cardCatalogSets,
        seriesName: schema.cardCatalogSeries.name,
        seriesStatus: schema.cardCatalogSeries.status,
      })
      .from(schema.cardCatalogSets)
      .innerJoin(
        schema.cardCatalogSeries,
        eq(schema.cardCatalogSets.seriesId, schema.cardCatalogSeries.id),
      )
      .orderBy(asc(schema.cardCatalogSeries.name), asc(schema.cardCatalogSets.name)),
    db
      .select({
        card: schema.cardCatalogCards,
        setName: schema.cardCatalogSets.name,
        seriesName: schema.cardCatalogSeries.name,
      })
      .from(schema.cardCatalogCards)
      .innerJoin(
        schema.cardCatalogSets,
        eq(schema.cardCatalogCards.setId, schema.cardCatalogSets.id),
      )
      .innerJoin(
        schema.cardCatalogSeries,
        eq(schema.cardCatalogSets.seriesId, schema.cardCatalogSeries.id),
      )
      .where(and(...cardConditions))
      .orderBy(asc(schema.cardCatalogCards.slug))
      .limit(CARD_CATALOG_ADMIN_PAGE_SIZE + 1),
    db.select({ value: count() }).from(schema.cardCatalogCards),
    db
      .select({ value: count() })
      .from(schema.cardCatalogCards)
      .innerJoin(
        schema.cardCatalogSets,
        eq(schema.cardCatalogCards.setId, schema.cardCatalogSets.id),
      )
      .innerJoin(
        schema.cardCatalogSeries,
        eq(schema.cardCatalogSets.seriesId, schema.cardCatalogSeries.id),
      )
      .where(and(...cardFilterConditions)),
  ]);
  const hasMoreCards = cards.length > CARD_CATALOG_ADMIN_PAGE_SIZE;
  const visibleCards = hasMoreCards ? cards.slice(0, CARD_CATALOG_ADMIN_PAGE_SIZE) : cards;
  const cardIds = visibleCards.map((row) => row.card.id);
  const valuations = cardIds.length
    ? await db
        .select({
          valuation: schema.cardCatalogValuations,
          cardName: schema.cardCatalogCards.name,
          cardSlug: schema.cardCatalogCards.slug,
        })
        .from(schema.cardCatalogValuations)
        .innerJoin(
          schema.cardCatalogCards,
          eq(schema.cardCatalogValuations.cardId, schema.cardCatalogCards.id),
        )
        .where(inArray(schema.cardCatalogValuations.cardId, cardIds))
        .orderBy(desc(schema.cardCatalogValuations.observedAt))
    : [];
  return {
    series,
    sets,
    cards: visibleCards,
    cardCount: Number(cardCountRow[0]?.value ?? 0),
    filteredCardCount: Number(filteredCardCountRow[0]?.value ?? 0),
    valuations,
    hasMoreCards,
    nextCardCursor: hasMoreCards ? (visibleCards.at(-1)?.card.slug ?? null) : null,
  };
}
