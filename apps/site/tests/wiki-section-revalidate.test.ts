// SPDX-License-Identifier: Apache-2.0
import { beforeEach, expect, mock, test } from "bun:test";
import { sectionEntityType, publicEntityUrl } from "../src/lib/wiki-entity-model";

mock.module("server-only", () => ({}));
const paths: string[] = [];
const reads: Array<{ table: string; id: string }> = [];
let failRead = false;
mock.module("next/cache", () => ({
  revalidatePath: (path: string) => {
    paths.push(path);
  },
  revalidateTag: () => {},
}));
mock.module("@/lib/wiki-admin", () => ({
  getWikiRow: async (table: string, id: string) => {
    reads.push({ table, id });
    if (failRead) throw new Error("Database unavailable");
    return { id: Number(id), slug: "source-reviewed" };
  },
}));
const { revalidateSectionParent } = await import("../src/lib/wiki-revalidate");

beforeEach(() => {
  paths.length = 0;
  reads.length = 0;
  failRead = false;
});

test("section types selected by the admin resolve the same owner and public link in API invalidation", async () => {
  for (const table of [
    "db_characters",
    "db_planets",
    "db_sagas",
    "db_arcs",
    "db_races",
    "db_techniques",
    "db_games",
    "db_movies",
  ]) {
    await revalidateSectionParent({ entityType: sectionEntityType(table), entityId: 27 });
    expect(reads.at(-1)).toEqual({ table, id: "27" });
    expect(paths.at(-1) ?? null).toBe(publicEntityUrl(table, { id: 27, slug: "source-reviewed" }));
  }
});

test("unknown or incomplete section parents cause no database access or cache invalidation", async () => {
  for (const entityType of ["__proto__", "constructor", "toString", "Character", "unknown"])
    await revalidateSectionParent({ entityType, entityId: 27 });
  await revalidateSectionParent({ entityType: "character" });
  await revalidateSectionParent(undefined);
  expect(reads).toEqual([]);
  expect(paths).toEqual([]);
});

test("a parent lookup failure never turns a successful write into a cache failure", async () => {
  failRead = true;
  await expect(
    revalidateSectionParent({ entityType: "character", entityId: 27 }),
  ).resolves.toBeUndefined();
  expect(paths).toEqual([]);
});
