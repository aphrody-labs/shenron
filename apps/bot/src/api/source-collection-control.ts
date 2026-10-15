// SPDX-License-Identifier: Apache-2.0
import { watch } from "node:fs";
import { lstat, mkdir, open, link, unlink, readdir, realpath } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import type {
  SourceCollectionReceipt,
  SourcePipelinePorts,
} from "../../../../scripts/ops/bun-source-pipeline";
const MIN_WAIT_MS = 20 * 60 * 1000;
const errors = new Set(["ERR_SOURCE_JOB_STATE_UNCERTAIN", "ERR_SOURCE_JOB_COLLECTION_FAILED"]);
const hash = (bytes: Uint8Array) => new Bun.CryptoHasher("sha256").update(bytes).digest("hex");
const sha = (value: unknown): value is string =>
  typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
async function privateDirectory(path: string, create = false) {
  if (create) await mkdir(path, { mode: 0o700 });
  const info = await lstat(path);
  if (
    !info.isDirectory() ||
    info.isSymbolicLink() ||
    info.mode & 0o077 ||
    (await realpath(path)) !== resolve(path)
  )
    throw Error("Private canonical collection control directory required");
}
async function readPrivate(path: string, maxBytes: number) {
  const info = await lstat(path);
  if (
    !info.isFile() ||
    info.isSymbolicLink() ||
    info.mode & 0o077 ||
    info.size > maxBytes ||
    (await realpath(path)) !== resolve(path)
  )
    throw Error("Private bounded collection control file required");
  const bytes = await Bun.file(path).bytes();
  if (bytes.length > maxBytes) throw Error("Collection control file exceeds limit");
  return bytes;
}
async function ensureDirectory(path: string) {
  try {
    await privateDirectory(path, true);
  } catch (error) {
    if ((error as { code?: string }).code !== "EEXIST") throw error;
    await privateDirectory(path);
  }
}
/** A finite private transport only; the existing host factory owns execution and credentials. */
export async function createSourceCollectionControl(
  settings: { dataRoot: string; configPath: string; timeoutMs?: number },
  ports: { deadline?: (milliseconds: number) => AbortSignal } = {},
): Promise<NonNullable<SourcePipelinePorts["collectCycle"]>> {
  if (
    !isAbsolute(settings.dataRoot) ||
    settings.configPath !== join(settings.dataRoot, "source-pipeline", "config.json") ||
    !Number.isSafeInteger(settings.timeoutMs ?? MIN_WAIT_MS) ||
    (settings.timeoutMs ?? MIN_WAIT_MS) < MIN_WAIT_MS ||
    (settings.timeoutMs ?? MIN_WAIT_MS) > 30 * 60 * 1000
  )
    throw Error("Fixed private collection control configuration required");
  const root = dirname(settings.configPath),
    control = join(root, "control"),
    requests = join(control, "requests"),
    responses = join(control, "responses");
  await privateDirectory(root);
  await readPrivate(settings.configPath, 2 * 1024 * 1024);
  await ensureDirectory(control);
  await ensureDirectory(requests);
  await ensureDirectory(responses);
  return async (request, signal) => {
    signal?.throwIfAborted();
    const configuration = await readPrivate(settings.configPath, 2 * 1024 * 1024);
    const batchMode =
      JSON.parse(new TextDecoder().decode(configuration)).batchCollection !== undefined;
    if (
      request.configPath !== settings.configPath ||
      !sha(request.configSha256) ||
      hash(configuration) !== request.configSha256
    )
      throw Error("Collection request configuration differs");
    await privateDirectory(control);
    await privateDirectory(requests);
    await privateDirectory(responses);
    if ((await readdir(requests)).length >= 128)
      throw Error("Collection controller request budget exhausted");
    const requestId = crypto.randomUUID(),
      requestPath = join(requests, requestId + ".json"),
      responsePath = join(responses, requestId + ".json"),
      temporary = join(requests, "." + requestId + ".tmp");
    const body =
      JSON.stringify({
        schema: "shenron-source-request/v1",
        requestId,
        configPath: request.configPath,
        configSha256: request.configSha256,
      }) + "\n";
    if (new TextEncoder().encode(body).length > 4096)
      throw Error("Collection request exceeds limit");
    const bounded = AbortSignal.any([
      ...(signal ? [signal] : []),
      (ports.deadline ?? ((milliseconds) => AbortSignal.timeout(milliseconds)))(
        settings.timeoutMs ?? MIN_WAIT_MS,
      ),
    ]);
    let changed = Promise.withResolvers<void>(),
      watchFailure = false;
    const watcher = watch(responses, { persistent: false }, () => changed.resolve());
    watcher.on("error", () => {
      watchFailure = true;
      changed.resolve();
    });
    const wake = () => changed.resolve();
    bounded.addEventListener("abort", wake, { once: true });
    let published = false;
    try {
      bounded.throwIfAborted();
      const file = await open(temporary, "wx", 0o600);
      try {
        await file.writeFile(body);
        await file.sync();
      } finally {
        await file.close();
      }
      await link(temporary, requestPath);
      published = true;
      await unlink(temporary);
      for (;;) {
        bounded.throwIfAborted();
        if (watchFailure) throw Error("Collection response watcher unavailable");
        await privateDirectory(responses);
        let bytes: Uint8Array;
        try {
          bytes = await readPrivate(responsePath, 65536);
        } catch (error) {
          if ((error as { code?: string }).code !== "ENOENT") throw error;
          await changed.promise;
          changed = Promise.withResolvers<void>();
          continue;
        }
        const value = JSON.parse(new TextDecoder().decode(bytes));
        if (
          !value ||
          typeof value !== "object" ||
          Array.isArray(value) ||
          !Object.keys(value).every((key) =>
            ["schema", "requestId", "configSha256", "status", "collection", "errorCode"].includes(
              key,
            ),
          )
        )
          throw Error("Invalid collection response envelope");
        if (
          value.schema !== "shenron-source-response/v1" ||
          value.requestId !== requestId ||
          value.configSha256 !== request.configSha256
        )
          throw Error("Collection response identity differs");
        if (value.status === "failed") {
          if (!errors.has(value.errorCode) || value.collection !== undefined)
            throw Error("Invalid collection failure response");
          throw Object.assign(Error("Qualified source collection failed"), {
            code: value.errorCode,
          });
        }
        const collection = value.collection as SourceCollectionReceipt | undefined;
        if (
          value.status !== "complete" ||
          value.errorCode !== undefined ||
          !collection ||
          collection.schema !==
            (batchMode ? "shenron-source-collection/v2" : "shenron-source-collection/v1") ||
          collection.configSha256 !== request.configSha256 ||
          !sha(collection.pinnedConfigSha256) ||
          !sha(collection.collectionSha256) ||
          !sha(collection.artifactsSha256) ||
          !sha(collection.revisionIdentity) ||
          typeof collection.pinnedConfigPath !== "string" ||
          !isAbsolute(collection.pinnedConfigPath)
        )
          throw Error("Invalid collection receipt response");
        const child = relative(root, collection.pinnedConfigPath);
        if (!child || child.startsWith("..") || isAbsolute(child))
          throw Error("Collection receipt leaves private volume");
        if (collection.schema === "shenron-source-collection/v2") {
          const batch = collection.batch;
          if (
            collection.artifactOnly !== true ||
            collection.complete !== false ||
            collection.deliveryAuthorized !== false ||
            !batch ||
            ![
              batch.sourceSha256,
              batch.manifestSha256,
              batch.batchReceiptSha256,
              batch.exportSha256,
              batch.validationSha256,
            ].every(sha) ||
            ![batch.cursor, batch.nextCursor, batch.totalDocuments].every(Number.isSafeInteger) ||
            batch.cursor < 0 ||
            batch.nextCursor < batch.cursor ||
            batch.nextCursor > batch.totalDocuments ||
            batch.nextCursor - batch.cursor > 100000 ||
            (batch.totalDocuments > 0 && batch.nextCursor === batch.cursor) ||
            typeof batch.exportComplete !== "boolean" ||
            typeof batch.validationComplete !== "boolean"
          )
            throw Error("Invalid versioned collection receipt");
          for (const path of [
            collection.collectionPath,
            batch.manifestPath,
            batch.batchReceiptPath,
            batch.exportPath,
            batch.validationPath,
          ]) {
            if (typeof path !== "string" || !isAbsolute(path) || resolve(path) !== path)
              throw Error("Invalid versioned collection artifact path");
            const artifactChild = relative(root, path);
            if (!artifactChild || artifactChild.startsWith("..") || isAbsolute(artifactChild))
              throw Error("Versioned collection artifact leaves private volume");
          }
        }
        bounded.throwIfAborted();
        return collection;
      }
    } finally {
      bounded.removeEventListener("abort", wake);
      watcher.close();
      await unlink(temporary).catch((error) => {
        if (error.code !== "ENOENT") throw error;
      });
      // Removing the request also cancels an in-progress finite controller job.
      if (published)
        await unlink(requestPath).catch((error) => {
          if (error.code !== "ENOENT") throw error;
        });
      await unlink(responsePath).catch((error) => {
        if (error.code !== "ENOENT") throw error;
      });
    }
  };
}
