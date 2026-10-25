// SPDX-License-Identifier: Apache-2.0
import { expect, mock, test } from "bun:test";
mock.module("server-only", () => ({}));
const paths: string[] = [];
mock.module("next/cache", () => ({
  revalidatePath: (path: string) => {
    paths.push(path);
  },
  revalidateTag: () => {},
}));
mock.module("@/lib/wiki-admin", () => ({ getWikiRow: async () => null }));
mock.module("@/lib/wiki-fields", () => ({
  publicEntityUrl: (table: string, row: Record<string, unknown>) =>
    table === "db_manga_volumes" ? `/wiki/manga/volume/${row.id}` : null,
}));
const { revalidateWikiEntity } = await import("../src/lib/wiki-revalidate");

test("a volume cover edit invalidates its public API and catalogue along with the wiki page", () => {
  paths.length = 0;
  revalidateWikiEntity("db_manga_volumes", { id: 740 });
  expect(paths).toContain("/wiki/manga/volume/740");
  expect(paths).toContain("/api/manga/volume/740");
  expect(paths).toContain("/api/manga");
  expect(paths).toContain("/api/manga/coverage");
});

test("a malformed or missing volume identity never constructs an API detail invalidation", () => {
  for (const id of [undefined, "740/other", 0, -1]) {
    paths.length = 0;
    revalidateWikiEntity("db_manga_volumes", { id });
    expect(paths.filter((path) => path.startsWith("/api/manga/volume/"))).toEqual([]);
    expect(paths).toContain("/api/manga");
  }
});

test("a character visibility or slug edit refreshes the sitemap that lists public characters", () => {
  paths.length = 0;
  revalidateWikiEntity("db_characters", { id: 298, name: "C-21", visible: false });
  expect(paths).toContain("/wiki/characters");
  expect(paths).toContain("/wiki");
  expect(paths).toContain("/sitemap.xml");
});
