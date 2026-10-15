// SPDX-License-Identifier: Apache-2.0
import { WikiUpdatePreconditionError, wikiUpdateSnapshotHash } from "./wiki-update-precondition";

type Row = Record<string, unknown>;
type PageSnapshot = {
  kind: "databook-page-revision";
  index: number;
  value: Row | null;
};

function isRow(value: unknown): value is Row {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function isDatabookPageSnapshot(value: unknown): value is PageSnapshot {
  return (
    isRow(value) &&
    value.kind === "databook-page-revision" &&
    Number.isSafeInteger(value.index) &&
    Number(value.index) >= 0 &&
    (value.value === null || isRow(value.value))
  );
}

export function isDatabookPageRevisionTarget(table: string, key: string, value: unknown): boolean {
  return (
    table === "db_databooks" &&
    /^pages#[1-9]\d*(?:@[1-9]\d*)?$/.test(key) &&
    isDatabookPageSnapshot(value)
  );
}

function equal(a: unknown, b: unknown): boolean {
  if (a === undefined || b === undefined) return a === b;
  return wikiUpdateSnapshotHash({ value: a }) === wikiUpdateSnapshotHash({ value: b });
}

/** Journal only changed pages, preserving original JA/FR JSON and verification metadata. */
export function databookPageRevisionSnapshots(before: Row | null, after: Row | null) {
  const previous: Row = {};
  const next: Row = {};
  if (!Array.isArray(before?.pages) || !Array.isArray(after?.pages))
    return { before: previous, after: next };
  for (let index = 0; index < Math.max(before.pages.length, after.pages.length); index++) {
    const a = before.pages[index] ?? null;
    const b = after.pages[index] ?? null;
    if (equal(a, b)) continue;
    if ((a !== null && !isRow(a)) || (b !== null && !isRow(b)))
      throw new Error("Databook revision requires object pages");
    const number = Number((b ?? a)?.number);
    const target = Number.isSafeInteger(number) && number > 0 ? number : index + 1;
    let key = `pages#${target}`;
    // Preserve editorial numbers; the explicit slot suffix disambiguates reorder/duplicate cases.
    if (Object.hasOwn(previous, key)) key += `@${index + 1}`;
    previous[key] = { kind: "databook-page-revision", index, value: a } satisfies PageSnapshot;
    next[key] = { kind: "databook-page-revision", index, value: b } satisfies PageSnapshot;
  }
  return { before: previous, after: next };
}

/** Restore changed fields only; concurrent edits to other pages/fields survive. */
export function restoreDatabookPageRevision(current: unknown, before: Row, after: Row): unknown[] {
  if (!Array.isArray(current)) throw new WikiUpdatePreconditionError();
  const pages = structuredClone(current);
  const targets = Object.entries(before)
    .filter((entry): entry is [string, PageSnapshot] => isDatabookPageSnapshot(entry[1]))
    .toSorted((a, b) => {
      const order = ([key, previous]: [string, PageSnapshot]) =>
        previous.value === null
          ? 1
          : isDatabookPageSnapshot(after[key]) && after[key].value === null
            ? 2
            : 0;
      const difference = order(a) - order(b);
      if (difference) return difference;
      return order(a) === 1 ? b[1].index - a[1].index : a[1].index - b[1].index;
    });
  for (const [key, previous] of targets) {
    const next = after[key];
    if (!isDatabookPageSnapshot(next) || next.index !== previous.index)
      throw new WikiUpdatePreconditionError();
    const index = previous.index;
    const actual = pages[index] ?? null;
    if (previous.value === null || next.value === null) {
      if (!equal(actual, next.value)) throw new WikiUpdatePreconditionError();
      if (previous.value === null) pages.splice(index, 1);
      else pages.splice(index, 0, structuredClone(previous.value));
      continue;
    }
    if (!isRow(actual)) throw new WikiUpdatePreconditionError();
    const restored = { ...actual };
    for (const field of new Set([...Object.keys(previous.value), ...Object.keys(next.value)])) {
      if (equal(previous.value[field], next.value[field])) continue;
      if (
        Object.hasOwn(actual, field) !== Object.hasOwn(next.value, field) ||
        !equal(actual[field], next.value[field])
      )
        throw new WikiUpdatePreconditionError();
      if (Object.hasOwn(previous.value, field))
        restored[field] = structuredClone(previous.value[field]);
      else delete restored[field];
    }
    pages[index] = restored;
  }
  return pages;
}
