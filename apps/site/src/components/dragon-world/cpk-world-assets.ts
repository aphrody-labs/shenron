// SPDX-License-Identifier: Apache-2.0
import { inspectXv2StageLayout, type Xv2StageLayoutInfo } from "@aphrody/shenron-engine/glb-scene";
import {
  fetchBytes,
  sceneUrl,
  type SceneEntry,
  type SceneIndex,
} from "../../app/games/dragon-pixel/cpk-scene";

export const MAX_STAGE_PARTS = 512;
export const MAX_STAGE_BYTES = 384 * 1024 * 1024;
export const STAGE_FETCH_CONCURRENCY = 4;
const INDEX_PAGE_SIZE = 10_000;

export interface CpkStagePart {
  path: string;
  nsk: SceneEntry;
  emb?: SceneEntry;
  emm?: SceneEntry;
}

export interface CpkStage {
  archive: string;
  /** Original CPK directory code; no inferred location name. */
  id: string;
  parts: CpkStagePart[];
  /** Unique model, texture and material entries, decompressed size in bytes. */
  bytes: number;
  map?: SceneEntry;
  eve?: SceneEntry;
  /** Shared exhaustive archive TOC, required for cross-directory FMP references. */
  catalogue?: readonly SceneEntry[];
}

export interface CpkWorldPartBytes {
  nsk: Uint8Array;
  emb?: Uint8Array;
  emm?: Uint8Array;
  instances?: Float32Array[];
}

export interface CpkStageScene {
  parts: CpkWorldPartBytes[];
  spawns: Xv2StageLayoutInfo["spawns"];
  layoutSource?: string;
  lodIndex: number;
}

export class StageResourceError extends Error {
  constructor(
    readonly reason: "index" | "empty" | "parts" | "bytes" | "layout" | "reference" | "instances",
  ) {
    super(`CPK stage resource limit: ${reason}`);
    this.name = "StageResourceError";
  }
}

function validEntry(entry: SceneEntry): boolean {
  return (
    entry !== null &&
    typeof entry === "object" &&
    typeof entry.path === "string" &&
    /^data\/stage\/[^/]+(?:\/[^/]+)?$/i.test(entry.path) &&
    !entry.path.split("/").some((part) => part === "." || part === ".." || /[\\\0]/.test(part)) &&
    Number.isSafeInteger(entry.extract_size) &&
    entry.extract_size >= 0
  );
}

function uniqueResources(stage: CpkStage): SceneEntry[] {
  const resources = new Map<string, SceneEntry>();
  for (const part of stage.parts) {
    for (const entry of [part.nsk, part.emb, part.emm]) {
      if (entry) resources.set(entry.path.toLowerCase(), entry);
    }
  }
  return [...resources.values()];
}

/** Preserve every NSK in a stage, including its original grass, LOD and object parts. */
export function stagesFromEntries(archive: string, entries: readonly SceneEntry[]): CpkStage[] {
  // Reuse the same archive/path validation as the public CPK consumer.
  sceneUrl(archive, "find");
  const byPath = new Map(
    entries.filter(validEntry).map((entry) => [entry.path.toLowerCase(), entry]),
  );
  const stages = new Map<string, CpkStage>();
  for (const entry of byPath.values()) {
    if (!entry.path.toLowerCase().endsWith(".nsk")) continue;
    if (entry.path.split("/").length !== 4) continue;
    const id = entry.path.split("/")[2]!;
    const key = id.toLowerCase();
    const stage = stages.get(key) ?? { archive, id, parts: [], bytes: 0 };
    const stem = entry.path.slice(0, -4).toLowerCase();
    // Split meshes such as BFtok01_00.nsk share the observed BFtok01.emb bank.
    // Resolve only underscore-delimited parents that actually exist in this TOC.
    let textureStem = stem;
    let emb = byPath.get(`${textureStem}.emb`);
    while (!emb && textureStem.lastIndexOf("_") > textureStem.lastIndexOf("/")) {
      textureStem = textureStem.slice(0, textureStem.lastIndexOf("_"));
      emb = byPath.get(`${textureStem}.emb`);
    }
    stage.parts.push({
      path: entry.path,
      nsk: entry,
      emb,
      emm: byPath.get(`${stem}.emm`),
    });
    stages.set(key, stage);
  }
  for (const entry of byPath.values()) {
    const match = /^data\/stage\/([^/]+)\.map$/i.exec(entry.path);
    if (!match || /_(?:EVE|QST|CMB)$/i.test(match[1]!)) continue;
    const id = match[1]!;
    const key = id.toLowerCase();
    const stage = stages.get(key) ?? { archive, id, parts: [], bytes: 0 };
    stage.map = entry;
    stage.eve = byPath.get(`data/stage/${id}_eve.map`.toLowerCase());
    stages.set(key, stage);
  }
  const catalogue = [...byPath.values()];
  return [...stages.values()]
    .map((stage) => {
      stage.parts.sort((a, b) => a.path.localeCompare(b.path));
      stage.bytes = uniqueResources(stage).reduce((sum, entry) => sum + entry.extract_size, 0);
      stage.catalogue = catalogue;
      return stage;
    })
    .toSorted((a, b) => a.id.localeCompare(b.id));
}

/** Paginate the real public TOC; never assume a single server page is exhaustive. */
export async function discoverStages(archive: string, signal: AbortSignal): Promise<CpkStage[]> {
  const entries: SceneEntry[] = [];
  let offset = 0;
  let total = 0;
  do {
    signal.throwIfAborted();
    const query = new URLSearchParams({
      q: "data/stage/*",
      limit: String(INDEX_PAGE_SIZE),
      offset: String(offset),
    });
    const response = await fetch(`${sceneUrl(archive, "find")}?${query}`, {
      signal: AbortSignal.any([signal, AbortSignal.timeout(60_000)]),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const index = (await response.json()) as SceneIndex;
    if (
      !Array.isArray(index.entries) ||
      !Number.isSafeInteger(index.total) ||
      index.total < 0 ||
      index.total > 1_000_000 ||
      index.offset !== offset ||
      index.entries.length > INDEX_PAGE_SIZE ||
      (index.entries.length === 0 && offset < index.total)
    )
      throw new StageResourceError("index");
    entries.push(...index.entries);
    offset += index.entries.length;
    total = index.total;
  } while (offset < total);
  return stagesFromEntries(archive, entries);
}

/** Prefer the real tournament stage when present; no invented location or resource. */
export function defaultStage(stages: readonly CpkStage[]): CpkStage | undefined {
  const eligible = stages.filter((stage) =>
    stage.map
      ? stage.map.extract_size <= MAX_STAGE_BYTES
      : stage.parts.length > 0 &&
        stage.parts.length <= MAX_STAGE_PARTS &&
        stage.bytes <= MAX_STAGE_BYTES,
  );
  return (
    eligible.find((stage) => stage.id === "BFtok") ??
    eligible.find((stage) => stage.id === "COMa") ??
    eligible.toSorted((a, b) => a.bytes - b.bytes)[0]
  );
}

/** Four requests total in flight; reject oversized stages instead of silently omitting parts. */
export async function loadStage(
  stage: CpkStage,
  signal: AbortSignal,
  onProgress?: (loaded: number, total: number) => void,
): Promise<CpkWorldPartBytes[]> {
  return (await loadStageScene(stage, signal, onProgress)).parts;
}

/** Resolve the native FMP's stage-root-relative reference against the observed TOC only. */
export function resolveStageReference(
  reference: string,
  catalogue: readonly SceneEntry[],
): SceneEntry {
  const normalized = reference.replaceAll("\\", "/");
  if (
    normalized
      .split("/")
      .some((part) => !part || part === "." || part === ".." || /[\0:]/.test(part))
  )
    throw new StageResourceError("reference");
  const path = normalized.toLowerCase().startsWith("data/stage/")
    ? normalized
    : `data/stage/${normalized}`;
  const matches = catalogue.filter((entry) => entry.path.toLowerCase() === path.toLowerCase());
  if (matches.length !== 1 || !validEntry(matches[0]!)) throw new StageResourceError("reference");
  return matches[0]!;
}

/** Group only identical native resource triples; retain every original instance matrix. */
export function stagePartsFromLayout(layout: Xv2StageLayoutInfo, catalogue: readonly SceneEntry[]) {
  const grouped = new Map<string, CpkStagePart & { instances: Float32Array[] }>();
  if (
    !Number.isSafeInteger(layout.lodIndex) ||
    layout.lodIndex < 0 ||
    layout.instances.length > 16_384
  )
    throw new StageResourceError("instances");
  for (const instance of layout.instances) {
    const get = (kind: "nsk" | "emb" | "emm", index: number | undefined) => {
      if (index === undefined) return undefined;
      if (!Number.isSafeInteger(index) || index < 0 || !layout.resources[kind][index])
        throw new StageResourceError("reference");
      const entry = resolveStageReference(layout.resources[kind][index]!, catalogue);
      if (!entry.path.toLowerCase().endsWith(`.${kind}`)) throw new StageResourceError("reference");
      return entry;
    };
    const nsk = get("nsk", instance.nsk);
    if (!nsk || instance.matrix.length !== 16 || !instance.matrix.every(Number.isFinite))
      throw new StageResourceError("layout");
    const emb = get("emb", instance.emb),
      emm = get("emm", instance.emm);
    const key = JSON.stringify([
      nsk.path.toLowerCase(),
      emb?.path.toLowerCase(),
      emm?.path.toLowerCase(),
    ]);
    const part = grouped.get(key) ?? { path: nsk.path, nsk, emb, emm, instances: [] };
    const matrix = new Float32Array(instance.matrix);
    if (!matrix.every(Number.isFinite)) throw new StageResourceError("layout");
    part.instances.push(matrix);
    if (part.instances.length > 4096) throw new StageResourceError("instances");
    grouped.set(key, part);
  }
  return [...grouped.values()];
}

/** Native placements and resource pairings take precedence over folder-only exploration. */
export async function loadStageScene(
  stage: CpkStage,
  signal: AbortSignal,
  onProgress?: (loaded: number, total: number) => void,
  lodIndex = 0,
): Promise<CpkStageScene> {
  signal.throwIfAborted();
  if (!Number.isSafeInteger(lodIndex) || lodIndex < 0) throw new StageResourceError("layout");
  let parts: (CpkStagePart & { instances?: Float32Array[] })[] = stage.parts;
  const spawns: Xv2StageLayoutInfo["spawns"] = [];
  let manifestBytes = 0;
  for (const manifest of [stage.map, stage.eve]) {
    if (!manifest || (!stage.map && manifest === stage.eve)) continue;
    if (
      !stage.catalogue?.some(
        (entry) => entry.path === manifest.path && entry.extract_size === manifest.extract_size,
      )
    )
      throw new StageResourceError("reference");
    if (!validEntry(manifest) || manifest.extract_size > MAX_STAGE_BYTES)
      throw new StageResourceError("index");
    manifestBytes += manifest.extract_size;
    if (manifestBytes > MAX_STAGE_BYTES) throw new StageResourceError("bytes");
    const bytes = await fetchBytes(sceneUrl(stage.archive, "raw", manifest.path), signal);
    if (bytes.length !== manifest.extract_size) throw new StageResourceError("index");
    const layout = await inspectXv2StageLayout(bytes, lodIndex);
    signal.throwIfAborted();
    if (layout.lodIndex !== lodIndex) throw new StageResourceError("layout");
    if (manifest === stage.map) parts = stagePartsFromLayout(layout, stage.catalogue ?? []);
    for (const spawn of layout.spawns) {
      if (
        typeof spawn.name !== "string" ||
        spawn.matrix.length !== 16 ||
        !spawn.matrix.every(Number.isFinite)
      )
        throw new StageResourceError("layout");
      spawns.push(spawn);
    }
  }
  if (parts.length === 0) throw new StageResourceError("empty");
  if (parts.length > MAX_STAGE_PARTS) throw new StageResourceError("parts");
  const resources = uniqueResources({ ...stage, parts });
  if (resources.some((entry) => !validEntry(entry))) throw new StageResourceError("index");
  const declaredBytes = resources.reduce((sum, entry) => sum + entry.extract_size, manifestBytes);
  if (!Number.isSafeInteger(declaredBytes) || declaredBytes > MAX_STAGE_BYTES)
    throw new StageResourceError("bytes");
  const controller = new AbortController();
  const combined = AbortSignal.any([signal, controller.signal]);
  const loaded = new Map<string, Uint8Array>();
  let cursor = 0;
  let completed = 0;
  let actualBytes = manifestBytes;
  onProgress?.(0, resources.length);
  const worker = async () => {
    while (cursor < resources.length) {
      combined.throwIfAborted();
      const entry = resources[cursor++]!;
      const bytes = await fetchBytes(sceneUrl(stage.archive, "raw", entry.path), combined);
      if (bytes.length !== entry.extract_size) throw new StageResourceError("index");
      actualBytes += bytes.length;
      if (actualBytes > MAX_STAGE_BYTES) throw new StageResourceError("bytes");
      loaded.set(entry.path.toLowerCase(), bytes);
      onProgress?.(++completed, resources.length);
    }
  };
  try {
    await Promise.all(
      Array.from({ length: Math.min(STAGE_FETCH_CONCURRENCY, resources.length) }, worker),
    );
    signal.throwIfAborted();
    return {
      parts: parts.map((part) => ({
        nsk: loaded.get(part.nsk.path.toLowerCase())!,
        emb: part.emb ? loaded.get(part.emb.path.toLowerCase()) : undefined,
        emm: part.emm ? loaded.get(part.emm.path.toLowerCase()) : undefined,
        instances: part.instances,
      })),
      spawns,
      layoutSource: stage.map?.path,
      lodIndex,
    };
  } catch (error) {
    controller.abort();
    throw error;
  }
}
