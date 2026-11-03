#!/usr/bin/env bun
// SPDX-License-Identifier: Apache-2.0
import { resolve } from "node:path";
import { access } from "node:fs/promises";
import { run, sha256 } from "./index";

/** Actual local-video qualification; never generates or substitutes a synthetic video. */
export async function qualifyVideo(manifest: string, output: string) {
  const out = resolve(output);
  const independent = `${out}-independent`;
  if (
    await access(independent).then(
      () => true,
      () => false,
    )
  )
    throw new Error("Independent output already exists; choose a fresh output path");
  const first = await run(manifest, out);
  const rerun = await run(manifest, out);
  const check = await run(manifest, out, true);
  const fresh = await run(manifest, independent);
  const receipt = await Bun.file(`${out}/receipt.json`).json();
  if (!Array.isArray(receipt.videoFrames) || !receipt.videoFrames.length)
    throw new Error("Qualification requires actual decoded video frames");
  if (new Set([first, rerun, check, fresh].map((result) => result.receiptSha256)).size !== 1)
    throw new Error("Video output is not deterministic across independent runs");
  const proof = {
    schema: "shenron-wiki-scene-video-qualification/v1",
    manifest: resolve(manifest),
    output: out,
    independent,
    statuses: [first.status, rerun.status, check.status, fresh.status],
    receiptSha256: first.receiptSha256,
    videoFrames: receipt.videoFrames,
    outputs: receipt.outputs,
    nativeProvider: "Bun.Video.frames",
    visualInspection: "not-attested-by-cli",
  };
  const proofPath = `${out}.qualification.json`;
  await Bun.write(proofPath, JSON.stringify(proof, null, 2) + "\n");
  return { proofPath, proofSha256: sha256(await Bun.file(proofPath).bytes()), ...proof };
}
if (import.meta.main) {
  if (process.argv.length !== 4) {
    console.error(
      "Usage: bun scripts/media/wiki-scene-assets/qualify-video.ts <real-video-manifest.json> <fresh-output-directory>",
    );
    process.exitCode = 2;
  } else
    try {
      console.log(JSON.stringify(await qualifyVideo(process.argv[2]!, process.argv[3]!), null, 2));
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    }
}
