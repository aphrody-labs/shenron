import { chmodSync, cpSync, readdirSync } from "node:fs";
import { join } from "node:path";

/** Public runtime payloads must be readable by the deployment's configured UID. */
export function copyRuntimeFile(source: string, destination: string): void {
  cpSync(source, destination);
  chmodSync(destination, 0o644);
}

export function copyRuntimeDirectory(source: string, destination: string): void {
  cpSync(source, destination, { recursive: true });
  const normalize = (directory: string) => {
    chmodSync(directory, 0o755);
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) normalize(path);
      else if (entry.isFile()) chmodSync(path, 0o644);
    }
  };
  normalize(destination);
}

export interface PipelineBuildReceipt {
  schema: "shenron-source-pipeline-build/v1";
  artifact: "pipeline.mjs";
  sha256: string;
  bytes: number;
  sourceCommit: string;
  sourceEntrySha256: string;
  target: "bun";
  format: "esm";
  runtimeVersion: string;
  runtimeRevision: string;
}
/** The same bot artifact owner seals the collection module for finite private jobs. */
export async function buildSourcePipelineAsset(
  entrypoint: string,
  output: string,
  sourceCommit: string,
): Promise<PipelineBuildReceipt> {
  if (!/^[a-f0-9]{40}$/.test(sourceCommit)) throw Error("Pinned source commit required");
  const hash = async (path: string) => {
    const hasher = new Bun.CryptoHasher("sha256");
    for await (const bytes of Bun.file(path).stream()) hasher.update(bytes);
    return hasher.digest("hex");
  };
  const sourceEntrySha256 = await hash(entrypoint);
  const result = await Bun.build({
    entrypoints: [entrypoint],
    outdir: output,
    naming: "pipeline.mjs",
    target: "bun",
    format: "esm",
    splitting: false,
    external: ["bun", "bun:*", "node:*"],
  });
  if (!result.success || result.outputs.length !== 1) throw Error("Source pipeline bundle failed");
  const path = join(output, "pipeline.mjs");
  if ((await hash(entrypoint)) !== sourceEntrySha256) throw Error("Source pipeline entry changed");
  const artifact = Bun.file(path);
  const receipt: PipelineBuildReceipt = {
    schema: "shenron-source-pipeline-build/v1",
    artifact: "pipeline.mjs",
    sha256: await hash(path),
    bytes: artifact.size,
    sourceCommit,
    sourceEntrySha256,
    target: "bun",
    format: "esm",
    runtimeVersion: Bun.version,
    runtimeRevision: Bun.revision,
  };
  if (!receipt.bytes || !/^[a-f0-9]{64}$/.test(receipt.sha256))
    throw Error("Empty or unpinned source pipeline bundle");
  chmodSync(path, 0o644);
  const receiptPath = join(output, "pipeline-build-receipt.json");
  await Bun.write(receiptPath, JSON.stringify(receipt, null, 2) + "\n");
  chmodSync(receiptPath, 0o644);
  if ((await hash(path)) !== receipt.sha256 || Bun.file(path).size !== receipt.bytes)
    throw Error("Source pipeline artifact changed");
  return receipt;
}
