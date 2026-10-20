// SPDX-License-Identifier: Apache-2.0
import { afterEach, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  loadDatasetInventory,
  resolveDatasetEditorialFreeze,
} from "../src/dragon-ball/dataset-inventory";
import {
  DRAGON_BALL_DATASET_FAMILIES,
  digest,
  type DatasetManifest,
} from "../src/dragon-ball/source-coverage";

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});
const asOf = "2026-10-07";
function manifest(family: DatasetManifest["family"], id: string): DatasetManifest {
  return {
    version: 1,
    family,
    id,
    title: "Fixture source",
    citation: "https://www.shueisha.co.jp/",
    edition: { publisher: "Fixture publisher", format: "digital", language: "ja", identifier: id },
    unit: "document",
    asOf,
    enumerationEvidence: "https://www.shueisha.co.jp/",
    enumerationReviewed: true,
    expectedIds: ["entry_1"],
    editorialTarget: family === "databooks" ? "databook" : "none",
    rights: {
      basis: "permission",
      evidence: "PRIVATE EVIDENCE",
      ragPermitted: true,
      trainingPermitted: true,
      publicImagesPermitted: false,
    },
    trainingReview: "approved",
    items: [
      {
        id: "entry_1",
        asset: "source.bin",
        sha256: digest("source bytes"),
        review: "approved",
        text: "PRIVATE PAGE TEXT",
        noText: false,
        lang: "ja",
      },
    ],
  };
}
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "shenron-inventory-"));
  roots.push(root);
  const options = {
    repoRoot: join(root, "repo"),
    manifestRoot: join(root, "manifests"),
    assetRoot: join(root, "assets"),
    catalogPath: join(root, "manifests/catalog.json"),
    freezeFile: join(root, "repo/.coord/FREEZE-databooks.json"),
    asOf,
  };
  await mkdir(join(options.repoRoot, "docs/reference/root"), { recursive: true });
  await mkdir(join(options.repoRoot, ".coord"));
  await writeFile(options.freezeFile, '{"frozen":false}');
  await mkdir(options.manifestRoot);
  await mkdir(options.assetRoot);
  await writeFile(join(options.assetRoot, "source.bin"), "source bytes");
  await writeFile(
    join(options.repoRoot, "docs/reference/root/PLAN.md"),
    '```json\n{"freeze":{"databooks":false}}\n```',
  );
  const families = [];
  for (const family of DRAGON_BALL_DATASET_FAMILIES) {
    await mkdir(join(options.manifestRoot, family));
    const ids = Array.from(
      { length: family === "soshuhen" ? 18 : 1 },
      (_, index) => `${family}_${index + 1}`,
    );
    families.push({
      family,
      expectedIds: ids,
      enumerationEvidence: "https://www.shueisha.co.jp/",
      enumerationReviewed: true,
    });
    for (const id of ids)
      await writeFile(
        join(options.manifestRoot, family, `${id}.json`),
        JSON.stringify(manifest(family, id)),
      );
  }
  await writeFile(options.catalogPath, JSON.stringify({ version: 1, asOf, families }));
  return options;
}

test("all reviewed recensions load actual assets and emit metadata without private evidence", async () => {
  const options = await fixture();
  const report = await loadDatasetInventory(options);
  expect(report.coverage.trainingReady).toBe(true);
  expect(report.verifiedDatasets).toHaveLength(33);
  expect(report.unavailable).toEqual([]);
  const metadata = JSON.stringify({ coverage: report.coverage, unavailable: report.unavailable });
  expect(metadata).not.toContain("PRIVATE PAGE TEXT");
  expect(metadata).not.toContain("PRIVATE EVIDENCE");
  expect(metadata).not.toContain(options.manifestRoot);
  expect(metadata).not.toContain("source.bin");
  await writeFile(join(options.assetRoot, "source.bin"), "changed bytes");
  const changed = await loadDatasetInventory(options);
  expect(changed.coverage.trainingReady).toBe(false);
  expect(changed.coverage.gaps.some((gap) => gap.code === "hash-mismatch")).toBe(true);
});

test("missing, malformed and mismatched sources do not abort other families", async () => {
  const options = await fixture();
  await rm(join(options.manifestRoot, "manga/manga_1.json"));
  await writeFile(join(options.manifestRoot, "guides/guides_1.json"), "PRIVATE INVALID DATA");
  await writeFile(
    join(options.manifestRoot, "official_news/official_news_1.json"),
    JSON.stringify(manifest("interview", "official_news_1")),
  );
  const report = await loadDatasetInventory(options);
  expect(report.coverage.coverageComplete).toBe(false);
  expect(report.verifiedDatasets.some((item) => item.manifest.family === "timeline")).toBe(true);
  expect(report.unavailable).toEqual([
    { family: "manga", datasetId: "manga_1", code: "manifest-unavailable" },
    { family: "guides", datasetId: "guides_1", code: "invalid-manifest" },
    { family: "official_news", datasetId: "official_news_1", code: "manifest-identity-mismatch" },
  ]);
  expect(JSON.stringify(report.unavailable)).not.toContain("PRIVATE INVALID DATA");
  expect(JSON.stringify(report.unavailable)).not.toContain(options.manifestRoot);
  await writeFile(
    join(options.manifestRoot, "official_news/official_news_1.json"),
    JSON.stringify(manifest("official_news", "wrong_identity")),
  );
  expect((await loadDatasetInventory(options)).unavailable).toContainEqual({
    family: "official_news",
    datasetId: "official_news_1",
    code: "manifest-identity-mismatch",
  });
});

test("manifest symlinks outside the protected root and unsafe catalog IDs are refused", async () => {
  const options = await fixture();
  await rm(join(options.manifestRoot, "manga/manga_1.json"));
  const outside = join(options.repoRoot, "outside.json");
  await writeFile(outside, JSON.stringify(manifest("manga", "manga_1")));
  await symlink(outside, join(options.manifestRoot, "manga/manga_1.json"));
  const report = await loadDatasetInventory(options);
  expect(report.unavailable).toContainEqual({
    family: "manga",
    datasetId: "manga_1",
    code: "manifest-outside-root",
  });
  await writeFile(
    options.catalogPath,
    JSON.stringify({
      version: 1,
      asOf,
      families: [
        {
          family: "manga",
          expectedIds: ["../escape"],
          enumerationEvidence: "https://www.shueisha.co.jp/",
          enumerationReviewed: true,
        },
      ],
    }),
  );
  const invalid = await loadDatasetInventory(options);
  expect(invalid.verifiedDatasets).toEqual([]);
  expect(invalid.unavailable).toEqual([{ family: null, datasetId: null, code: "invalid-catalog" }]);
});

test("freeze authority fails closed and a runtime flag cannot override the doctrine", async () => {
  const options = await fixture();
  const plan = join(options.repoRoot, "docs/reference/root/PLAN.md");
  await writeFile(options.freezeFile, '{"frozen":false}');
  await writeFile(plan, '```json\n{"freeze":{"databooks":true}}\n```');
  expect(await resolveDatasetEditorialFreeze(options)).toEqual({
    frozen: true,
    reason: "doctrine-frozen",
  });
  const frozen = await loadDatasetInventory(options);
  expect(frozen.coverage.coverageComplete).toBe(true);
  expect(frozen.coverage.datasets.find((item) => item.family === "databooks")!.ragReady).toBe(
    false,
  );
  expect(frozen.coverage.datasets.find((item) => item.family === "timeline")!.ragReady).toBe(true);
  await writeFile(plan, "missing structured doctrine");
  expect((await resolveDatasetEditorialFreeze(options)).frozen).toBe(true);
  await rm(plan);
  expect((await resolveDatasetEditorialFreeze(options)).frozen).toBe(true);
  await writeFile(plan, '```json\n{"freeze":{"databooks":false}}\n```');
  await writeFile(options.freezeFile, "invalid freeze state");
  expect(await resolveDatasetEditorialFreeze(options)).toEqual({
    frozen: true,
    reason: "runtime-frozen",
  });
  await writeFile(options.freezeFile, '{"frozen":false}');
  expect((await resolveDatasetEditorialFreeze(options)).frozen).toBe(false);
});
