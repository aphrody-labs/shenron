// SPDX-License-Identifier: Apache-2.0
export interface VolumePageReferences {
  id: number;
  pageCount: number | null;
  chapters: Array<{ id: number; pages: string[] }>;
}
export interface AssetInventoryEntry {
  sha256: string;
  size: number;
  contentType: string;
}

export function planMediaPageCounts(
  volumes: VolumePageReferences[],
  entries: Record<string, AssetInventoryEntry>,
) {
  if (volumes.length > 1000 || new Set(volumes.map((row) => row.id)).size !== volumes.length) {
    throw new Error("Invalid bounded volume inventory");
  }
  return volumes
    .filter((row) => row.pageCount === null)
    .map((row) => {
      const paths: string[] = [];
      for (const chapter of row.chapters) {
        if (!Array.isArray(chapter.pages) || chapter.pages.length > 5000)
          throw new Error("Invalid chapter page references");
        for (const page of chapter.pages) {
          if (
            typeof page !== "string" ||
            !/^\.?\/?assets\/manga\//.test(page) ||
            /[\\?#]/.test(page) ||
            page.split("/").includes("..")
          ) {
            throw new Error("Unexpected media page reference");
          }
          const path = "/" + page.replace(/^\.\//, "").replace(/^\//, "");
          const asset = entries[path];
          if (
            !asset ||
            !/^[a-f0-9]{64}$/i.test(asset.sha256) ||
            !Number.isSafeInteger(asset.size) ||
            asset.size < 1 ||
            !asset.contentType.startsWith("image/")
          ) {
            throw new Error("Referenced page is missing from the qualified asset inventory");
          }
          paths.push(path);
        }
      }
      if (paths.length > 100000 || new Set(paths).size !== paths.length)
        throw new Error("Ambiguous duplicate volume page references");
      return {
        id: row.id,
        expected: { pageCount: null },
        pageCount: paths.length,
        referencesSha256: new Bun.CryptoHasher("sha256")
          .update(JSON.stringify(row.chapters))
          .digest("hex"),
      };
    })
    .filter((row) => row.pageCount > 0);
}
