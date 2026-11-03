// SPDX-License-Identifier: Apache-2.0
import { afterAll, expect, mock, test } from "bun:test";
mock.module("server-only", () => ({}));
let admin = true;
let unavailable = false;
mock.module("@/lib/session", () => ({ isCurrentUserAdmin: async () => admin }));
const calls: unknown[] = [];
mock.module("../src/lib/cdn-catalog", () => ({
  safeCdnPath: (path: string) =>
    path.startsWith("/") && !/[?\\]/.test(path) && !path.includes("..") && !path.startsWith("//"),
  readCdnPage: async (input: unknown) => {
    calls.push(input);
    if (unavailable) throw new TypeError("fetch unavailable");
    return {
      index: { revision: "a".repeat(64), totalFiles: 1234 },
      directory: { fileCount: 123 },
      page: {
        page: 1,
        totalPages: 3,
        entries: [
          { path: "/assets/wiki/other/", mime: "inode/directory", size: 0, sha256: null },
          {
            path: "/assets/wiki/scan one.png",
            mime: "image/png",
            size: 42,
            sha256: "b".repeat(64),
          },
          { path: "/assets/wiki/episode.mp4", mime: "video/mp4", size: 42, sha256: null },
        ],
      },
    };
  },
}));
const { readAdminMediaLibrary, AdminMediaQueryError } =
  await import("../src/lib/admin-media-library");
const { GET } = await import("../src/app/api/admin/media-library/route");
afterAll(() => mock.restore());

test("CDN image selection uses existing revision-pinned owner, encodes URL paths and preserves pagination", async () => {
  const data = await readAdminMediaLibrary(
    new URLSearchParams({ path: "/assets/wiki/", page: "2" }),
  );
  expect(calls.at(-1)).toEqual({ path: "/assets/wiki/", page: 2 });
  expect(data).toMatchObject({
    directory: "/assets/wiki/",
    parent: "/assets/",
    page: 2,
    totalPages: 3,
    totalFiles: 123,
  });
  expect(data.files).toHaveLength(1);
  expect(data.files[0]?.url).toBe("https://cdn.dragonballfr.com/assets/wiki/scan%20one.png");
  expect(data.folders).toEqual([{ path: "/assets/wiki/other/", name: "other" }]);
});

test("invalid namespace and pagination fail before fetching the projection", async () => {
  for (const query of [
    "path=https://evil.test/",
    "path=//evil/",
    "path=/assets/../private/",
    "page=0",
    "page=1.2",
    "page=100001",
  ]) {
    expect(readAdminMediaLibrary(new URLSearchParams(query))).rejects.toBeInstanceOf(
      AdminMediaQueryError,
    );
  }
});

test("private endpoint gates admin and distinguishes bad queries from provider fetch TypeError", async () => {
  admin = false;
  const forbidden = await GET(new Request("https://localhost/api/admin/media-library"));
  expect(forbidden.status).toBe(403);
  expect(forbidden.headers.get("cache-control")).toBe("private, no-store");
  admin = true;
  expect((await GET(new Request("https://localhost/api/admin/media-library?page=0"))).status).toBe(
    400,
  );
  unavailable = true;
  const oldError = console.error;
  console.error = () => {};
  try {
    expect((await GET(new Request("https://localhost/api/admin/media-library"))).status).toBe(503);
  } finally {
    console.error = oldError;
    unavailable = false;
  }
});
