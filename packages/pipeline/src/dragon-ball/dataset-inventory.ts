// SPDX-License-Identifier: Apache-2.0
/** Read private evidence into a metadata-only coverage report; no acquisition or deposition. */
import { readFile, realpath, stat } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";
import { createDatabooksFreezeGate } from "@shenron/db/guards";
import {
  auditDatasetCoverage,
  datasetCatalogSchema,
  datasetManifestSchema,
  verifyDataset,
  type DatasetManifest,
  type VerifiedDataset,
} from "./source-coverage";

export interface DatasetInventoryOptions {
  catalogPath: string;
  manifestRoot: string;
  assetRoot: string;
  repoRoot: string;
  freezeFile?: string;
  asOf?: string;
}
export interface DatasetUnavailable {
  family: DatasetManifest["family"] | null;
  datasetId: string | null;
  code:
    | "catalog-unavailable"
    | "invalid-catalog"
    | "manifest-unavailable"
    | "manifest-outside-root"
    | "invalid-manifest"
    | "manifest-identity-mismatch"
    | "asset-verification-unavailable";
}
export interface DatasetInventory {
  coverage: ReturnType<typeof auditDatasetCoverage>;
  /** Private in-process evidence. Public reports must serialize coverage/unavailable only. */
  verifiedDatasets: VerifiedDataset[];
  unavailable: DatasetUnavailable[];
}
export interface DatasetFreezeState {
  frozen: boolean;
  reason: "doctrine-unavailable" | "doctrine-frozen" | "runtime-frozen" | null;
}

async function readBoundedJson(path: string, maxBytes: number): Promise<unknown> {
  const info = await stat(path);
  if (!info.isFile() || info.size > maxBytes) throw new Error("Invalid metadata file");
  const bytes = await readFile(path);
  if (bytes.byteLength > maxBytes) throw new Error("Metadata file exceeds bound");
  return JSON.parse(bytes.toString("utf8"));
}

/** Only an explicit unfrozen doctrine plus the existing runtime gate can release writes. */
export async function resolveDatasetEditorialFreeze(options: {
  repoRoot: string;
  freezeFile?: string;
}): Promise<DatasetFreezeState> {
  try {
    const path = resolve(options.repoRoot, "docs/reference/root/PLAN.md");
    const info = await stat(path);
    if (!info.isFile() || info.size > 1024 * 1024)
      return { frozen: true, reason: "doctrine-unavailable" };
    const plan = await readFile(path, "utf8");
    const block = plan.match(/```json\s*([\s\S]*?)```/);
    if (!block) return { frozen: true, reason: "doctrine-unavailable" };
    const doctrine: unknown = JSON.parse(block[1]!);
    if (
      typeof doctrine !== "object" ||
      doctrine === null ||
      !("freeze" in doctrine) ||
      typeof doctrine.freeze !== "object" ||
      doctrine.freeze === null ||
      !("databooks" in doctrine.freeze)
    )
      return { frozen: true, reason: "doctrine-unavailable" };
    if (doctrine.freeze.databooks !== false) return { frozen: true, reason: "doctrine-frozen" };
    const frozen = createDatabooksFreezeGate({
      freezeFile:
        options.freezeFile ??
        process.env.DATABOOKS_FREEZE_FILE ??
        resolve(options.repoRoot, ".coord/FREEZE-databooks.json"),
      production: true,
    }).state().frozen;
    return { frozen, reason: frozen ? "runtime-frozen" : null };
  } catch {
    return { frozen: true, reason: "doctrine-unavailable" };
  }
}

function inside(root: string, path: string): boolean {
  const local = relative(root, path);
  return (
    local !== ".." && !local.startsWith("../") && !local.startsWith("..\\") && !isAbsolute(local)
  );
}

/** Missing sources never abort the remaining family inventory or become an approval. */
export async function loadDatasetInventory(
  options: DatasetInventoryOptions,
): Promise<DatasetInventory> {
  const asOf = options.asOf ?? new Date().toISOString().slice(0, 10);
  const editorialFrozen = (await resolveDatasetEditorialFreeze(options)).frozen;
  const verifiedDatasets: VerifiedDataset[] = [];
  const unavailable: DatasetUnavailable[] = [];
  let catalog = { version: 1 as const, asOf, families: [] } as ReturnType<
    typeof datasetCatalogSchema.parse
  >;
  let raw: unknown;
  try {
    raw = await readBoundedJson(options.catalogPath, 16 * 1024 * 1024);
  } catch {
    unavailable.push({ family: null, datasetId: null, code: "catalog-unavailable" });
    return {
      coverage: auditDatasetCoverage(catalog, verifiedDatasets, { asOf, editorialFrozen }),
      verifiedDatasets,
      unavailable,
    };
  }
  const parsed = datasetCatalogSchema.safeParse(raw);
  if (!parsed.success) {
    unavailable.push({ family: null, datasetId: null, code: "invalid-catalog" });
    return {
      coverage: auditDatasetCoverage(catalog, verifiedDatasets, { asOf, editorialFrozen }),
      verifiedDatasets,
      unavailable,
    };
  }
  catalog = parsed.data;
  let root: string | null = null;
  try {
    root = await realpath(options.manifestRoot);
  } catch {
    /* Account for every expected source below. */
  }
  const seen = new Set<string>();
  for (const entry of catalog.families) {
    for (const id of entry.expectedIds) {
      const identity = `${entry.family}/${id}`;
      if (seen.has(identity)) continue;
      seen.add(identity);
      const reject = (code: DatasetUnavailable["code"]) =>
        unavailable.push({ family: entry.family, datasetId: id, code });
      if (!root) {
        reject("manifest-unavailable");
        continue;
      }
      let path: string;
      try {
        path = await realpath(resolve(root, entry.family, `${id}.json`));
      } catch {
        reject("manifest-unavailable");
        continue;
      }
      if (!inside(root, path)) {
        reject("manifest-outside-root");
        continue;
      }
      let value: unknown;
      try {
        value = await readBoundedJson(path, 64 * 1024 * 1024);
      } catch {
        reject("invalid-manifest");
        continue;
      }
      const manifest = datasetManifestSchema.safeParse(value);
      if (!manifest.success) {
        reject("invalid-manifest");
        continue;
      }
      if (manifest.data.id !== id || manifest.data.family !== entry.family) {
        reject("manifest-identity-mismatch");
        continue;
      }
      try {
        verifiedDatasets.push(await verifyDataset(manifest.data, options.assetRoot));
      } catch {
        reject("asset-verification-unavailable");
      }
    }
  }
  return {
    coverage: auditDatasetCoverage(catalog, verifiedDatasets, { asOf, editorialFrozen }),
    verifiedDatasets,
    unavailable,
  };
}
