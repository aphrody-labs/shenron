// SPDX-License-Identifier: Apache-2.0
import { z } from "zod";

const positiveId = z.number().int().positive().safe();
const title = z.string().trim().min(1).max(500);
const slug = z
  .string()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  .max(200);
const optionalText = z.string().max(100_000).nullable().optional();
const isbn = z
  .string()
  .refine((value) => isbnVariants(value).length > 0)
  .nullable()
  .optional();
const publicationDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const parsed = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
  })
  .nullable()
  .optional();

const work = z
  .object({
    slug,
    kind: z.enum(["manga", "novel", "artbook", "databook", "magazine", "other"]),
    series: z
      .string()
      .regex(/^[A-Z0-9_]+$/)
      .max(100),
    title,
    titleJa: optionalText,
    titleRomaji: optionalText,
    synopsisFr: optionalText,
    sourceId: z.string().min(1).max(200).nullable().optional(),
  })
  .strict();
const edition = z
  .object({
    workId: positiveId,
    edition: z.enum([
      "tankobon",
      "kanzenban",
      "shinsouban",
      "chouzenshuu",
      "full_color",
      "sjc",
      "digital",
    ]),
    label: title,
    language: z.enum(["ja", "fr", "en"]).optional(),
    isbn,
    publisher: z.string().trim().min(1).max(500).nullable().optional(),
    publishedAt: publicationDate,
    pageColor: z.enum(["unknown", "nb", "color", "mixed"]).optional(),
    scanPolicy: z.string().min(1).max(100).optional(),
  })
  .strict();
const volume = z
  .object({
    editionId: positiveId,
    legacyVolumeId: positiveId.nullable().optional(),
    number: z
      .union([z.number(), z.string().regex(/^\d{1,4}(?:\.\d{1,2})?$/)])
      .transform(Number)
      .pipe(z.number().finite().nonnegative().max(9999.99))
      .refine((value) => Math.abs(value * 100 - Math.round(value * 100)) < 0.00001)
      .transform(String),
    slug,
    title: title.nullable().optional(),
    cover: z.string().max(2000).nullable().optional(),
    pageCount: z.number().int().nonnegative().max(100_000).nullable().optional(),
  })
  .strict();

export function isMediaCatalogTable(table: string): boolean {
  return ["media_works", "media_editions", "media_volumes"].includes(table);
}

export function parseMediaCatalogBody(
  table: string,
  body: Record<string, unknown>,
  forInsert: boolean,
): Record<string, unknown> {
  if (table === "media_works") return (forInsert ? work : work.partial()).parse(body);
  if (table === "media_editions") {
    const parsed = (forInsert ? edition : edition.partial()).parse(body);
    return forInsert
      ? { language: "ja", pageColor: "unknown", scanPolicy: "self_hosted", ...parsed }
      : parsed;
  }
  if (table === "media_volumes") return (forInsert ? volume : volume.partial()).parse(body);
  return body;
}

/** Equivalent bibliographic keys; the submitted display ISBN remains unchanged. */
export function isbnVariants(value: string): string[] {
  const digits = value.replace(/[\s-]/g, "").toUpperCase();
  if (/^\d{9}[\dX]$/.test(digits)) {
    const sum = [...digits].reduce(
      (total, digit, index) => total + (digit === "X" ? 10 : Number(digit)) * (10 - index),
      0,
    );
    if (sum % 11 !== 0) return [];
    const prefix = `978${digits.slice(0, 9)}`;
    const check =
      (10 -
        ([...prefix].reduce(
          (total, digit, index) => total + Number(digit) * (index % 2 ? 3 : 1),
          0,
        ) %
          10)) %
      10;
    return [digits, `${prefix}${check}`];
  }
  if (!/^\d{13}$/.test(digits)) return [];
  const sum = [...digits].reduce(
    (total, digit, index) => total + Number(digit) * (index % 2 ? 3 : 1),
    0,
  );
  if (sum % 10 !== 0) return [];
  if (!digits.startsWith("978")) return [digits];
  const prefix = digits.slice(3, 12);
  const remainder =
    [...prefix].reduce((total, digit, index) => total + Number(digit) * (10 - index), 0) % 11;
  const check = (11 - remainder) % 11;
  return [digits, `${prefix}${check === 10 ? "X" : check}`];
}

export class CatalogMediaConflictError extends Error {
  constructor(readonly existingIds: number[]) {
    super("A matching catalogue record already exists.");
    this.name = "CatalogMediaConflictError";
  }
}

export const EPISODE_REVISION_JSON_FIELDS = new Set([
  "subtitles",
  "players",
  "availability",
  "frames",
]);

export function isCatalogRevisionJson(table: string, field: string): boolean {
  return (
    (table === "db_episodes" && EPISODE_REVISION_JSON_FIELDS.has(field)) ||
    (table === "db_movies" && field === "subtitles")
  );
}
