// SPDX-License-Identifier: Apache-2.0
import { cardImageRestoreRequest } from "./card-image-contract";
import { ApiError } from "./admin-api";
import type { SupportedLocale } from "./i18n/types";

export interface CardHistoryRevision {
  id: string;
  rowId: string;
  tableName: string;
  action: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
}

const imageFields = ["frontImageUrl", "frontImageWidth", "frontImageHeight", "frontImageSourceUrl", "frontImageRights"] as const;
const identityFields = ["setId", "cardNumber", "language", "region"] as const;
const record = (value: unknown): Record<string, unknown> | null => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
const imageSnapshot = (value: unknown) => {
  const row = record(value);
  if (!row || !imageFields.every(field => Object.hasOwn(row, field))) return null;
  if (!imageFields.every(field => {
    const item = row[field];
    return item === null || (field === "frontImageWidth" || field === "frontImageHeight" ? typeof item === "number" && Number.isInteger(item) && item > 0 && item <= 10000 : typeof item === "string" && item.length <= (field === "frontImageRights" ? 500 : 2048));
  })) return null;
  if (row.frontImageUrl === null && !imageFields.every(field => row[field] === null)) return null;
  return row;
};
const sameImage = (left: unknown, right: unknown) => {
  const a = imageSnapshot(left), b = imageSnapshot(right);
  return !!a && !!b && imageFields.every(field => Object.is(a[field], b[field]));
};

/** Historical nullable image fields are valid; missing fields cannot form a restoration plan. */
export function canRestoreCardImage(revision: CardHistoryRevision): boolean {
  if (revision.tableName !== "CardCatalogCard" || !["update", "revert"].includes(revision.action)) return false;
  const before = imageSnapshot(revision.before), after = imageSnapshot(revision.after);
  return !!before && !!after && identityFields.every(field => typeof before[field] === "string" && before[field] === after[field]) && !sameImage(before, after);
}

/** Bind the server plan to this revision and pass only its signed compare-and-set inputs. */
export function cardImageHistoryPlan(value: unknown, revision: CardHistoryRevision, lang: SupportedLocale) {
  const response = record(value);
  const rows = response?.items;
  const row = Array.isArray(rows) && rows.length === 1 ? record(rows[0]) : null;
  const identity = record(row?.identity);
  const item = record(row?.item);
  if (!canRestoreCardImage(revision) || response?.schema !== "shenron-card-image-restore/v1" || response.intent !== "restore-preview" || !row || row.id !== revision.rowId || item?.revisionId !== revision.id || !identityFields.every(field => identity?.[field] === revision.before?.[field]) || !sameImage(row.before, revision.after) || !sameImage(row.after, revision.before) || (revision.before?.frontImageUrl !== null && typeof item.assetSha256 !== "string")) {
    throw new ApiError(409, "preview_changed");
  }
  const parsed = cardImageRestoreRequest.safeParse({intent: "restore-commit", lang, items: [item], planSha256: response.planSha256});
  if (!parsed.success) throw new ApiError(409, "preview_changed");
  return parsed.data;
}
