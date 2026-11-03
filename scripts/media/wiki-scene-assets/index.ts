#!/usr/bin/env bun
// SPDX-License-Identifier: Apache-2.0
import { mkdir, open, readdir, rename, rm } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { encoderPng } from "../../../plugin/skills/toriyama-svg/scripts/png";
import { extractNativeFrame, nativeVideo, validateVideoTime, type VideoMetadata } from "./video";

type Provenance = {
  kind: "official" | "fan-colorization" | "authored-decoration" | "catalogue-unverified";
  referenceUrl: string;
  note: string;
  chapter?: number;
  page?: number;
  episodeId?: number;
  requestedTimeSec?: number;
  reportedTimeSec?: number;
  timeBasis?: "decoder-reported" | "existing-extraction-label";
};
export type SceneManifest = {
  schema: "shenron-wiki-scene-assets/v1";
  sources: {
    id: string;
    path: string;
    sha256: string;
    width: number;
    height: number;
    provenance: Provenance;
    video?: { requestedTimeSec: number };
  }[];
  crops: {
    id: string;
    sourceId: string;
    rect: { left: number; top: number; width: number; height: number };
    usage: ("background" | "wallpaper" | "sprite")[];
  }[];
  sheets: { id: string; items: string[]; columns: number; padding: number }[];
};
function object(value: unknown, fields: string[]): Record<string, unknown> {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.keys(value).some((key) => !fields.includes(key))
  )
    throw new Error("Invalid object fields");
  return value as Record<string, unknown>;
}
function text(value: unknown): string {
  if (typeof value !== "string" || !value.length || value.length > 4000)
    throw new Error("Invalid string");
  return value;
}
function identifier(value: unknown): string {
  const result = text(value);
  if (!/^[a-z][a-z0-9-]{0,79}$/.test(result)) throw new Error("Invalid id");
  return result;
}
function number(value: unknown, min: number, max: number, integer = true): number {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < min ||
    value > max ||
    (integer && !Number.isInteger(value))
  )
    throw new Error("Invalid number");
  return value;
}
function array(value: unknown, min: number, max: number): unknown[] {
  if (!Array.isArray(value) || value.length < min || value.length > max)
    throw new Error("Invalid array");
  return value;
}
function choice<const T extends string>(value: unknown, choices: readonly T[]): T {
  if (typeof value !== "string" || !choices.includes(value as T)) throw new Error("Invalid choice");
  return value as T;
}
function parseManifest(input: unknown): SceneManifest {
  const m = object(input, ["schema", "sources", "crops", "sheets"]);
  if (m.schema !== "shenron-wiki-scene-assets/v1") throw new Error("Invalid manifest schema");
  return {
    schema: m.schema,
    sources: array(m.sources, 1, 32).map((value) => {
      const s = object(value, ["id", "path", "sha256", "width", "height", "provenance", "video"]);
      const p = object(s.provenance, [
        "kind",
        "referenceUrl",
        "note",
        "chapter",
        "page",
        "episodeId",
        "requestedTimeSec",
        "reportedTimeSec",
        "timeBasis",
      ]);
      const provenance: Provenance = {
        kind: choice(p.kind, [
          "official",
          "fan-colorization",
          "authored-decoration",
          "catalogue-unverified",
        ]),
        referenceUrl: text(p.referenceUrl),
        note: text(p.note),
      };
      if (!["https:", "http:"].includes(new URL(provenance.referenceUrl).protocol))
        throw new Error("Invalid reference URL");
      for (const key of ["chapter", "page", "episodeId"] as const)
        if (p[key] !== undefined) provenance[key] = number(p[key], 1, 1_000_000);
      for (const key of ["requestedTimeSec", "reportedTimeSec"] as const)
        if (p[key] !== undefined) provenance[key] = number(p[key], 0, 86400, false);
      if (p.timeBasis !== undefined)
        provenance.timeBasis = choice(p.timeBasis, [
          "decoder-reported",
          "existing-extraction-label",
        ]);
      const sha256 = text(s.sha256);
      if (!/^[a-f0-9]{64}$/.test(sha256)) throw new Error("Invalid source SHA");
      let video: { requestedTimeSec: number } | undefined;
      if (s.video !== undefined) {
        const v = object(s.video, ["requestedTimeSec"]);
        video = { requestedTimeSec: number(v.requestedTimeSec, 0, 86400, false) };
        if (
          provenance.requestedTimeSec !== undefined ||
          provenance.reportedTimeSec !== undefined ||
          provenance.timeBasis !== undefined
        )
          throw new Error("Video time evidence must come from the native decoder");
      }
      const source: SceneManifest["sources"][number] = {
        id: identifier(s.id),
        path: text(s.path),
        sha256,
        width: number(s.width, 1, 16384),
        height: number(s.height, 1, 16384),
        provenance,
      };
      if (video) source.video = video;
      return source;
    }),
    crops: array(m.crops, 1, 128).map((value) => {
      const c = object(value, ["id", "sourceId", "rect", "usage"]);
      const r = object(c.rect, ["left", "top", "width", "height"]);
      return {
        id: identifier(c.id),
        sourceId: identifier(c.sourceId),
        rect: {
          left: number(r.left, 0, 16384),
          top: number(r.top, 0, 16384),
          width: number(r.width, 1, 16384),
          height: number(r.height, 1, 16384),
        },
        usage: array(c.usage, 1, 3).map((v) => choice(v, ["background", "wallpaper", "sprite"])),
      };
    }),
    sheets: array(m.sheets, 0, 16).map((value) => {
      const s = object(value, ["id", "items", "columns", "padding"]);
      return {
        id: identifier(s.id),
        items: array(s.items, 1, 128).map(identifier),
        columns: number(s.columns, 1, 16),
        padding: s.padding === undefined ? 2 : number(s.padding, 0, 32),
      };
    }),
  };
}
const MAX_PIXELS = 16_000_000;
export const sha256 = (bytes: Uint8Array) => Bun.CryptoHasher.hash("sha256", bytes, "hex");
const json = (value: unknown) => new TextEncoder().encode(JSON.stringify(value, null, 2) + "\n");
type Output = { path: string; sha256: string; bytes: number; width?: number; height?: number };
type Receipt = {
  schema: "shenron-wiki-scene-receipt/v1";
  manifestSha256: string;
  runtime: { version: string; revision: string };
  sources: SceneManifest["sources"];
  crops: SceneManifest["crops"];
  outputs: Output[];
  videoFrames?: {
    sourceId: string;
    sourceSha256: string;
    sourceBytes: number;
    requestedTimeSec: number;
    reportedTimeSec: number;
    timeBasis: "decoder-reported";
    metadata: VideoMetadata;
    path: string;
    sha256: string;
    bytes: number;
  }[];
};
function unique(values: string[], label: string) {
  if (new Set(values).size !== values.length) throw new Error(`Duplicate ${label}`);
}
export function validateManifest(input: unknown): SceneManifest {
  const manifest = parseManifest(input);
  unique(
    manifest.sources.map((s) => s.id),
    "source",
  );
  unique([...manifest.crops.map((c) => c.id), ...manifest.sheets.map((s) => s.id)], "output id");
  for (const source of manifest.sources) {
    if (source.width * source.height > MAX_PIXELS)
      throw new Error(`Source pixel limit: ${source.id}`);
    if (
      source.provenance.episodeId &&
      !source.video &&
      (source.provenance.requestedTimeSec === undefined || !source.provenance.timeBasis)
    )
      throw new Error(`Missing episode time provenance: ${source.id}`);
    if (
      source.provenance.timeBasis === "decoder-reported" &&
      source.provenance.reportedTimeSec === undefined
    )
      throw new Error(`Missing decoded time: ${source.id}`);
  }
  for (const crop of manifest.crops) {
    const source = manifest.sources.find((s) => s.id === crop.sourceId);
    if (
      !source ||
      crop.rect.left + crop.rect.width > source.width ||
      crop.rect.top + crop.rect.height > source.height
    )
      throw new Error(`Crop outside source: ${crop.id}`);
  }
  if (
    manifest.sources.reduce((sum, source) => sum + source.width * source.height, 0) >
      MAX_PIXELS * 2 ||
    manifest.crops.reduce((sum, crop) => sum + crop.rect.width * crop.rect.height, 0) >
      MAX_PIXELS * 2
  )
    throw new Error("Manifest aggregate pixel limit");
  for (const sheet of manifest.sheets) {
    if (sheet.id === "receipt") throw new Error("Reserved sheet id: receipt");
    unique(sheet.items, "sheet item");
    if (sheet.items.some((name) => !manifest.crops.some((c) => c.id === name)))
      throw new Error(`Unknown sheet crop: ${sheet.id}`);
  }
  let preparedPixels =
    manifest.crops.reduce((sum, c) => sum + c.rect.width * c.rect.height, 0) +
    manifest.sources.filter((s) => s.video).reduce((sum, s) => sum + s.width * s.height, 0);
  if (manifest.sources.filter((s) => s.video).length > 8)
    throw new Error("Video frame count limit");
  for (const sheet of manifest.sheets) {
    const cells = sheet.items.map((name) => manifest.crops.find((c) => c.id === name)!);
    const columns = Math.min(sheet.columns, cells.length);
    const width = columns * (Math.max(...cells.map((c) => c.rect.width)) + sheet.padding * 2);
    const height =
      Math.ceil(cells.length / columns) *
      (Math.max(...cells.map((c) => c.rect.height)) + sheet.padding * 2);
    if (width > 16384 || height > 16384 || width * height > MAX_PIXELS)
      throw new Error(`Atlas pixel limit: ${sheet.id}`);
    preparedPixels += width * height;
  }
  if (preparedPixels > MAX_PIXELS * 2) throw new Error("Prepared output aggregate pixel limit");
  return manifest;
}
function inside(parent: string, path: string) {
  const rel = relative(parent, path);
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}
type NativeImage = Bun.Image & {
  extract(rect: { left: number; top: number; width: number; height: number }): NativeImage;
  rgba(): Promise<{ width: number; height: number; channels: number; data: Uint8Array }>;
};
type VerifiedVideo = {
  decoder: ReturnType<typeof nativeVideo>;
  metadata: VideoMetadata;
  sourceBytes: number;
};
export async function run(manifestPath: string, outputPath: string, check = false) {
  const manifestAbsolute = resolve(manifestPath);
  const manifestFile = Bun.file(manifestAbsolute);
  if (manifestFile.size > 256_000) throw new Error("Manifest too large");
  const manifestBytes = await manifestFile.bytes();
  const manifest = validateManifest(JSON.parse(new TextDecoder().decode(manifestBytes)));
  const out = resolve(outputPath);
  const sourceData = new Map<string, Uint8Array>();
  const videoSources = new Map<string, VerifiedVideo>();
  const verifiedVideos = new Map<string, { sha256: string; value: VerifiedVideo }>();
  let sourceBytes = 0;
  let videoBytes = 0;
  for (const source of manifest.sources) {
    const path = resolve(dirname(manifestAbsolute), source.path);
    if (inside(out, path)) throw new Error(`Source inside output: ${source.id}`);
    const file = Bun.file(path);
    if (source.video) {
      if (file.size < 1 || file.size > 1024 ** 3)
        throw new Error(`Video source byte limit: ${source.id}`);
      let verified = verifiedVideos.get(path);
      if (!verified) {
        videoBytes += file.size;
        if (videoBytes > 2 * 1024 ** 3) throw new Error("Aggregate video byte limit");
        const hasher = new Bun.CryptoHasher("sha256");
        for await (const chunk of file.stream()) hasher.update(chunk);
        const digest = hasher.digest("hex");
        if (digest !== source.sha256) throw new Error(`Source SHA mismatch: ${source.id}`);
        const decoder = nativeVideo(path);
        const metadata = await decoder.metadata();
        verified = { sha256: digest, value: { decoder, metadata, sourceBytes: file.size } };
        verifiedVideos.set(path, verified);
      }
      if (verified.sha256 !== source.sha256) throw new Error(`Source SHA mismatch: ${source.id}`);
      const { metadata } = verified.value;
      if (metadata.width !== source.width || metadata.height !== source.height)
        throw new Error(`Source dimensions mismatch: ${source.id}`);
      validateVideoTime(metadata, source.video.requestedTimeSec);
      videoSources.set(source.id, verified.value);
      continue;
    }
    if (file.size < 1 || file.size > 64_000_000) throw new Error(`Source byte limit: ${source.id}`);
    sourceBytes += file.size;
    if (sourceBytes > 128_000_000) throw new Error("Manifest aggregate source byte limit");
    const bytes = await file.bytes();
    if (sha256(bytes) !== source.sha256) throw new Error(`Source SHA mismatch: ${source.id}`);
    const metadata = await new Bun.Image(bytes, { maxPixels: MAX_PIXELS }).metadata();
    if (metadata.width !== source.width || metadata.height !== source.height)
      throw new Error(`Source dimensions mismatch: ${source.id}`);
    sourceData.set(source.id, bytes);
  }
  const identity = {
    manifestSha256: sha256(manifestBytes),
    runtime: { version: Bun.version, revision: Bun.revision },
  };
  const lockPath = join(out, ".export.lock");
  if (check) {
    if (await Bun.file(lockPath).exists()) throw new Error("Output directory is locked");
    return exportAssets(manifest, sourceData, videoSources, out, identity, true);
  }
  await mkdir(out, { recursive: true });
  const lock = await open(lockPath, "wx").catch(() => {
    throw new Error(
      "Output directory is locked; inspect stale lock manually after a process crash",
    );
  });
  try {
    await lock.writeFile(JSON.stringify({ pid: process.pid, ...identity }) + "\n");
    return await exportAssets(manifest, sourceData, videoSources, out, identity, false);
  } finally {
    await lock.close();
    await rm(lockPath, { force: true });
  }
}
async function exportAssets(
  manifest: SceneManifest,
  sourceData: Map<string, Uint8Array>,
  videoSources: Map<string, VerifiedVideo>,
  out: string,
  identity: ReceiptIdentity,
  check: boolean,
) {
  const receiptPath = join(out, "receipt.json");
  const pendingPath = join(out, ".pending.json");
  const expected = [
    ...manifest.sources.filter((s) => s.video).map((s) => `${s.id}.source.png`),
    ...manifest.crops.map((c) => `${c.id}.png`),
    ...manifest.sheets.flatMap((s) => [`${s.id}.png`, `${s.id}.json`]),
  ];
  const pending = { schema: "shenron-wiki-scene-pending/v1", ...identity, expected };
  const entries = await readdir(out).catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") return [];
    throw error;
  });
  const allowed = new Set([
    ...expected,
    "receipt.json",
    ".pending.json",
    ".export.lock",
    ...[...expected, "receipt.json", ".pending.json"].map((path) => `${path}.tmp`),
  ]);
  if (entries.some((path) => !allowed.has(path)))
    throw new Error("Foreign file in output directory");
  const pendingFile = Bun.file(pendingPath);
  if (await pendingFile.exists()) {
    if (sha256(await pendingFile.bytes()) !== sha256(json(pending)))
      throw new Error("Pending identity differs; choose a new output directory");
  }
  const previousFile = Bun.file(receiptPath);
  if (await previousFile.exists()) {
    const previous: Receipt = await previousFile.json();
    if (
      previous.schema !== "shenron-wiki-scene-receipt/v1" ||
      previous.manifestSha256 !== identity.manifestSha256 ||
      previous.runtime.version !== identity.runtime.version ||
      previous.runtime.revision !== identity.runtime.revision
    )
      throw new Error("Receipt identity differs; choose a new output directory");
    if (
      previous.outputs.length !== expected.length ||
      previous.outputs.some((o) => !expected.includes(o.path))
    )
      throw new Error("Receipt output inventory differs");
    unique(
      previous.outputs.map((o) => o.path),
      "receipt output",
    );
    let valid = true;
    for (const output of previous.outputs) {
      const file = Bun.file(join(out, output.path));
      if (
        !(await file.exists()) ||
        file.size !== output.bytes ||
        sha256(await file.bytes()) !== output.sha256
      )
        valid = false;
    }
    if (valid)
      return {
        status: check ? "checked" : "reused",
        receiptSha256: sha256(await previousFile.bytes()),
        outputs: previous.outputs,
      };
    if (check) throw new Error("Output missing or SHA mismatch");
  } else {
    if (check) throw new Error("Receipt missing");
    if (!(await pendingFile.exists()) && entries.some((path) => path !== ".export.lock"))
      throw new Error("Output directory must be empty or have a matching pending marker");
  }
  // Prepare every byte before writing; failed source validation never creates outputs.
  const prepared = new Map<string, { bytes: Uint8Array; width?: number; height?: number }>();
  const videoFrames: NonNullable<Receipt["videoFrames"]> = [];
  for (const source of manifest.sources) {
    if (!source.video) continue;
    const verified = videoSources.get(source.id)!;
    const frame = await extractNativeFrame(
      verified.decoder,
      verified.metadata,
      source.video.requestedTimeSec,
    );
    const path = `${source.id}.source.png`;
    sourceData.set(source.id, frame.bytes);
    prepared.set(path, { bytes: frame.bytes, width: source.width, height: source.height });
    videoFrames.push({
      sourceId: source.id,
      sourceSha256: source.sha256,
      sourceBytes: verified.sourceBytes,
      requestedTimeSec: source.video.requestedTimeSec,
      reportedTimeSec: frame.time,
      timeBasis: "decoder-reported",
      metadata: verified.metadata,
      path,
      sha256: sha256(frame.bytes),
      bytes: frame.bytes.length,
    });
  }
  const cropPixels = new Map<string, { width: number; height: number; data: Uint8Array }>();
  for (const crop of manifest.crops) {
    const bytes = sourceData.get(crop.sourceId)!;
    const native = new Bun.Image(bytes, { maxPixels: MAX_PIXELS }) as NativeImage;
    if (typeof native.rgba !== "function" || typeof native.extract !== "function")
      throw new Error("Qualified native Bun.Image extraction required");
    const pixels = await native.extract(crop.rect).rgba();
    if (
      pixels.channels !== 4 ||
      pixels.width !== crop.rect.width ||
      pixels.height !== crop.rect.height ||
      pixels.data.length !== pixels.width * pixels.height * 4
    )
      throw new Error(`Invalid native crop: ${crop.id}`);
    cropPixels.set(crop.id, pixels);
    prepared.set(`${crop.id}.png`, {
      bytes: encoderPng({ largeur: pixels.width, hauteur: pixels.height, pixels: pixels.data }),
      width: pixels.width,
      height: pixels.height,
    });
  }
  for (const sheet of manifest.sheets) {
    const cells = sheet.items.map((name) => cropPixels.get(name)!);
    const cellWidth = Math.max(...cells.map((c) => c.width));
    const cellHeight = Math.max(...cells.map((c) => c.height));
    const columns = Math.min(sheet.columns, cells.length);
    const width = columns * (cellWidth + sheet.padding * 2);
    const height = Math.ceil(cells.length / columns) * (cellHeight + sheet.padding * 2);
    if (width > 16384 || height > 16384 || width * height > MAX_PIXELS)
      throw new Error(`Atlas pixel limit: ${sheet.id}`);
    const pixels = new Uint8Array(width * height * 4);
    const frames: Record<string, unknown> = {};
    for (const [index, cell] of cells.entries()) {
      const x = (index % columns) * (cellWidth + sheet.padding * 2) + sheet.padding;
      const y = Math.floor(index / columns) * (cellHeight + sheet.padding * 2) + sheet.padding;
      for (let row = 0; row < cell.height; row++)
        pixels.set(
          cell.data.subarray(row * cell.width * 4, (row + 1) * cell.width * 4),
          ((y + row) * width + x) * 4,
        );
      frames[sheet.items[index]!] = {
        frame: { x, y, w: cell.width, h: cell.height },
        rotated: false,
        trimmed: false,
        spriteSourceSize: { x: 0, y: 0, w: cell.width, h: cell.height },
        sourceSize: { w: cell.width, h: cell.height },
      };
    }
    prepared.set(`${sheet.id}.png`, {
      bytes: encoderPng({ largeur: width, hauteur: height, pixels }),
      width,
      height,
    });
    prepared.set(`${sheet.id}.json`, {
      bytes: json({
        frames,
        meta: {
          image: `${sheet.id}.png`,
          format: "RGBA8888",
          size: { w: width, h: height },
          scale: "1",
        },
      }),
    });
  }
  const outputs: Output[] = [...prepared].map(([path, item]) => {
    const output: Output = { path, sha256: sha256(item.bytes), bytes: item.bytes.length };
    if (item.width !== undefined) {
      output.width = item.width;
      output.height = item.height;
    }
    return output;
  });
  const receipt: Receipt = {
    schema: "shenron-wiki-scene-receipt/v1",
    ...identity,
    sources: manifest.sources,
    crops: manifest.crops,
    outputs,
  };
  if (videoFrames.length) receipt.videoFrames = videoFrames;
  await mkdir(out, { recursive: true });
  // Identity marker first, completed receipt last; the exclusive lock bounds writers.
  for (const [path, item] of [
    [".pending.json", { bytes: json(pending) }] as const,
    ...prepared,
    ["receipt.json", { bytes: json(receipt) }] as const,
  ]) {
    const destination = join(out, path);
    const temporary = `${destination}.tmp`;
    try {
      await Bun.write(temporary, item.bytes);
      await rename(temporary, destination);
    } finally {
      await rm(temporary, { force: true });
    }
  }
  await rm(pendingPath, { force: true });
  return { status: "written", receiptSha256: sha256(json(receipt)), outputs };
}
type ReceiptIdentity = Pick<Receipt, "manifestSha256" | "runtime">;
if (import.meta.main) {
  const args = process.argv.slice(2);
  const check = args.includes("--check");
  const positional = args.filter((arg) => arg !== "--check");
  if (positional.length !== 2 || args.some((arg) => arg.startsWith("--") && arg !== "--check")) {
    console.error(
      "Usage: bun scripts/media/wiki-scene-assets/index.ts <manifest.json> <output-directory> [--check]",
    );
    process.exitCode = 2;
  } else {
    try {
      console.log(JSON.stringify(await run(positional[0]!, positional[1]!, check), null, 2));
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    }
  }
}
