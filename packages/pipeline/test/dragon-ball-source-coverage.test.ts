// SPDX-License-Identifier: Apache-2.0
import { afterEach, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  DRAGON_BALL_DATASET_FAMILIES,
  auditDatasetCoverage,
  digest,
  verifyDataset,
  type DatasetManifest,
  type VerifiedDataset,
} from "../src/dragon-ball/source-coverage";

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});
const asOf = "2026-10-07";
function manifest(family: DatasetManifest["family"], id = `${family}_01`): DatasetManifest {
  return {
    version: 1,
    id,
    family,
    title: "Fixture source",
    citation: "https://www.shueisha.co.jp/",
    edition: { publisher: "Fixture publisher", format: "digital", language: "ja", identifier: id },
    unit: family === "timeline" ? "event" : "document",
    asOf,
    enumerationEvidence: "https://www.shueisha.co.jp/",
    enumerationReviewed: true,
    expectedIds: ["entry_1"],
    editorialTarget: family === "databooks" ? "databook" : "none",
    rights: {
      basis: "permission",
      evidence: "PRIVATE RIGHTS EVIDENCE",
      ragPermitted: true,
      trainingPermitted: true,
      publicImagesPermitted: false,
    },
    trainingReview: "approved",
    items: [
      {
        id: "entry_1",
        asset: "page.bin",
        sha256: digest("fixture bytes"),
        review: "approved",
        text: "PRIVATE SOURCE TEXT",
        noText: false,
        lang: "ja",
      },
    ],
  };
}
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "shenron-dataset-coverage-"));
  roots.push(root);
  await writeFile(join(root, "page.bin"), "fixture bytes");
  return root;
}
async function allFamilies(root: string) {
  const reports: VerifiedDataset[] = [];
  const families = [];
  for (const family of DRAGON_BALL_DATASET_FAMILIES) {
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
    for (const id of ids) reports.push(await verifyDataset(manifest(family, id), root));
  }
  return { reports, catalog: { version: 1, asOf, families } };
}

test("all families require a current reviewed enumeration and exact manifests", async () => {
  const root = await fixture();
  const { catalog, reports } = await allFamilies(root);
  expect(
    auditDatasetCoverage(catalog, reports, { asOf, editorialFrozen: false }).trainingReady,
  ).toBe(true);
  const missing = reports.filter((item) => item.manifest.family !== "interview");
  const report = auditDatasetCoverage(catalog, missing, { asOf, editorialFrozen: false });
  expect(report.coverageComplete).toBe(false);
  expect(report.gaps).toContainEqual({
    family: "interview",
    datasetId: "interview_1",
    code: "missing-or-duplicate-manifest",
  });
  catalog.asOf = "2026-10-06";
  expect(auditDatasetCoverage(catalog, reports, { asOf, editorialFrozen: false }).ragReady).toBe(
    false,
  );
});

test("rights, training review and databook freeze are independent from acquired coverage", async () => {
  const root = await fixture();
  const { catalog, reports } = await allFamilies(root);
  const official = reports.find((item) => item.manifest.family === "official_news")!;
  official.manifest.rights.trainingPermitted = false;
  official.manifest.trainingReview = "pending";
  Object.assign(official, await verifyDataset(official.manifest, root));
  const report = auditDatasetCoverage(catalog, reports, { asOf, editorialFrozen: false });
  expect(report.coverageComplete).toBe(true);
  expect(report.ragReady).toBe(true);
  expect(report.trainingReady).toBe(false);
  const frozen = auditDatasetCoverage(catalog, reports, { asOf, editorialFrozen: true });
  expect(frozen.datasets.find((item) => item.family === "databooks")!.ragReady).toBe(false);
  expect(frozen.datasets.find((item) => item.family === "timeline")!.ragReady).toBe(true);
  official.manifest.rights.basis = "unverified";
  Object.assign(official, await verifyDataset(official.manifest, root));
  expect(auditDatasetCoverage(catalog, reports, { asOf, editorialFrozen: false }).ragReady).toBe(
    false,
  );
  const metadata = JSON.stringify(report);
  expect(metadata).not.toContain("PRIVATE SOURCE TEXT");
  expect(metadata).not.toContain("PRIVATE RIGHTS EVIDENCE");
  expect(metadata).not.toContain("page.bin");
});

test("changing the manifest after file verification invalidates readiness", async () => {
  const { catalog, reports } = await allFamilies(await fixture());
  reports[0]!.manifest.items[0]!.sha256 = digest("unverified change");
  const report = auditDatasetCoverage(catalog, reports, { asOf, editorialFrozen: false });
  expect(report.ragReady).toBe(false);
  expect(report.gaps.some((gap) => gap.code === "changed-manifest-after-verification")).toBe(true);
});

test("valid percent-encoded public provenance stays usable", async () => {
  const source = manifest("interview");
  source.citation = "https://www.shueisha.co.jp/books/100%25";
  expect((await verifyDataset(source, await fixture())).gaps).toEqual([]);
});

test("actual source assets and editorial decisions cannot be replaced by counts", async () => {
  const root = await fixture();
  const source = manifest("weekly_shonen_jump");
  source.expectedIds.push("entry_2");
  source.items[0]!.review = "pending";
  source.items[0]!.sha256 = digest("changed");
  source.items.push({ ...source.items[0]! });
  const report = await verifyDataset(source, root);
  expect(report.gaps.map((gap) => gap.code)).toEqual([
    "unapproved-item",
    "hash-mismatch",
    "duplicate-item",
    "unapproved-item",
    "hash-mismatch",
    "missing-item",
  ]);
  await mkdir(join(root, "inside"));
  await symlink("/etc/passwd", join(root, "inside/escape.bin"));
  source.items[0]!.asset = "inside/escape.bin";
  expect((await verifyDataset(source, root)).gaps.some((gap) => gap.code === "missing-asset")).toBe(
    true,
  );
});

test("unknown publications, duplicate recensions and forbidden citations stay incomplete", async () => {
  const { catalog, reports } = await allFamilies(await fixture());
  catalog.families.find((item) => item.family === "weekly_shonen_jump")!.expectedIds = [];
  reports.push(reports.find((item) => item.manifest.family === "guides")!);
  const report = auditDatasetCoverage(catalog, reports, { asOf, editorialFrozen: false });
  expect(report.coverageComplete).toBe(false);
  expect(report.gaps.some((gap) => gap.code === "empty-family-enumeration")).toBe(true);
  expect(
    report.gaps.some(
      (gap) => gap.family === "guides" && gap.code === "missing-or-duplicate-manifest",
    ),
  ).toBe(true);
  const source = manifest("interview");
  source.citation = "https://web.archive.org/web/202001/https://dragonball.fandom.com/wiki/Test";
  await expect(verifyDataset(source, "/unused")).rejects.toThrow();
  source.citation = "https://user:password@www.shueisha.co.jp/";
  await expect(verifyDataset(source, "/unused")).rejects.toThrow();
  source.citation = "https://dragonball.fandom.com./wiki/Test";
  await expect(verifyDataset(source, "/unused")).rejects.toThrow();
  source.citation =
    "https://web.archive.org/web/202001/https%253A%252F%252Fdragonball.fandom.com%252Fwiki%252FTest";
  await expect(verifyDataset(source, "/unused")).rejects.toThrow();
});
