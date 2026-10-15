// SPDX-License-Identifier: Apache-2.0
import { chmod, link, lstat, mkdir, realpath, unlink } from "node:fs/promises";
import { isAbsolute, join, resolve } from "node:path";
import { parseArgs } from "node:util";
import {
  nativeAssetReport,
  readVerifiedNativeAsset,
} from "../../packages/pipeline/src/dragon-ball/assets";
import { validateSoshReaderManifest } from "../../packages/pipeline/src/dragon-ball/sosh-reader-manifest";
import { qualifyBundle } from "./manga-publication-worker";

export const handoffDigest = (bytes: string | Uint8Array) =>
  new Bun.CryptoHasher("sha256").update(bytes).digest("hex");
export interface HandoffInput {
  bundle: unknown;
  manifest: unknown;
  acquisition: unknown;
  nativeRoot: string;
  outbox: string;
}
/** No discovery, approval, page numbering, acquisition or editorial write lives in this bridge. */
export async function handoffReader(input: HandoffInput) {
  const bundle = await qualifyBundle(input.bundle);
  if (bundle.series !== "SOSH") throw Error("Only reviewed SOSH manifests are currently supported");
  const manifest = validateSoshReaderManifest(input.manifest);
  const volume = manifest.volumes.find((v) => v.volumeId === bundle.volumeId);
  if (
    !volume ||
    volume.volumeNumber !== bundle.volumeNumber ||
    volume.chapterId !== bundle.chapterId ||
    volume.sourceUrl !== bundle.source.documentUrl ||
    volume.pages.length !== bundle.pages.length
  )
    throw Error("Approved manifest and captured source identity differ");
  const report = nativeAssetReport(input.acquisition);
  if (!isAbsolute(input.nativeRoot) || !isAbsolute(input.outbox))
    throw Error("Absolute private paths required");
  const nativeRoot = await realpath(input.nativeRoot);
  const used = new Set<string>();
  for (let i = 0; i < bundle.pages.length; i++) {
    const page = bundle.pages[i]!,
      approved = volume.pages[i]!;
    const image = new URL(approved.readerImage);
    if (image.pathname !== page.publicPath || approved.sha256 !== page.sha256)
      throw Error("Approved page order or digest differs from publication bundle");
    const matches = report.files.filter((asset) => asset.url === page.sourceUrl);
    if (matches.length !== 1 || used.has(page.sourceUrl))
      throw Error("Ambiguous native acquisition provenance");
    const asset = matches[0]!;
    if (
      asset.sha256 !== page.sha256 ||
      asset.bytes !== page.size ||
      !Number.isSafeInteger(asset.width) ||
      asset.width < 1 ||
      !Number.isSafeInteger(asset.height) ||
      asset.height < 1
    )
      throw Error("Native asset identity, size or dimensions differ");
    for (const path of [asset.path, asset.source_path]) {
      const stat = await lstat(path);
      if (!stat.isFile() || stat.isSymbolicLink() || stat.size < 1 || stat.size > 33 * 1024 * 1024)
        throw Error("Native page exceeds its qualified bound");
    }
    // Independently verify both original bytes and the exact transformed public candidate.
    await readVerifiedNativeAsset(asset, nativeRoot, true);
    await readVerifiedNativeAsset(asset, nativeRoot);
    used.add(page.sourceUrl);
  }
  await mkdir(input.outbox, { recursive: true, mode: 0o700 });
  const stat = await lstat(input.outbox);
  if (
    !stat.isDirectory() ||
    stat.isSymbolicLink() ||
    stat.mode & 0o077 ||
    (await realpath(input.outbox)) !== resolve(input.outbox)
  )
    throw Error("Private canonical outbox required");
  const body = JSON.stringify(bundle) + "\n",
    digest = handoffDigest(body);
  const target = join(input.outbox, digest + ".json");
  const temp = join(input.outbox, ".handoff-" + crypto.randomUUID());
  await Bun.write(temp, body);
  await chmod(temp, 0o600);
  let replay = false;
  try {
    try {
      await link(temp, target);
    } catch (error) {
      if ((error as { code?: string }).code !== "EEXIST") throw error;
      const prior = await lstat(target);
      if (!prior.isFile() || prior.isSymbolicLink() || (await Bun.file(target).text()) !== body)
        throw Error("Existing outbox identity differs; preserve it", { cause: error });
      replay = true;
    }
  } finally {
    await unlink(temp);
  }
  return {
    schema: "shenron-manga-reader-handoff/v1",
    bundleSha256: digest,
    volumeId: bundle.volumeId,
    pagesVerified: bundle.pages.length,
    replay,
    outboxFile: target,
    publicActivation: false,
    editorialMutation: false,
  };
}

interface Pin {
  path: string;
  sha256: string;
}
async function pinnedJson(pin: Pin) {
  if (!pin || !isAbsolute(pin.path) || !/^[a-f0-9]{64}$/.test(pin.sha256))
    throw Error("Exact file pin required");
  const stat = await lstat(pin.path);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.mode & 0o077 || stat.size > 16 * 1024 * 1024)
    throw Error("Private bounded pinned input required");
  const bytes = await Bun.file(pin.path).bytes();
  if (handoffDigest(bytes) !== pin.sha256) throw Error("Pinned handoff input changed");
  return JSON.parse(new TextDecoder().decode(bytes));
}
if (import.meta.main) {
  process.umask(0o077);
  const { values } = parseArgs({ options: { config: { type: "string" } } });
  if (!values.config || !isAbsolute(values.config))
    throw Error("Usage: manga-reader-handoff --config /private/config.json");
  const stat = await lstat(values.config);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.mode & 0o077)
    throw Error("Private handoff configuration required");
  const config = (await Bun.file(values.config).json()) as {
    bundle: Pin;
    manifest: Pin;
    acquisition: Pin;
    nativeRoot: string;
    outbox: string;
  };
  console.log(
    JSON.stringify(
      await handoffReader({
        bundle: await pinnedJson(config.bundle),
        manifest: await pinnedJson(config.manifest),
        acquisition: await pinnedJson(config.acquisition),
        nativeRoot: config.nativeRoot,
        outbox: config.outbox,
      }),
    ),
  );
}
