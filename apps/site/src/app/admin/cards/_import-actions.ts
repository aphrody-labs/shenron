"use server";

import { and, eq, inArray, or } from "drizzle-orm";
import { createId } from "@paralleldrive/cuid2";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db, schema } from "@/lib/db";
import { getCurrentUser, requireAdmin, revisionActorOf } from "@/lib/session";
import { recordRevisionStrict } from "@/lib/wiki-revisions";
import {
  CARD_IMPORT_MAX_BYTES as MAX_IMPORT_BYTES,
  CARD_IMPORT_MAX_ROWS as MAX_IMPORT_ROWS,
} from "./import-limits";

const cardImportRow = z
  .object({
    setSlug: z.string().trim().min(1).max(180),
    cardNumber: z.string().trim().min(1).max(100),
    name: z.string().trim().min(1).max(240),
    language: z.string().trim().min(1).max(30),
    region: z.string().trim().min(1).max(80),
    rarity: z.string().trim().max(80).optional(),
    releaseDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
    sourceLabel: z.string().trim().min(1).max(180),
    sourceUrl: z.string().url().max(2048),
    sourceAccessedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    status: z.enum(["draft", "published"]).optional(),
  })
  .strict();

type ImportIssueCode =
  | "invalid-json"
  | "empty-import"
  | "too-many-rows"
  | "invalid-row"
  | "duplicate-file-row"
  | "missing-set"
  | "archived-parent"
  | "publish-parent"
  | "existing-card"
  | "confirm-required"
  | "write-failed";

type ImportIssue = { row: number; code: ImportIssueCode };

export type CardCatalogImportState = {
  status: "idle" | "preview" | "committed" | "invalid";
  total: number;
  ready: number;
  existing: number;
  created: number;
  updated: number;
  skipped: number;
  failed: number;
  issues: ImportIssue[];
};

const initialState: CardCatalogImportState = {
  status: "idle",
  total: 0,
  ready: 0,
  existing: 0,
  created: 0,
  updated: 0,
  skipped: 0,
  failed: 0,
  issues: [],
};

type ValidRow = z.infer<typeof cardImportRow> & { rowNumber: number; setId: string };

function validDate(value: string | undefined) {
  if (!value) return true;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function compositeKey(row: Pick<ValidRow, "setId" | "cardNumber" | "language" | "region">) {
  return [row.setId, row.cardNumber, row.language, row.region].join("\u0000");
}

function slugify(value: string) {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .toLowerCase()
    .replace(/^-+|-+$/g, "");
}

async function parseImport(formData: FormData) {
  const file = formData.get("file");
  const issues: ImportIssue[] = [];
  if (!(file instanceof File) || file.size === 0 || file.size > MAX_IMPORT_BYTES) {
    return {
      rows: [] as ValidRow[],
      issues: [{ row: 0, code: "invalid-json" as const }],
      total: 0,
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(await file.text());
  } catch {
    return {
      rows: [] as ValidRow[],
      issues: [{ row: 0, code: "invalid-json" as const }],
      total: 0,
    };
  }
  if (!Array.isArray(parsed)) {
    return {
      rows: [] as ValidRow[],
      issues: [{ row: 0, code: "invalid-json" as const }],
      total: 0,
    };
  }
  if (parsed.length === 0) {
    return {
      rows: [] as ValidRow[],
      issues: [{ row: 0, code: "empty-import" as const }],
      total: 0,
    };
  }
  if (parsed.length > MAX_IMPORT_ROWS) {
    return {
      rows: [] as ValidRow[],
      issues: [{ row: 0, code: "too-many-rows" as const }],
      total: parsed.length,
    };
  }

  const input: Array<{ rowNumber: number; value: z.infer<typeof cardImportRow> }> = [];
  for (const [index, item] of parsed.entries()) {
    const result = cardImportRow.safeParse(item);
    if (
      !result.success ||
      !validDate(result.data.releaseDate) ||
      !validDate(result.data.sourceAccessedAt)
    ) {
      issues.push({ row: index + 1, code: "invalid-row" });
      continue;
    }
    const url = new URL(result.data.sourceUrl);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      issues.push({ row: index + 1, code: "invalid-row" });
      continue;
    }
    input.push({ rowNumber: index + 1, value: { ...result.data, sourceUrl: url.toString() } });
  }

  const duplicates = new Set<string>();
  const distinct = input.filter(({ value, rowNumber }) => {
    const key = [value.setSlug, value.cardNumber, value.language, value.region].join("\u0000");
    if (duplicates.has(key)) {
      issues.push({ row: rowNumber, code: "duplicate-file-row" });
      return false;
    }
    duplicates.add(key);
    return true;
  });
  const setSlugs = [...new Set(distinct.map(({ value }) => value.setSlug))];
  const setRows = setSlugs.length
    ? await db
        .select({ set: schema.cardCatalogSets, seriesStatus: schema.cardCatalogSeries.status })
        .from(schema.cardCatalogSets)
        .innerJoin(
          schema.cardCatalogSeries,
          eq(schema.cardCatalogSets.seriesId, schema.cardCatalogSeries.id),
        )
        .where(inArray(schema.cardCatalogSets.slug, setSlugs))
    : [];
  const sets = new Map(setRows.map((row) => [row.set.slug, row]));
  const rows: ValidRow[] = [];
  for (const { rowNumber, value } of distinct) {
    const parent = sets.get(value.setSlug);
    if (!parent) {
      issues.push({ row: rowNumber, code: "missing-set" });
      continue;
    }
    if (parent.set.status === "archived" || parent.seriesStatus === "archived") {
      issues.push({ row: rowNumber, code: "archived-parent" });
      continue;
    }
    if (
      value.status === "published" &&
      (parent.set.status !== "published" || parent.seriesStatus !== "published")
    ) {
      issues.push({ row: rowNumber, code: "publish-parent" });
      continue;
    }
    rows.push({ ...value, rowNumber, setId: parent.set.id });
  }

  return { rows, issues, total: parsed.length };
}

async function existingCards(rows: ValidRow[]) {
  const conditions = rows.map((row) =>
    and(
      eq(schema.cardCatalogCards.setId, row.setId),
      eq(schema.cardCatalogCards.cardNumber, row.cardNumber),
      eq(schema.cardCatalogCards.language, row.language),
      eq(schema.cardCatalogCards.region, row.region),
    ),
  );
  if (!conditions.length) return new Map<string, typeof schema.cardCatalogCards.$inferSelect>();
  const found = await db
    .select()
    .from(schema.cardCatalogCards)
    .where(or(...conditions));
  return new Map(found.map((card) => [compositeKey(card), card]));
}

export async function importCardCatalogBatch(
  _previous: CardCatalogImportState,
  formData: FormData,
): Promise<CardCatalogImportState> {
  await requireAdmin();
  const { rows, issues, total } = await parseImport(formData);
  if (issues.length || !rows.length) {
    return {
      ...initialState,
      status: "invalid",
      total,
      ready: rows.length,
      issues: issues.slice(0, 30),
    };
  }

  const existing = await existingCards(rows);
  const existingCount = rows.filter((row) => existing.has(compositeKey(row))).length;
  const intent = String(formData.get("intent") ?? "preview");
  if (intent !== "commit") {
    return {
      ...initialState,
      status: "preview",
      total,
      ready: rows.length,
      existing: existingCount,
    };
  }
  if (formData.get("confirmCommit") !== "yes") {
    return {
      ...initialState,
      status: "invalid",
      total,
      ready: rows.length,
      existing: existingCount,
      issues: [{ row: 0, code: "confirm-required" }],
    };
  }

  const strategy = formData.get("duplicateStrategy") === "update" ? "update" : "skip";
  const actor = revisionActorOf(await getCurrentUser());
  let created = 0;
  let updated = 0;
  let skipped = 0;
  const writeIssues: ImportIssue[] = [];

  for (const row of rows) {
    const key = compositeKey(row);
    const before = existing.get(key);
    if (before && strategy === "skip") {
      skipped++;
      continue;
    }
    try {
      await db.transaction(async (tx) => {
        const id = before?.id ?? createId();
        const afterFields = {
          setId: row.setId,
          slug: before?.slug ?? `${slugify(`${row.cardNumber}-${row.name}`)}-${id.slice(0, 8)}`,
          name: row.name,
          cardNumber: row.cardNumber,
          language: row.language,
          region: row.region,
          rarity: row.rarity || null,
          releaseDate: row.releaseDate ?? null,
          description: before?.description ?? null,
          frontImageUrl: before?.frontImageUrl ?? null,
          frontImageSourceUrl: before?.frontImageSourceUrl ?? null,
          frontImageRights: before?.frontImageRights ?? null,
          backImageUrl: before?.backImageUrl ?? null,
          backImageSourceUrl: before?.backImageSourceUrl ?? null,
          backImageRights: before?.backImageRights ?? null,
          sourceLabel: row.sourceLabel,
          sourceUrl: row.sourceUrl,
          sourceAccessedAt: row.sourceAccessedAt,
          status: row.status ?? before?.status ?? "draft",
          updatedAt: new Date(),
        };
        const [after] = before
          ? await tx
              .update(schema.cardCatalogCards)
              .set(afterFields)
              .where(eq(schema.cardCatalogCards.id, id))
              .returning()
          : await tx
              .insert(schema.cardCatalogCards)
              .values({ id, ...afterFields })
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
      });
      if (before) updated++;
      else created++;
    } catch {
      writeIssues.push({ row: row.rowNumber, code: "write-failed" });
    }
  }

  revalidatePath("/admin/cards");
  revalidatePath("/wiki/cards");
  revalidatePath("/wiki/cards/[slug]", "page");
  return {
    status: "committed",
    total,
    ready: rows.length,
    existing: existingCount,
    created,
    updated,
    skipped,
    failed: writeIssues.length,
    issues: writeIssues.slice(0, 30),
  };
}
