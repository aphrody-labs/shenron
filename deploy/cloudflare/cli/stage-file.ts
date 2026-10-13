// SPDX-License-Identifier: Apache-2.0
import { lstat, realpath, readdir, mkdir, writeFile, unlink } from "node:fs/promises";
import { resolve, join, basename } from "node:path";
import { parseArgs } from "node:util";
import { digest } from "./cloudflare-ops";
import { objectStore, type ObjectStore, type StagedBudget } from "./transfer";
import { validateProfile } from "./s3-profile";

export const episodeSourceSha256 =
  "db6b365d58a933a18176ffd848b23d79513acb899acf7b4a07bd35203949508e";
export interface StageInput {
  input: string;
  sha256: string;
  size: number;
  contentType: string;
  sourceSha256: string;
  kind: "derived_core" | "media_archive" | "extracted_frame";
  budget: StagedBudget;
}
export function validateStageInput(input: StageInput) {
  if (
    input.sourceSha256 !== episodeSourceSha256 ||
    !/^[a-f0-9]{64}$/.test(input.sha256) ||
    !Number.isSafeInteger(input.size) ||
    input.size <= 0 ||
    input.size > 128 * 1024 * 1024 ||
    !Number.isSafeInteger(input.budget.maxBytes) ||
    input.budget.maxBytes < input.size ||
    input.budget.maxBytes > 128 * 1024 * 1024 ||
    !Number.isSafeInteger(input.budget.timeoutMs) ||
    input.budget.timeoutMs < 1 ||
    input.budget.timeoutMs > 300000 ||
    (input.kind === "derived_core" || input.kind === "media_archive"
      ? !["application/gzip", "application/zstd"].includes(input.contentType)
      : input.kind !== "extracted_frame" || input.contentType !== "image/png")
  )
    throw new Error("Invalid staged volume scope");
}
export function verifyStageFormat(bytes: Uint8Array, mime: string) {
  const magic = [...bytes.subarray(0, 8)].map((b) => b.toString(16).padStart(2, "0")).join("");
  if (
    !(
      (mime === "application/gzip" && magic.startsWith("1f8b08")) ||
      (mime === "application/zstd" && magic.startsWith("28b52ffd")) ||
      (mime === "image/png" && magic === "89504e470d0a1a0a")
    )
  )
    throw new Error("Staged format differs");
}
export async function stageOwnedFile(
  input: StageInput,
  windowRoot: string,
  receiptRoot: string,
  store: ObjectStore,
  exists: (key: string) => Promise<boolean>,
) {
  input = { ...input, budget: { ...input.budget } };
  validateStageInput(input);
  const root = await realpath(windowRoot),
    rootInfo = await lstat(windowRoot),
    fileInfo = await lstat(input.input),
    filename = basename(input.input);
  if (
    !rootInfo.isDirectory() ||
    rootInfo.isSymbolicLink() ||
    !fileInfo.isFile() ||
    fileInfo.isSymbolicLink() ||
    (process.platform !== "win32" &&
      (rootInfo.mode & 0o077 || fileInfo.mode & 0o077 || fileInfo.uid !== rootInfo.uid)) ||
    !(filename === input.sha256 + ".blob" || /^assets-[0-9]{4}\.tar\.gz$/.test(filename)) ||
    (await realpath(input.input)) !== join(root, filename) ||
    fileInfo.size !== input.size
  )
    throw new Error("Private staging path differs");
  const files = await readdir(root);
  if (
    files.length > 2 ||
    files.some((p) => !/^(?:[a-f0-9]{64}\.blob|assets-[0-9]{4}\.tar\.gz)(?:\.part)?$/.test(p))
  )
    throw new Error("Rolling window exceeds two volumes");
  const bytes = await Bun.file(input.input).bytes();
  if (bytes.length !== input.size || digest(bytes) !== input.sha256)
    throw new Error("Staged input bytes differ");
  verifyStageFormat(bytes, input.contentType);
  await mkdir(receiptRoot, { recursive: true, mode: 0o700 });
  const receiptInfo = await lstat(receiptRoot);
  if (
    !receiptInfo.isDirectory() ||
    receiptInfo.isSymbolicLink() ||
    (process.platform !== "win32" &&
      (receiptInfo.mode & 0o077 || receiptInfo.uid !== process.getuid?.()))
  )
    throw new Error("Owner receipt store differs");
  const key = "_objects/" + input.sha256,
    started = performance.now(),
    alreadyStaged = await exists(key);
  if (!alreadyStaged)
    await store.put(
      key,
      bytes,
      input.sha256,
      input.contentType,
      "public, max-age=31536000, immutable",
    );
  const uploadMs = performance.now() - started;
  const attestation = await store.attestStaged(key, input, input.budget);
  if (
    attestation.schema !== "shenron-staged-cas-attestation/v1" ||
    attestation.key !== key ||
    attestation.size !== input.size ||
    attestation.sha256 !== input.sha256 ||
    attestation.actualGets !== 2 ||
    attestation.beforeBodySha256 !== input.sha256 ||
    attestation.afterBodySha256 !== input.sha256 ||
    attestation.headMetadata.sha256 !== input.sha256 ||
    attestation.headMetadata.size !== input.size ||
    attestation.objectBytesUploaded !== 0
  )
    throw new Error("Owner stage attestation differs");
  const receipt = {
    schema: "shenron-owner-staged-volume/v1",
    qualifiedAt: new Date().toISOString(),
    sourceSha256: input.sourceSha256,
    kind: input.kind,
    official: false,
    reviewed: false,
    language: input.kind === "derived_core" ? "ja" : "und",
    canonicalEligible: false,
    ragPermitted: false,
    trainingPermitted: false,
    key,
    sha256: input.sha256,
    size: input.size,
    contentType: input.contentType,
    alreadyStaged,
    objectBytesUploaded: alreadyStaged ? 0 : input.size,
    uploadMs,
    totalMs: performance.now() - started,
    attestation,
    pointerMutations: 0,
    registryMutations: 0,
    privateStagingOnly: true,
  };
  const body = JSON.stringify(receipt),
    receiptPath = join(receiptRoot, input.sha256 + ".json");
  await writeFile(receiptPath, body, { mode: 0o600, flag: "wx" });
  const after = await lstat(input.input);
  if (
    after.ino !== fileInfo.ino ||
    after.size !== fileInfo.size ||
    after.mtimeMs !== fileInfo.mtimeMs ||
    after.isSymbolicLink()
  )
    throw new Error("Input changed after staging; qualified receipt retained");
  await unlink(input.input);
  return {
    qualified: true,
    key,
    sha256: input.sha256,
    size: input.size,
    alreadyStaged,
    objectBytesUploaded: receipt.objectBytesUploaded,
    uploadMs,
    totalMs: receipt.totalMs,
    receiptPath,
    receiptSha256: digest(body),
    inputDeleted: true,
  };
}
export async function run(args: string[]) {
  const { values } = parseArgs({
    args,
    options: {
      input: { type: "string" },
      sha256: { type: "string" },
      size: { type: "string" },
      mime: { type: "string" },
      "source-sha256": { type: "string" },
      kind: { type: "string" },
      "max-bytes": { type: "string" },
      "timeout-ms": { type: "string" },
      apply: { type: "boolean" },
      help: { type: "boolean" },
    },
  });
  if (values.help) {
    console.log(
      "stage-file --input WINDOW/<SHA>.blob|assets-NNNN.tar.gz --sha256 SHA --size BYTES --mime application/gzip|application/zstd|image/png --source-sha256 SHA --kind derived_core|media_archive|extracted_frame --max-bytes BYTES --timeout-ms MILLISECONDS --apply; owner root only, two-volume window, deletes input after qualified private receipt; no Worker or registry writes",
    );
    return;
  }
  if (process.platform === "win32" || process.getuid?.() !== 0 || !values.apply)
    throw new Error("DBFR owner root apply required");
  const config = await Bun.file("/etc/aphrody/cloudflare/source-publication.json").json(),
    manifest = await Bun.file(config.manifest).json();
  if (manifest.bucket !== "shenron-cdn") throw new Error("Staging bucket differs");
  const p = await Bun.file(config.profile).json();
  validateProfile(p, manifest);
  const store = await objectStore(config.profile, manifest, config.sdkModule);
  const input: StageInput = {
    input: resolve(values.input ?? ""),
    sha256: values.sha256 ?? "",
    size: Number(values.size),
    contentType: values.mime ?? "",
    sourceSha256: values["source-sha256"] ?? "",
    kind: values.kind as StageInput["kind"],
    budget: { maxBytes: Number(values["max-bytes"]), timeoutMs: Number(values["timeout-ms"]) },
  };
  console.log(
    JSON.stringify(
      await stageOwnedFile(
        input,
        "/home/ubuntu/.local/share/aphrody/media-staging/" + episodeSourceSha256,
        "/home/ubuntu/.aphrody/private/shenron/bun-video-875-staging-20261013/receipts",
        store,
        async (key) => {
          const fresh = await Bun.file(config.profile).json();
          validateProfile(fresh, manifest);
          if (Date.parse(fresh.expiresAt) <= Date.now() + 60000)
            throw new Error("Owner staging profile expired");
          return new Bun.S3Client(fresh).file(key).exists();
        },
      ),
    ),
  );
}
if (import.meta.main)
  run(Bun.argv.slice(2)).catch(() => {
    console.error(JSON.stringify({ failed: true, code: "OWNER_STAGE_FAILED" }));
    process.exitCode = 1;
  });
