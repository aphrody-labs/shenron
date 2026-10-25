// SPDX-License-Identifier: Apache-2.0
import { afterEach, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildMangaColorMatrix } from "../scripts/manga-color-matrix";

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/pHcAAAAASUVORK5CYII=",
  "base64",
);

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "shenron-manga-color-matrix-"));
  roots.push(root);
  const snapshot = join(root, "snapshot.sqlite");
  const assets = join(root, "assets");
  const out = join(root, "out");
  await mkdir(assets, { recursive: true });
  const db = new Database(snapshot);
  db.run(
    "CREATE TABLE db_manga_volumes (id INTEGER, series TEXT, volume_number INTEGER, title TEXT, isbn TEXT)",
  );
  db.run(
    "CREATE TABLE db_manga_chapters (id INTEGER, series TEXT, chapter_number INTEGER, title TEXT, volume_id INTEGER)",
  );
  db.run(
    "CREATE TABLE db_manga_pages (id INTEGER, series TEXT, tome TEXT, planche INTEGER, text TEXT)",
  );
  db.run("INSERT INTO db_manga_volumes VALUES (1, 'DB', 1, 'Volume 1', 'db-isbn')");
  db.run("INSERT INTO db_manga_chapters VALUES (201, 'DBS', 1, 'Chapter 1', NULL)");
  db.run("INSERT INTO db_manga_chapters VALUES (301, 'DBFC', 1, 'Color chapter 1', NULL)");
  db.run("INSERT INTO db_manga_pages VALUES (1, 'DBS', 'ch201', 1, 'OCR')");
  db.close();
  await mkdir(join(assets, "DBFC/vol1"), { recursive: true });
  await writeFile(join(assets, "DBFC/vol1/001.png"), png);
  await mkdir(join(assets, "DBS/ch201"), { recursive: true });
  await writeFile(join(assets, "DBS/ch201/001.png"), png);
  await mkdir(join(assets, "dragonballcn/dragonball_full_color"), { recursive: true });
  await writeFile(join(assets, "dragonballcn/dragonball_full_color/001.png"), png);
  const catalogue = join(root, "index.json");
  await writeFile(
    catalogue,
    JSON.stringify({
      collections: [
        {
          slug: "dragonball_full_color",
          ouvrages: [
            {
              rang: 1,
              titre: "Japanese full color volume one",
              isbn: "jp-1",
              planches_recensees: 1,
              couverture: {
                chemin: "./assets/dragonballcn/dragonball_full_color/001.png",
                sha256: "catalogue-hash-is-not-file-proof",
              },
            },
            { rang: 2, titre: "Japanese full color volume two", pagination: "fiche muette" },
          ],
        },
      ],
    }),
  );
  return { snapshot, assets, out, catalogue };
}

test("--plan produces a matrix in memory and never creates output; scan and cover files are measured separately", async () => {
  const options = await fixture();
  const result = await buildMangaColorMatrix({ ...options, plan: true });
  expect(await Bun.file(options.out).exists()).toBe(false);
  expect(result.editionStatus.DBS.publishedColorEdition).toBe(false);
  expect(result.editionStatus.DBS.publishedEditions).toEqual(["fr-nb", "ja-nb"]);
  expect(result.totals.pageImages).toBe(2);
  expect(result.totals.covers).toBe(1);
  expect(
    result.records.find((row: any) => row.series === "DBFC" && row.unit === "vol1")?.pageFiles,
  ).toBe(1);
  expect(
    result.records.find((row: any) => row.series === "DBFC" && row.unit === "vol2")
      ?.pageScanPresence,
  ).toBe("missing");
  expect(
    result.records.find((row: any) => row.series === "DBS" && row.unit === "ch1")?.ocrPageIndices,
  ).toBe(1);
  const page = result.assets.find((asset: any) => asset.path === "DBFC/vol1/001.png");
  expect(page.role).toBe("page");
  expect(page.width).toBe(1);
  expect(page.height).toBe(1);
  expect(page.sha256).toMatch(/^[a-f0-9]{64}$/);
  const cover = result.assets.find((asset: any) =>
    asset.path.endsWith("dragonball_full_color/001.png"),
  );
  expect(cover.role).toBe("cover");
  expect(cover.width).toBe(1);
  expect(cover.sha256).not.toBe("catalogue-hash-is-not-file-proof");
});

test("normal mode writes only the three declared matrix outputs under --out", async () => {
  const options = await fixture();
  await buildMangaColorMatrix(options);
  expect(await Bun.file(join(options.out, "matrix.json")).exists()).toBe(true);
  expect(await Bun.file(join(options.out, "matrix.csv")).exists()).toBe(true);
  expect(await Bun.file(join(options.out, "assets.csv")).exists()).toBe(true);
  expect(await Bun.file(join(options.out, "matrix.json")).text()).toContain(
    '"publishedColorEdition": false',
  );
});
