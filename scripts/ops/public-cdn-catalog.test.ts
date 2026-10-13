// SPDX-License-Identifier: Apache-2.0
import { expect, test } from "bun:test";
import { digest, projectCatalog, validateAssetPath } from "./public-cdn-catalog";

const sha = "a".repeat(64);
const input = {
  createdAt: "2026-10-13T04:30:00.000Z",
  entries: {
    "/z.png": { size: 4, sha256: sha, contentType: "image/png", sourcePath: "/private/raw" },
    "/assets/b.png": {
      size: 2,
      sha256: sha,
      contentType: "image/png",
      objectKey: "_objects/secret",
    },
    "/assets/a.png": { size: 1, sha256: sha, contentType: "image/png", cookie: "private-cookie" },
    "/assets/deep/c.png": { size: 3, sha256: sha, contentType: "image/png" },
  },
};

test("complete lexical pages contain only public fields and independently hash each artifact", () => {
  const { index, artifacts } = projectCatalog(input, sha, 2);
  expect(index.totalFiles).toBe(4);
  expect(index.totalFolders).toBe(3);
  expect(index.totalBytes).toBe(10);
  const files = index.files.pages.flatMap((page) => {
    const body = artifacts.get(page.url)!;
    expect(digest(body)).toBe(page.sha256);
    const value = JSON.parse(body);
    expect(value.entries).toHaveLength(page.count);
    return value.entries;
  });
  expect(files.map((file) => file.path)).toEqual([
    "/assets/a.png",
    "/assets/b.png",
    "/assets/deep/c.png",
    "/z.png",
  ]);
  for (const file of files) expect(Object.keys(file)).toEqual(["path", "mime", "size", "sha256"]);
  for (const body of artifacts.values()) {
    expect(body).not.toContain("sourcePath");
    expect(body).not.toContain("objectKey");
    expect(body).not.toContain("private-cookie");
    expect(body).not.toContain("/private/raw");
  }
  expect(Object.keys(index.folders.shards)).toHaveLength(256);
  const shard = digest("/assets/").slice(0, 2);
  const lookupBody = artifacts.get(index.folders.shardTemplate.replace("{shard}", shard))!;
  expect(digest(lookupBody)).toBe(index.folders.shards[shard]);
  const directory = JSON.parse(lookupBody)["/assets/"];
  expect(directory.fileCount).toBe(2);
  expect(directory.directoryCount).toBe(1);
  const children = directory.pages.flatMap((page: { url: string; sha256: string }) => {
    const body = artifacts.get(page.url)!;
    expect(digest(body)).toBe(page.sha256);
    return JSON.parse(body).entries;
  });
  expect(children.map((file: { path: string }) => file.path)).toEqual([
    "/assets/a.png",
    "/assets/b.png",
    "/assets/deep/",
  ]);
  expect(children[2]).toEqual({
    path: "/assets/deep/",
    mime: "inode/directory",
    size: 0,
    sha256: null,
  });
});

test("projection excludes itself and private metadata from revision to prevent recursive growth", () => {
  const first = projectCatalog(input, sha, 2);
  const next = projectCatalog(
    {
      ...input,
      entries: {
        ...input.entries,
        "/catalog/assets/index.json": { size: 100, sha256: sha, contentType: "application/json" },
        "/catalog/assets/revisions/old/files/page.json": {
          size: 10,
          sha256: sha,
          contentType: "application/json",
        },
      },
    },
    "b".repeat(64),
    2,
  );
  expect(next.index.revision).toBe(first.index.revision);
  expect(next.index.totalFiles).toBe(first.index.totalFiles);
  expect([...next.artifacts.keys()]).toEqual([...first.artifacts.keys()]);
  const changedPrivate = structuredClone(input);
  changedPrivate.entries["/z.png"].sourcePath = "/different/protected/path";
  expect(projectCatalog(changedPrivate, sha, 2).index.revision).toBe(first.index.revision);
});

test("traversal, aliases, private segments and excessive depth fail before output", () => {
  for (const path of [
    "/a/../b",
    "/%2e%2e/x",
    "/%252e%252e/x",
    "/a%2fb/../x",
    "/a\\b",
    "//x",
    "/a?x",
    "/private/x",
    "/.env.local",
    "/a//b",
    "/" + "a/".repeat(65) + "b",
  ]) {
    expect(() => validateAssetPath(path)).toThrow();
  }
  expect(() =>
    projectCatalog(
      { ...input, entries: { "/bad": { size: -1, sha256: sha, contentType: "x" } } },
      sha,
    ),
  ).toThrow();
  expect(() => projectCatalog(input, sha, 501)).toThrow();
});

test("empty inventory has a browsable root and one empty complete file page", () => {
  const { index, artifacts } = projectCatalog({ ...input, entries: {} }, sha);
  expect(index.totalFiles).toBe(0);
  expect(index.totalFolders).toBe(1);
  expect(index.files.pages).toHaveLength(1);
  expect(JSON.parse(artifacts.get(index.files.pages[0]!.url)!).entries).toEqual([]);
});

test("encoded question marks in real public filenames remain data, not query strings", () => {
  expect(() => validateAssetPath("/assets/Arte_de_Dend%3F.webp")).not.toThrow();
  const result = projectCatalog(
    {
      ...input,
      entries: {
        "/assets/Arte_de_Dend%3F.webp": { size: 1, sha256: sha, contentType: "image/webp" },
      },
    },
    sha,
  );
  expect(result.index.totalFiles).toBe(1);
});
