// SPDX-License-Identifier: Apache-2.0
import { mkdir, realpath, rmdir, stat, writeFile, rename, lstat } from "node:fs/promises";
import { isAbsolute, join, resolve, extname, dirname } from "node:path";
import { digest, readToken, validateManifest, type Manifest } from "./cloudflare-ops";
import { run as generateInventory, type InventoryEntry } from "./inventory-delta";
import { inventory, objectStore, within } from "./transfer";

type Json = Record<string, unknown>;
interface Binding extends Json {
  name: string;
  type: string;
  text?: string;
  json?: unknown;
}
interface Settings extends Json {
  bindings: Binding[];
  annotations?: Record<string, string>;
}
export interface PublishCatalogOptions {
  publicRoot: string;
  job: string;
  targetUrl: string;
  previousInventory: string;
  previousInventorySha256: string;
  manifest: string;
  profile: string;
  tokenFile: string;
  sdkModule: string;
  workerOrigin: string;
  cdnOrigin: string;
  /** Explicit native-origin qualification; the default still probes Worker + CDN. */
  qualificationOrigins?: readonly [string, string];
  qualificationService?: { serviceVersion: "shenron-cdn-origin/v1"; codeSha256: string };
  nativeOriginActivation?: {
    modulePath: string;
    moduleSha256: string;
    configuration: Record<string, string>;
  };
  /** Read-only site recovery only; this is never a claim of full manifest qualification. */
  qualificationScope?: { coverage: "explicit-paths"; paths: readonly string[] };
  expectedDeployment: string;
  expectedCodeSha256: string;
  expectedPrefix: string;
  stateDirectory: string;
  inventoryRoot: string;
  apply?: boolean;
  planSha256?: string;
  siteRelease?: {
    siteRoot: string;
    staticRoot: string;
    releasePublicRoot: string;
    archivePath: string;
    archiveSha256: string;
  };
}

interface OriginInventoryCandidate {
  inventoryPath: string;
  inventorySha256: string;
  manifestPrefix: string;
  publisherLock: string;
}
interface OriginInventoryActivation {
  activate(candidate: OriginInventoryCandidate): Promise<{
    applied: boolean;
    replay: boolean;
    writes: number;
    inventorySha256: string;
  }>;
}

/** Invoke only the pinned Infra owner for the separately qualified native backend. */
export async function loadOriginInventoryActivation(
  options: Pick<
    PublishCatalogOptions,
    "nativeOriginActivation" | "qualificationOrigins" | "qualificationService"
  > &
    Partial<Pick<PublishCatalogOptions, "workerOrigin" | "cdnOrigin">>,
): Promise<OriginInventoryActivation | null> {
  const activation = options.nativeOriginActivation;
  if (!activation) return null;
  qualificationOrigins({
    ...options,
    workerOrigin: options.workerOrigin ?? "",
    cdnOrigin: options.cdnOrigin ?? "",
  });
  if (!options.qualificationOrigins || !options.qualificationService)
    throw Error("Origin activation requires qualified native origins");
  if (!isAbsolute(activation.modulePath) || !/^[a-f0-9]{64}$/.test(activation.moduleSha256))
    throw Error("Pinned Infra activation module required");
  const info = await lstat(activation.modulePath);
  if (
    !info.isFile() ||
    info.isSymbolicLink() ||
    info.size > 1024 * 1024 ||
    (process.platform !== "win32" && (info.mode & 0o022 || info.uid !== process.getuid?.())) ||
    digest(await Bun.file(activation.modulePath).bytes()) !== activation.moduleSha256
  )
    throw Error("Infra activation capability changed");
  const url = Bun.pathToFileURL(activation.modulePath);
  url.searchParams.set("sha256", activation.moduleSha256);
  const module = await import(url.href);
  if (typeof module.createOriginInventoryActivation !== "function")
    throw Error("Infra activation capability unavailable");
  const capability = await module.createOriginInventoryActivation(activation.configuration);
  if (!capability || typeof capability.activate !== "function")
    throw Error("Invalid Infra activation capability");
  return capability;
}
interface Delta {
  entries: Record<string, InventoryEntry>;
  addedObjects: number;
  catalog: { revision: string; indexSha256: string };
}
interface Snapshot {
  settings: Settings;
  codeSha256: string;
  deployment: string;
}
interface Plan {
  schema: "shenron-cdn-publication-plan/v1";
  options: Omit<PublishCatalogOptions, "apply" | "planSha256">;
  before: Snapshot;
  prefix: string;
  inventorySha256: string;
  objectsSha256: string;
  shardHashes: Record<string, string>;
  settings: Json;
  changedNames: string[];
  manifestSha256: string;
  sdkSha256: string;
  stateSha256: string | null;
}
const names = new Set([
  "MANIFEST_PREFIX",
  ...Array.from({ length: 4 }, (_, i) => "MANIFEST_SHARD_HASHES_" + i),
]);
const settingsKeys = [
  "compatibility_date",
  "compatibility_flags",
  "usage_model",
  "tags",
  "tail_consumers",
  "logpush",
  "placement",
  "limits",
  "observability",
  "logpull",
  "keep_assets",
];
const sha = (bytes: ArrayBuffer) => digest(new Uint8Array(bytes));
export function qualificationOrigins(
  options: Pick<
    PublishCatalogOptions,
    "workerOrigin" | "cdnOrigin" | "qualificationOrigins" | "qualificationService"
  >,
): readonly string[] {
  if (!options.qualificationOrigins) {
    if (options.qualificationService)
      throw new Error("Native service requires explicit qualification origins");
    return [options.workerOrigin, options.cdnOrigin];
  }
  if (
    options.cdnOrigin !== "https://cdn.dragonballfr.com" ||
    JSON.stringify(options.qualificationOrigins) !==
      JSON.stringify([options.cdnOrigin, "https://origin-cdn.dragonballfr.com"]) ||
    options.qualificationService?.serviceVersion !== "shenron-cdn-origin/v1" ||
    !/^[a-f0-9]{64}$/.test(options.qualificationService.codeSha256)
  )
    throw new Error("Unreviewed qualification origin or service");
  return [...options.qualificationOrigins];
}

type NativeOriginAttestation = {
  backend: "native-manifest-origin";
  serviceVersion: string;
  codeSha256: string;
  manifestPrefix: string;
  inventorySha256: string;
};

/** Both public origins must attest the independently pinned native implementation and inventory. */
export async function attestQualificationOrigins(
  options: Pick<
    PublishCatalogOptions,
    "workerOrigin" | "cdnOrigin" | "qualificationOrigins" | "qualificationService"
  >,
  manifestPrefix: string,
  inventorySha256: string,
): Promise<NativeOriginAttestation | null> {
  const origins = qualificationOrigins(options);
  if (!options.qualificationOrigins) return null;
  if (
    !/^_migration\/manifests\/[a-z0-9-]+\/$/.test(manifestPrefix) ||
    !/^[a-f0-9]{64}$/.test(inventorySha256)
  )
    throw new Error("Invalid native attestation inventory pin");
  const expected: NativeOriginAttestation = {
    backend: "native-manifest-origin",
    serviceVersion: options.qualificationService!.serviceVersion,
    codeSha256: options.qualificationService!.codeSha256,
    manifestPrefix,
    inventorySha256,
  };
  const results = await Promise.allSettled(
    origins.map(async (origin) => {
      const response = await fetch(new URL("/.well-known/shenron-cdn-origin.json", origin), {
        redirect: "error",
        credentials: "omit",
        signal: AbortSignal.timeout(10000),
        headers: { "Accept-Encoding": "identity", "Cache-Control": "no-cache" },
      });
      if (
        response.status !== 200 ||
        response.headers.get("cache-control") !== "no-store" ||
        !/^application\/json(?:;|$)/i.test(response.headers.get("content-type") ?? "") ||
        !response.body
      ) {
        await response.body?.cancel();
        throw new Error("Native origin attestation unavailable");
      }
      const declared = response.headers.get("content-length");
      if (
        declared !== null &&
        (!Number.isSafeInteger(Number(declared)) ||
          Number(declared) < 1 ||
          Number(declared) > 16384)
      ) {
        await response.body.cancel();
        throw new Error("Native origin attestation exceeds bound");
      }
      const reader = response.body.getReader();
      const chunks: Uint8Array[] = [];
      let length = 0;
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          length += value.byteLength;
          if (length > 16384 || chunks.length >= 256)
            throw new Error("Native origin attestation exceeds bound");
          chunks.push(value);
        }
      } finally {
        await reader.cancel();
        reader.releaseLock();
      }
      if (
        declared !== null &&
        !response.headers.has("content-encoding") &&
        Number(declared) !== length
      )
        throw new Error("Native origin attestation size differs");
      const bytes = new Uint8Array(length);
      let offset = 0;
      for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.length;
      }
      const actual = JSON.parse(new TextDecoder().decode(bytes));
      if (Object.entries(expected).some(([key, value]) => actual[key] !== value))
        throw new Error("Native origin attestation tuple differs");
    }),
  );
  for (const result of results) if (result.status === "rejected") throw result.reason;
  return expected;
}

export function assertQualificationReceipt(
  options: Pick<
    PublishCatalogOptions,
    "workerOrigin" | "cdnOrigin" | "qualificationOrigins" | "qualificationService"
  >,
  receipt: {
    qualificationOrigins?: string[];
    workerPublicQualified?: boolean;
    nativeOriginAttestation?: NativeOriginAttestation;
    prefix: string;
    inventorySha256: string;
  },
) {
  const origins = qualificationOrigins(options);
  if (
    (receipt.qualificationOrigins !== undefined || options.qualificationOrigins) &&
    JSON.stringify(receipt.qualificationOrigins) !== JSON.stringify(origins)
  )
    throw new Error("Qualified receipt origins differ");
  if (options.qualificationOrigins) {
    const proof = receipt.nativeOriginAttestation;
    if (
      !/^_migration\/manifests\/[a-z0-9-]+\/$/.test(receipt.prefix) ||
      !/^[a-f0-9]{64}$/.test(receipt.inventorySha256) ||
      receipt.workerPublicQualified !== false ||
      !proof ||
      proof.backend !== "native-manifest-origin" ||
      proof.serviceVersion !== options.qualificationService!.serviceVersion ||
      proof.codeSha256 !== options.qualificationService!.codeSha256 ||
      proof.manifestPrefix !== receipt.prefix ||
      proof.inventorySha256 !== receipt.inventorySha256
    )
      throw new Error("Qualified native receipt differs");
  }
}
export function publicTarget(input: string): URL {
  const url = new URL(input);
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    !/^\/publications\/[a-z0-9]+(?:-[a-z0-9]+)*$/.test(url.pathname) ||
    url.pathname.length > 94
  )
    throw new Error("Invalid public publication target");
  return url;
}
export function siteReleaseTarget(input: string): URL {
  const url = new URL(input);
  if (
    url.origin !== "https://dragonballfr.com" ||
    url.pathname !== "/" ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  )
    throw new Error("Site release target must be the canonical site root");
  return url;
}
export function inputEntries(entries: Record<string, InventoryEntry>, roots: string[]) {
  return Object.entries(entries).filter(
    ([, entry]) =>
      typeof entry.sourcePath === "string" && roots.some((root) => within(entry.sourcePath, root)),
  );
}
export async function sealedArchiveSha256(path: string) {
  const info = await lstat(path);
  if (
    !info.isFile() ||
    info.isSymbolicLink() ||
    info.size > 256 * 1024 * 1024 ||
    (process.platform !== "win32" && (info.mode & 0o077 || info.uid !== process.getuid?.()))
  )
    throw new Error("Public archive must be protected regular file <=256 MiB");
  const bytes = await Bun.file(path).bytes();
  if (bytes.length !== info.size) throw new Error("Public archive size changed");
  return digest(bytes);
}
export function pointerSettings(
  before: Settings,
  prefix: string,
  hashes: Record<string, string>,
): { settings: Json; changedNames: string[] } {
  if (
    !/^_migration\/manifests\/[a-z0-9-]+\/$/.test(prefix) ||
    Object.keys(hashes).length !== 256 ||
    Array.from({ length: 256 }, (_, i) => i.toString(16).padStart(2, "0")).some(
      (k) => !/^[a-f0-9]{64}$/.test(hashes[k] ?? ""),
    )
  )
    throw new Error("Incomplete manifest hashes");
  if (
    before.bindings.some((b) => !["plain_text", "json", "r2_bucket"].includes(b.type)) ||
    [...names].some((name) => before.bindings.filter((b) => b.name === name).length !== 1)
  )
    throw new Error("Unreviewed binding or missing pointer");
  const bindings = before.bindings.map((b) => {
    if (b.name === "MANIFEST_PREFIX") {
      if (b.type !== "plain_text") throw new Error("Prefix binding type differs");
      return { ...b, text: prefix };
    }
    if (names.has(b.name)) {
      if (b.type !== "json") throw new Error("Shard binding type differs");
      const group = Number(b.name.slice(-1));
      return {
        ...b,
        json: Object.fromEntries(
          Object.entries(hashes).filter(([key]) => Math.floor(parseInt(key, 16) / 64) === group),
        ),
      };
    }
    return b;
  });
  const changedNames = bindings
    .filter((b, i) => JSON.stringify(b) !== JSON.stringify(before.bindings[i]))
    .map((b) => b.name);
  if (!changedNames.includes("MANIFEST_PREFIX") || changedNames.some((name) => !names.has(name)))
    throw new Error("Pointer change scope differs");
  const annotations = Object.fromEntries(
    Object.entries(before.annotations ?? {}).filter(([k]) => k !== "workers/triggered_by"),
  );
  const settings: Json = { bindings, annotations };
  for (const key of settingsKeys) if (before[key] !== undefined) settings[key] = before[key];
  const known = new Set(["bindings", "annotations", ...settingsKeys]);
  if (Object.keys(before).some((key) => !known.has(key)))
    throw new Error("Unknown Worker setting requires owner review");
  return { settings, changedNames };
}
export async function verifyPublic(url: URL, entry: { sha256: string; size: number }) {
  const response = await fetch(url, {
    redirect: "error",
    signal: AbortSignal.timeout(60000),
    headers: { "Accept-Encoding": "identity", "Cache-Control": "no-cache" },
  });
  if (response.status !== 200) throw new Error("Public verification HTTP " + response.status);
  if (
    !Number.isSafeInteger(entry.size) ||
    entry.size < 0 ||
    entry.size > 33 * 1024 * 1024 ||
    !response.body
  ) {
    await response.body?.cancel();
    throw new Error("Invalid public byte bound");
  }
  const reader = response.body.getReader(),
    hasher = new Bun.CryptoHasher("sha256");
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > entry.size) {
        await reader.cancel();
        throw new Error("Public body exceeds pinned size");
      }
      hasher.update(value);
    }
  } finally {
    reader.releaseLock();
  }
  if (size !== entry.size || hasher.digest("hex") !== entry.sha256)
    throw new Error("Public bytes differ");
  return response.headers;
}
export async function parallel<T>(items: T[], task: (item: T) => Promise<void>) {
  let cursor = 0,
    failed = false;
  const results = await Promise.allSettled(
    Array.from({ length: Math.min(16, items.length) }, async () => {
      while (!failed && cursor < items.length) {
        try {
          await task(items[cursor++]!);
        } catch (error) {
          failed = true;
          throw error;
        }
      }
    }),
  );
  for (const result of results) if (result.status === "rejected") throw result.reason;
}
async function api(options: PublishCatalogOptions, manifest: Manifest) {
  const token = await readToken(options.tokenFile);
  if (!token) throw new Error("Owner token unavailable");
  const base = `https://api.cloudflare.com/client/v4/accounts/${manifest.accountId}/workers/scripts/${manifest.worker}`;
  async function request(suffix: string, method = "GET", body?: FormData) {
    const init: RequestInit = {
      method,
      headers: { Authorization: "Bearer " + token },
      redirect: "error",
      signal: AbortSignal.timeout(30000),
    };
    if (body) init.body = body;
    const response = await fetch(base + suffix, init);
    if (!response.ok) throw new Error("Cloudflare HTTP " + response.status);
    return response;
  }
  async function json(suffix: string, method = "GET", body?: FormData): Promise<Json> {
    const value = await (await request(suffix, method, body)).json();
    if (!value.success) throw new Error("Cloudflare request refused");
    return value.result;
  }
  async function snapshot(): Promise<Snapshot> {
    const settings = (await json("/settings")) as unknown as Settings;
    const form = await (await request("")).formData();
    const files = [];
    for (const [name, part] of form)
      if (name !== "metadata")
        files.push({
          name,
          sha256: typeof part === "string" ? digest(part) : sha(await part.arrayBuffer()),
        });
    if (!files.length) throw new Error("No deployed code");
    const deployments = (await json("/deployments")) as { deployments?: { id: string }[] };
    if (!deployments.deployments?.[0]?.id) throw new Error("No deployed version");
    return {
      settings,
      codeSha256: digest(JSON.stringify(files.toSorted((a, b) => a.name.localeCompare(b.name)))),
      deployment: deployments.deployments[0].id,
    };
  }
  return {
    snapshot,
    async patch(settings: Json) {
      const form = new FormData();
      form.set("settings", JSON.stringify(settings));
      await json("/settings", "PATCH", form);
    },
  };
}
function guard(snapshot: Snapshot, options: PublishCatalogOptions) {
  if (
    snapshot.codeSha256 !== options.expectedCodeSha256 ||
    snapshot.deployment !== options.expectedDeployment ||
    snapshot.settings.bindings.find((b) => b.name === "MANIFEST_PREFIX")?.text !==
      options.expectedPrefix
  )
    throw new Error("Deployed baseline drift");
}
export function inventoryMatchesBindings(
  entries: Record<string, InventoryEntry>,
  bindings: Binding[],
) {
  const shards: Record<string, Record<string, Omit<InventoryEntry, "sourcePath">>> = {};
  for (const path of Object.keys(entries).toSorted()) {
    const { sourcePath: _privatePath, ...entry } = entries[path]!;
    (shards[digest(path).slice(0, 2)] ??= {})[path] = entry;
  }
  const hashes = Object.assign(
    {},
    ...bindings
      .filter((binding) => binding.name.startsWith("MANIFEST_SHARD_HASHES_"))
      .map((binding) => binding.json),
  ) as Record<string, string>;
  for (let i = 0; i < 256; i++) {
    const key = i.toString(16).padStart(2, "0");
    if (digest(JSON.stringify(shards[key] ?? {})) !== hashes[key])
      throw new Error("Previous inventory differs from deployed manifest");
  }
}

export function siteRecoveryScope(
  options: Pick<
    PublishCatalogOptions,
    "siteRelease" | "qualificationScope" | "qualificationOrigins"
  >,
  receipt: {
    qualificationScope?: PublishCatalogOptions["qualificationScope"];
    scopeSha256?: string;
    complete?: boolean;
    completeScope?: boolean;
    completeManifest?: boolean;
    publicFilesVerified?: number;
  },
  entries: Record<string, InventoryEntry>,
) {
  const scope = options.qualificationScope;
  if (
    !options.siteRelease ||
    !options.qualificationOrigins ||
    scope?.coverage !== "explicit-paths" ||
    !Array.isArray(scope.paths) ||
    scope.paths.length < 1 ||
    scope.paths.length > 2048
  )
    throw new Error("Site recovery requires an explicit bounded native scope");
  const paths = scope.paths.toSorted();
  if (
    new Set(paths).size !== paths.length ||
    paths.some(
      (path) =>
        typeof path !== "string" ||
        path.length > 4096 ||
        !/^\/(?:catalog\/assets\/|media\/episodes\/[1-9]\d*\/|_next\/static\/|publications\/[a-z0-9-]+\/)[a-zA-Z0-9_./-]+$/.test(
          path,
        ) ||
        path.split("/").some((segment) => segment.startsWith(".")) ||
        !Object.hasOwn(entries, path),
    )
  )
    throw new Error("Site recovery path is private, unsafe or absent from the pinned inventory");
  if (!paths.includes("/catalog/assets/index.json"))
    throw new Error("Site recovery scope requires the canonical catalogue index");
  const scopeSha256 = digest(JSON.stringify(paths));
  if (
    receipt.complete !== false ||
    receipt.completeScope !== true ||
    receipt.completeManifest !== false ||
    receipt.publicFilesVerified !== paths.length ||
    receipt.qualificationScope?.coverage !== scope.coverage ||
    !Array.isArray(receipt.qualificationScope.paths) ||
    JSON.stringify(receipt.qualificationScope.paths.toSorted()) !== JSON.stringify(paths) ||
    receipt.scopeSha256 !== scopeSha256
  )
    throw new Error("Site recovery receipt scope differs or claims full coverage");
  return {
    qualificationScope: { coverage: "explicit-paths" as const, paths },
    scopeSha256,
    selected: paths.map((path) => [path, entries[path]!] as const),
  };
}
/** Finish a previously activated, independently qualified immutable candidate; no upload or PATCH. */
export async function verifyQualifiedPublication(
  options: PublishCatalogOptions,
  receiptPath: string,
  receiptSha256: string,
) {
  const inventoryRoot = await realpath(options.inventoryRoot),
    stateDirectory = await realpath(options.stateDirectory);
  const directoryInfo = await lstat(options.stateDirectory);
  if (
    !directoryInfo.isDirectory() ||
    directoryInfo.isSymbolicLink() ||
    (process.platform !== "win32" &&
      (directoryInfo.mode & 0o077 || directoryInfo.uid !== process.getuid?.()))
  )
    throw new Error("Qualification state directory is not private");
  if (!within(stateDirectory, inventoryRoot) || !within(await realpath(receiptPath), inventoryRoot))
    throw new Error("Qualification outside owner scope");
  const info = await lstat(receiptPath);
  if (
    !info.isFile() ||
    info.isSymbolicLink() ||
    info.size > 32768 ||
    (process.platform !== "win32" && (info.mode & 0o077 || info.uid !== process.getuid?.()))
  )
    throw new Error("Qualified receipt changed");
  const text = await Bun.file(receiptPath).text();
  if (digest(text) !== receiptSha256) throw new Error("Qualified receipt changed");
  const qualified = JSON.parse(text);
  const origins = qualificationOrigins(options);
  assertQualificationReceipt(options, qualified);
  if (
    (options.siteRelease
      ? qualified.completeScope !== true ||
        qualified.completeManifest !== false ||
        qualified.complete !== false
      : qualified.complete !== true) ||
    qualified.apiMutations !== 0 ||
    qualified.registryMutations !== 0 ||
    !Number.isSafeInteger(qualified.publicFilesVerified) ||
    qualified.publicFilesVerified < 1 ||
    qualified.actualGets !== origins.length * qualified.publicFilesVerified ||
    !/^[a-f0-9]{64}$/.test(qualified.inventorySha256 ?? "") ||
    qualified.codeSha256 !== options.expectedCodeSha256
  )
    throw new Error("Qualification is incomplete");
  await mkdir(join(stateDirectory, "publish.lock"), { mode: 0o700 });
  try {
    const stateInfo = await lstat(join(stateDirectory, "current-inventory.json")),
      state = await Bun.file(join(stateDirectory, "current-inventory.json")).json();
    if (
      !stateInfo.isFile() ||
      stateInfo.isSymbolicLink() ||
      (process.platform !== "win32" &&
        (stateInfo.mode & 0o077 || stateInfo.uid !== process.getuid?.())) ||
      state.inventorySha256 !== qualified.inventorySha256 ||
      state.inventoryPath !== qualified.inventoryPath ||
      state.deploymentId !== qualified.deploymentId ||
      state.prefix !== qualified.prefix ||
      state.codeSha256 !== qualified.codeSha256
    )
      throw new Error("Qualified state differs");
    if (
      !within(await realpath(qualified.inventoryPath), inventoryRoot) ||
      sha(await Bun.file(qualified.inventoryPath).arrayBuffer()) !== qualified.inventorySha256
    )
      throw new Error("Qualified inventory changed");
    const manifest = (await Bun.file(options.manifest).json()) as Manifest;
    validateManifest(manifest);
    const owner = await api(options, manifest),
      before = await owner.snapshot();
    guard(before, {
      ...options,
      expectedDeployment: qualified.deploymentId,
      expectedPrefix: qualified.prefix,
      expectedCodeSha256: qualified.codeSha256,
    });
    const plan = (await Bun.file(join(options.job, "publication-plan.json")).json()) as Plan;
    if (
      plan.inventorySha256 !== qualified.inventorySha256 ||
      plan.prefix !== qualified.prefix ||
      plan.before.codeSha256 !== qualified.codeSha256 ||
      sha(await Bun.file(options.manifest).arrayBuffer()) !== plan.manifestSha256 ||
      sha(await Bun.file(options.sdkModule).arrayBuffer()) !== plan.sdkSha256
    )
      throw new Error("Original owner plan changed");
    if (
      options.siteRelease &&
      (!plan.options.siteRelease ||
        JSON.stringify(options.siteRelease) !== JSON.stringify(plan.options.siteRelease) ||
        siteReleaseTarget(plan.options.targetUrl).href !==
          siteReleaseTarget(options.targetUrl).href)
    )
      throw new Error("Original site release scope differs");
    if (!options.siteRelease && options.qualificationScope)
      throw new Error("Explicit recovery scope requires a site release");
    const actual: Json = {
      bindings: before.settings.bindings,
      annotations: Object.fromEntries(
        Object.entries(before.settings.annotations ?? {}).filter(
          ([key]) => key !== "workers/triggered_by",
        ),
      ),
    };
    for (const key of settingsKeys)
      if (before.settings[key] !== undefined) actual[key] = before.settings[key];
    if (
      Object.keys(before.settings).some(
        (key) => !["bindings", "annotations", ...settingsKeys].includes(key),
      ) ||
      JSON.stringify(actual) !== JSON.stringify(plan.settings)
    )
      throw new Error("Qualified settings differ from original plan");
    const delta = (await Bun.file(qualified.inventoryPath).json()) as Delta;
    inventoryMatchesBindings(delta.entries, before.settings.bindings);
    const nativeOriginAttestation = await attestQualificationOrigins(
      options,
      qualified.prefix,
      qualified.inventorySha256,
    );
    const target = options.siteRelease
      ? siteReleaseTarget(options.targetUrl)
      : publicTarget(options.targetUrl);
    if (target.origin !== "https://dragonballfr.com") throw new Error("Target site differs");
    const recoveryScope = options.siteRelease
      ? siteRecoveryScope(options, qualified, delta.entries)
      : null;
    const selected =
      recoveryScope?.selected ??
      Object.entries(delta.entries).filter(
        ([path]) => path.startsWith(target.pathname + "/") || path === "/catalog/assets/index.json",
      );
    if (
      !options.siteRelease &&
      !selected.some(([path]) => path === target.pathname + "/index.json")
    )
      throw new Error("Qualified publication index missing");
    await parallel(selected, async ([path, entry]) => {
      for (const origin of origins) {
        const headers = await verifyPublic(new URL(path, origin), entry);
        if (path.endsWith("/index.json") && headers.get("cache-control") !== "no-store")
          throw new Error("Public index must be no-store");
      }
    });
    await attestQualificationOrigins(options, qualified.prefix, qualified.inventorySha256);
    if (
      JSON.stringify(await owner.snapshot()) !== JSON.stringify(before) ||
      JSON.stringify(await Bun.file(join(stateDirectory, "current-inventory.json")).json()) !==
        JSON.stringify(state)
    )
      throw new Error("Final qualified tuple drift");
    return {
      ...qualified,
      indexSha256:
        delta.entries[
          options.siteRelease ? "/catalog/assets/index.json" : target.pathname + "/index.json"
        ]?.sha256 ?? null,
      ...(recoveryScope
        ? {
            qualificationScope: recoveryScope.qualificationScope,
            scopeSha256: recoveryScope.scopeSha256,
            complete: false,
            completeScope: true,
            completeManifest: false,
            manifestPublicFiles: Object.keys(delta.entries).length,
          }
        : {}),
      sourceBefore: before.codeSha256,
      sourceAfter: before.codeSha256,
      freshPublicGetChecks: origins.length * selected.length,
      qualificationOrigins: origins,
      workerPublicQualified: !options.qualificationOrigins,
      nativeOriginAttestation,
      attestationGetChecks: options.qualificationOrigins ? 2 * origins.length : 0,
      qualifiedReceiptSha256: receiptSha256,
      qualificationRecovery: true,
      urls: selected
        .filter(([path]) => options.siteRelease || path.startsWith(target.pathname + "/"))
        .map(([path, entry]) => ({
          url: new URL(path, options.cdnOrigin).href,
          sha256: entry.sha256,
          size: entry.size,
        })),
    };
  } finally {
    await rmdir(join(stateDirectory, "publish.lock"));
  }
}
async function privatePublicationReceipt(path: string): Promise<Json> {
  const info = await lstat(path);
  if (
    !info.isFile() ||
    info.isSymbolicLink() ||
    info.size > 2 * 1024 * 1024 ||
    (process.platform !== "win32" && (info.uid !== process.getuid?.() || info.mode & 0o077))
  )
    throw Error("Owner publication receipt is not private");
  return Bun.file(path).json();
}
/** Match public bytes before generating the timestamped catalogue. All writes stay in publishCatalog. */
export async function verifyUnchangedPublicInputs(options: PublishCatalogOptions) {
  if (options.siteRelease || options.qualificationScope) return null;
  const target = publicTarget(options.targetUrl);
  const inventoryRoot = await realpath(options.inventoryRoot);
  const stateDirectory = await realpath(options.stateDirectory);
  const root = await realpath(options.publicRoot);
  const privateFile = async (path: string, bound: number) => {
    const info = await lstat(path);
    if (
      !info.isFile() ||
      info.isSymbolicLink() ||
      info.size > bound ||
      !within(await realpath(path), inventoryRoot) ||
      (process.platform !== "win32" && (info.uid !== process.getuid?.() || info.mode & 0o077))
    )
      throw Error("Unchanged publication file is not private");
    return Bun.file(path).bytes();
  };
  const stateInfo = await lstat(options.stateDirectory),
    rootInfo = await lstat(options.publicRoot);
  if (
    !within(stateDirectory, inventoryRoot) ||
    !stateInfo.isDirectory() ||
    stateInfo.isSymbolicLink() ||
    !within(root, inventoryRoot) ||
    !rootInfo.isDirectory() ||
    rootInfo.isSymbolicLink() ||
    (process.platform !== "win32" &&
      (stateInfo.uid !== process.getuid?.() || stateInfo.mode & 0o077))
  )
    throw Error("Unchanged publication scope is not private");
  await mkdir(join(stateDirectory, "publish.lock"), { mode: 0o700 });
  try {
    const statePath = join(stateDirectory, "current-inventory.json");
    const stateBytes = await privateFile(statePath, 16384),
      stateSha256 = digest(stateBytes);
    const state = JSON.parse(new TextDecoder().decode(stateBytes));
    if (
      !/^[a-f0-9]{64}$/.test(state.inventorySha256 ?? "") ||
      !/^[a-f0-9]{64}$/.test(state.codeSha256 ?? "") ||
      typeof state.receiptPath !== "string"
    )
      throw Error("Unchanged publication state is incomplete");
    const inventoryBytes = await privateFile(state.inventoryPath, 256 * 1024 * 1024);
    if (digest(inventoryBytes) !== state.inventorySha256)
      throw Error("Current inventory SHA changed");
    const delta = JSON.parse(new TextDecoder().decode(inventoryBytes)) as Delta;
    const extensions = new Set(
      "jpg jpeg png webp avif svg ico gif mp4 webm mp3 m4a ogg flac wav srt vtt woff woff2 ttf otf eot css js mjs json webmanifest html wasm br gz zip rar 7z pdf txt md wgsl".split(
        " ",
      ),
    );
    const paths: string[] = [];
    // oxlint-disable no-await-in-loop -- Serial streams bound file handles and detect changes per file.
    const scan = async () => {
      const scanned: Record<string, InventoryEntry> = {};
      for await (const local of new Bun.Glob("**/*").scan({
        cwd: root,
        dot: true,
        onlyFiles: false,
        followSymlinks: false,
      })) {
        const segments = local.replaceAll("\\", "/").split("/");
        if (segments.some((part) => part.startsWith(".") && part !== ".well-known")) continue;
        const source = join(root, local),
          info = await lstat(source);
        if (info.isSymbolicLink())
          throw Error("Review public symlink before unchanged verification");
        if (!info.isFile() || !extensions.has(extname(source).slice(1).toLowerCase())) continue;
        if (!within(await realpath(source), root))
          throw Error("Unchanged public input escaped scope");
        const path = "/" + segments.join("/");
        if (!path.startsWith(target.pathname + "/"))
          throw Error("Unchanged input outside publication target");
        const hasher = new Bun.CryptoHasher("sha256");
        for await (const chunk of Bun.file(source).stream()) hasher.update(chunk);
        const after = await lstat(source);
        if (after.size !== info.size || after.mtimeMs !== info.mtimeMs || after.isSymbolicLink())
          throw Error("Public input changed during unchanged verification");
        scanned[path] = {
          sourcePath: source,
          sha256: hasher.digest("hex"),
          size: info.size,
          contentType: Bun.file(source).type || "application/octet-stream",
          cacheControl: /^\/publications\/[^/]+\/index\.json$/.test(path)
            ? "no-store"
            : "public, max-age=86400, stale-while-revalidate=604800",
        };
      }
      return scanned;
    };
    // oxlint-enable no-await-in-loop
    const scanned = await scan();
    for (const [path, entry] of Object.entries(scanned)) {
      const prior = delta.entries[path];
      if (
        !prior ||
        ["sha256", "size", "contentType", "cacheControl"].some(
          (key) => entry[key as keyof InventoryEntry] !== prior[key as keyof InventoryEntry],
        )
      )
        return null;
      paths.push(path);
    }
    const indexPath = target.pathname + "/index.json";
    if (!paths.includes(indexPath)) return null;
    const receiptBytes = await privateFile(state.receiptPath, 2 * 1024 * 1024);
    const receipt = JSON.parse(new TextDecoder().decode(receiptBytes));
    const origins = qualificationOrigins(options);
    if (
      receipt.complete !== true ||
      receipt.inventoryPath !== state.inventoryPath ||
      receipt.inventorySha256 !== state.inventorySha256 ||
      receipt.prefix !== state.prefix ||
      receipt.deploymentId !== state.deploymentId ||
      receipt.sourceAfter !== state.codeSha256 ||
      receipt.actualGets !== origins.length * receipt.publicFilesVerified ||
      !Number.isSafeInteger(receipt.publicFilesVerified) ||
      receipt.publicFilesVerified < 1
    )
      throw Error("Current qualified receipt differs from state");
    assertQualificationReceipt(options, receipt);
    const plan = JSON.parse(
      new TextDecoder().decode(
        await privateFile(
          join(dirname(state.receiptPath), "publication-plan.json"),
          2 * 1024 * 1024,
        ),
      ),
    ) as Plan;
    if (
      plan.inventorySha256 !== state.inventorySha256 ||
      plan.prefix !== state.prefix ||
      plan.before.codeSha256 !== state.codeSha256 ||
      sha(await Bun.file(options.manifest).arrayBuffer()) !== plan.manifestSha256 ||
      sha(await Bun.file(options.sdkModule).arrayBuffer()) !== plan.sdkSha256
    )
      throw Error("Qualified publication owner pins changed");
    const manifest = await Bun.file(options.manifest).json();
    validateManifest(manifest);
    const owner = await api(options, manifest),
      before = await owner.snapshot();
    guard(before, {
      ...options,
      expectedDeployment: state.deploymentId,
      expectedCodeSha256: state.codeSha256,
      expectedPrefix: state.prefix,
    });
    inventoryMatchesBindings(delta.entries, before.settings.bindings);
    const activation = await loadOriginInventoryActivation(options);
    if (options.qualificationOrigins && !activation)
      throw Error("Native unchanged verification requires pinned origin replay");
    if (activation) {
      const replay = await activation.activate({
        inventoryPath: state.inventoryPath,
        inventorySha256: state.inventorySha256,
        manifestPrefix: state.prefix,
        publisherLock: join(stateDirectory, "publish.lock"),
      });
      if (
        replay.applied !== false ||
        replay.replay !== true ||
        replay.writes !== 0 ||
        replay.inventorySha256 !== state.inventorySha256
      )
        throw Error("Unchanged native replay mutated state");
    }
    const nativeOriginAttestation = await attestQualificationOrigins(
      options,
      state.prefix,
      state.inventorySha256,
    );
    await Promise.all(
      origins.map((origin) => verifyPublic(new URL(indexPath, origin), scanned[indexPath]!)),
    );
    if (
      JSON.stringify(await owner.snapshot()) !== JSON.stringify(before) ||
      digest(await privateFile(statePath, 16384)) !== stateSha256 ||
      digest(await privateFile(state.receiptPath, 2 * 1024 * 1024)) !== digest(receiptBytes) ||
      !Bun.deepEquals(await scan(), scanned)
    )
      throw Error("Unchanged publication state or public inputs drifted");
    return {
      ...receipt,
      noChange: true,
      writes: 0,
      apiMutations: 0,
      registryMutations: 0,
      nativeOriginReplay: activation !== null,
      receiptPath: state.receiptPath,
      qualifiedReceiptSha256: digest(receiptBytes),
      stateSha256,
      indexSha256: scanned[indexPath]!.sha256,
      historicalPublicGetChecks: receipt.actualGets,
      actualGets: origins.length,
      freshPublicGetChecks: origins.length,
      inputFilesCompared: paths.length,
      nativeOriginAttestation,
      freshChecks: {
        indexPublicGets: origins.length,
        nativeAttestationGets: options.qualificationOrigins ? origins.length : 0,
        workerSnapshots: 2,
      },
      urls: paths.map((path) => ({
        url: new URL(path, options.cdnOrigin).href,
        sha256: scanned[path]!.sha256,
        size: scanned[path]!.size,
      })),
    };
  } finally {
    await rmdir(join(stateDirectory, "publish.lock"));
  }
}
export function assertActivatedPublicationResume(
  plan: Pick<Plan, "inventorySha256" | "prefix" | "before" | "settings">,
  planSha256: string,
  upload: Json,
  activated: Json,
  current: Snapshot,
  objects: number,
) {
  const actual: Json = {
    bindings: current.settings.bindings,
    annotations: Object.fromEntries(
      Object.entries(current.settings.annotations ?? {}).filter(
        ([key]) => key !== "workers/triggered_by",
      ),
    ),
  };
  for (const key of settingsKeys)
    if (current.settings[key] !== undefined) actual[key] = current.settings[key];
  if (
    upload.inventorySha256 !== plan.inventorySha256 ||
    upload.prefix !== plan.prefix ||
    upload.objectsVerified !== objects ||
    upload.shardsVerified !== 256 ||
    upload.verificationScope !== "S3 bytes SHA and metadata" ||
    activated.inventorySha256 !== plan.inventorySha256 ||
    activated.prefix !== plan.prefix ||
    activated.planSha256 !== planSha256 ||
    activated.publicQualificationComplete !== false ||
    activated.deploymentId !== current.deployment ||
    activated.codeSha256 !== current.codeSha256 ||
    current.codeSha256 !== plan.before.codeSha256 ||
    activated.settingsSha256 !== digest(JSON.stringify(actual)) ||
    JSON.stringify(actual) !== JSON.stringify(plan.settings)
  )
    throw Error("Activated publication receipts or live Worker differ");
}
async function publishCatalogCore(inputOptions: PublishCatalogOptions, resume = false) {
  if (inputOptions.qualificationScope)
    throw new Error("Explicit qualification scopes are read-only recovery capabilities");
  let options = inputOptions;
  const target = options.siteRelease
    ? siteReleaseTarget(options.targetUrl)
    : publicTarget(options.targetUrl);
  const root = await realpath(options.publicRoot);
  const job = resolve(options.job);
  const info = await stat(job).catch(() => undefined);
  if (
    info &&
    process.platform !== "win32" &&
    (info.mode & 0o077 || info.uid !== process.getuid?.())
  )
    throw new Error("Job must be owner private");
  await mkdir(job, { recursive: true, mode: 0o700 });
  const stateDirectory = resolve(options.stateDirectory);
  await mkdir(stateDirectory, { recursive: true, mode: 0o700 });
  const stateInfo = await stat(stateDirectory);
  if (
    process.platform !== "win32" &&
    (stateInfo.mode & 0o077 || stateInfo.uid !== process.getuid?.())
  )
    throw new Error("Publication state must be private");
  await mkdir(join(stateDirectory, "publish.lock"), { mode: 0o700 });
  try {
    const inventoryRoot = await realpath(options.inventoryRoot);
    if (
      !within(await realpath(stateDirectory), inventoryRoot) ||
      (await lstat(stateDirectory)).isSymbolicLink()
    )
      throw new Error("Publication state outside owner inventory root");
    if (!within(await realpath(job), inventoryRoot))
      throw new Error("Job outside owner inventory root");
    let publicRoots = [root];
    if (options.siteRelease) {
      const release = options.siteRelease;
      if (!/^[a-f0-9]{64}$/.test(release.archiveSha256))
        throw new Error("Sealed public archive SHA required");
      const archive = await realpath(release.archivePath);
      if (
        !within(root, inventoryRoot) ||
        !within(archive, inventoryRoot) ||
        (await lstat(options.publicRoot)).isSymbolicLink() ||
        (await sealedArchiveSha256(release.archivePath)) !== release.archiveSha256
      )
        throw new Error("Sealed public archive outside protected scope or SHA differs");
      publicRoots = await Promise.all(
        [join(release.siteRoot, "public"), release.staticRoot, release.releasePublicRoot].map(
          async (path) => {
            const resolved = await realpath(path),
              inputInfo = await lstat(path);
            if (!within(resolved, root) || !inputInfo.isDirectory() || inputInfo.isSymbolicLink())
              throw new Error("Site input outside sealed public root");
            return resolved;
          },
        ),
      );
    }
    const statePath = join(stateDirectory, "current-inventory.json");
    const currentStateInfo = await lstat(statePath).catch((error: { code?: string }) => {
      if (error.code === "ENOENT") return undefined;
      throw error;
    });
    let stateSha256: string | null = null;
    if (currentStateInfo) {
      if (
        !currentStateInfo.isFile() ||
        currentStateInfo.isSymbolicLink() ||
        (process.platform !== "win32" &&
          (currentStateInfo.mode & 0o077 || currentStateInfo.uid !== process.getuid?.())) ||
        currentStateInfo.size > 16384
      )
        throw new Error("Publication state permissions invalid");
      const text = await Bun.file(statePath).text(),
        state = JSON.parse(text);
      stateSha256 = digest(text);
      if (
        !/^[a-f0-9]{64}$/.test(state.inventorySha256 ?? "") ||
        !/^[a-f0-9]{64}$/.test(state.codeSha256 ?? "") ||
        !/^_migration\/manifests\/[a-z0-9-]+\/$/.test(state.prefix ?? "") ||
        !/^[a-f0-9-]{36}$/.test(state.deploymentId ?? "")
      )
        throw new Error("Publication state invalid");
      const previous = await realpath(state.inventoryPath);
      const previousInfo = await lstat(state.inventoryPath);
      if (
        !within(previous, inventoryRoot) ||
        !previousInfo.isFile() ||
        previousInfo.isSymbolicLink() ||
        (process.platform !== "win32" &&
          (previousInfo.mode & 0o077 || previousInfo.uid !== process.getuid?.()))
      )
        throw new Error("State inventory outside protected owner root");
      options = {
        ...options,
        previousInventory: previous,
        previousInventorySha256: state.inventorySha256,
        expectedPrefix: state.prefix,
        expectedDeployment: state.deploymentId,
        expectedCodeSha256: state.codeSha256,
      };
    }
    const manifest = (await Bun.file(options.manifest).json()) as Manifest;
    validateManifest(manifest);
    const origins = qualificationOrigins(options);
    const originActivation = await loadOriginInventoryActivation(options);
    for (const origin of origins) {
      const url = new URL(origin);
      if (
        url.protocol !== "https:" ||
        url.username ||
        url.password ||
        url.pathname !== "/" ||
        url.search ||
        url.hash
      )
        throw new Error("Invalid public origin");
    }
    if (target.origin !== "https://dragonballfr.com") throw new Error("Target site differs");
    if (
      sha(await Bun.file(options.previousInventory).arrayBuffer()) !==
      options.previousInventorySha256
    )
      throw new Error("Previous inventory changed");
    const owner = await api(options, manifest);
    const planPath = join(job, "publication-plan.json");
    let plan: Plan;
    if (!options.apply) {
      const before = await owner.snapshot();
      guard(before, options);
      inventoryMatchesBindings(
        (await Bun.file(options.previousInventory).json()).entries,
        before.settings.bindings,
      );
      await attestQualificationOrigins(
        options,
        options.expectedPrefix,
        options.previousInventorySha256,
      );
      const controls = before.settings.bindings.filter((binding) =>
        ["IMPORT_ENABLED", "VERIFY_UPLOADS"].includes(binding.name),
      );
      if (
        controls.length !== 2 ||
        controls.some((binding) => binding.type !== "plain_text" || binding.text !== "false")
      )
        throw new Error("Worker import or verification mode differs");
      const emptySite = join(job, "empty-site"),
        emptyStatic = join(job, "empty-static");
      await mkdir(join(emptySite, "public"), { recursive: true, mode: 0o700 });
      await mkdir(emptyStatic, { mode: 0o700 });
      await generateInventory([
        "--previous",
        options.previousInventory,
        "--previous-sha256",
        options.previousInventorySha256,
        "--site",
        options.siteRelease?.siteRoot ?? emptySite,
        "--static",
        options.siteRelease?.staticRoot ?? emptyStatic,
        "--release-public",
        options.siteRelease?.releasePublicRoot ?? root,
        "--out",
        join(job, "delta"),
      ]);
      const hashes = (await Bun.file(join(job, "delta/shard-hashes.json")).json()) as Record<
        string,
        string
      >;
      const inventorySha256 = sha(await Bun.file(join(job, "delta/inventory.json")).arrayBuffer());
      const generated = (await Bun.file(join(job, "delta/inventory.json")).json()) as Delta;
      const publicEntries = inputEntries(generated.entries, publicRoots);
      if (
        options.siteRelease &&
        publicEntries.some(
          ([path]) =>
            path.startsWith("/publications/") ||
            path === "/catalog/assets" ||
            path.startsWith("/catalog/assets/"),
        )
      )
        throw new Error("Site inputs overlap source or generated catalogue namespace");
      if (
        !options.siteRelease &&
        !publicEntries.some(([path]) => path === target.pathname + "/index.json")
      )
        throw new Error("Publication index missing");
      if (options.siteRelease && !publicEntries.length)
        throw new Error("Empty sealed site publication");
      for (const [path, entry] of options.siteRelease ? [] : publicEntries) {
        const suffix = path.slice(target.pathname.length);
        if (
          !path.startsWith(target.pathname + "/") ||
          (suffix !== "/index.json" &&
            !new RegExp("^/objects/" + entry.sha256 + "\\.[a-z0-9]+$").test(suffix))
        )
          throw new Error("Public root contains unrelated or non-addressed files");
      }
      const prefix =
        "_migration/manifests/" +
        (options.siteRelease ? "site-" : "publication-") +
        inventorySha256.slice(0, 24) +
        "/";
      const { settings, changedNames } = pointerSettings(before.settings, prefix, hashes);
      const { apply: _apply, planSha256: _planSha, ...pinnedOptions } = options;
      plan = {
        schema: "shenron-cdn-publication-plan/v1",
        options: pinnedOptions,
        before,
        prefix,
        inventorySha256,
        objectsSha256: sha(await Bun.file(join(job, "delta/delta-objects.json")).arrayBuffer()),
        shardHashes: hashes,
        settings,
        changedNames,
        manifestSha256: sha(await Bun.file(options.manifest).arrayBuffer()),
        sdkSha256: sha(await Bun.file(options.sdkModule).arrayBuffer()),
        stateSha256,
      };
      await writeFile(planPath, JSON.stringify(plan), { mode: 0o600, flag: "wx" });
      return {
        prepared: true,
        planSha256: digest(JSON.stringify(plan)),
        inventorySha256,
        prefix,
        changedNames,
      };
    }
    const planText = await Bun.file(planPath).text();
    if (digest(planText) !== options.planSha256) throw new Error("Reviewed plan changed");
    plan = JSON.parse(planText);
    if (plan.stateSha256 !== stateSha256)
      throw new Error("Publication state changed after preparation");
    if (
      sha(await Bun.file(options.manifest).arrayBuffer()) !== plan.manifestSha256 ||
      sha(await Bun.file(options.sdkModule).arrayBuffer()) !== plan.sdkSha256
    )
      throw new Error("Owner capability changed after preparation");
    const { apply: _apply, planSha256: _planSha, ...pinnedOptions } = options;
    if (JSON.stringify(pinnedOptions) !== JSON.stringify(plan.options))
      throw new Error("Publication options changed");
    const delta = (await Bun.file(join(job, "delta/inventory.json")).json()) as Delta;
    if (
      sha(await Bun.file(join(job, "delta/inventory.json")).arrayBuffer()) !==
        plan.inventorySha256 ||
      sha(await Bun.file(join(job, "delta/delta-objects.json")).arrayBuffer()) !==
        plan.objectsSha256
    )
      throw new Error("Staged inventory changed");
    const current = await owner.snapshot();
    const roots = [...publicRoots, await realpath(join(job, "delta/public-catalog"))];
    const objects = inventory(await Bun.file(join(job, "delta/delta-objects.json")).json());
    if (objects.length !== delta.addedObjects) throw new Error("Delta object count differs");
    let after = current;
    if (resume) {
      assertActivatedPublicationResume(
        plan,
        options.planSha256!,
        await privatePublicationReceipt(join(job, "upload-receipt.json")),
        await privatePublicationReceipt(join(job, "activation-receipt.json")),
        current,
        objects.length,
      );
    } else {
      guard(current, options);
      if (JSON.stringify(current) !== JSON.stringify(plan.before))
        throw new Error("Concurrent Worker settings changed");
      const store = await objectStore(options.profile, manifest, options.sdkModule);
      await parallel(objects, async (entry) => {
        const path = await realpath(entry.sourcePath);
        if (!roots.some((allowedRoot) => within(path, allowedRoot)))
          throw new Error("Object outside public roots");
        const bytes = new Uint8Array(await Bun.file(path).arrayBuffer());
        if (bytes.length !== entry.size) throw new Error("Object size changed");
        await store.put(
          "_objects/" + entry.sha256,
          bytes,
          entry.sha256,
          entry.contentType,
          "public, max-age=31536000, immutable",
        );
      });
      await parallel(Object.entries(plan.shardHashes), async ([key, hash]) => {
        const bytes = new Uint8Array(
          await Bun.file(join(job, "delta/shards/" + key + ".json")).arrayBuffer(),
        );
        await store.put(
          plan.prefix + key + ".json",
          bytes,
          hash,
          "application/json",
          "public, max-age=31536000, immutable",
        );
      });
      await writeFile(
        join(job, "upload-receipt.json"),
        JSON.stringify({
          finishedAt: new Date().toISOString(),
          inventorySha256: plan.inventorySha256,
          prefix: plan.prefix,
          objectsVerified: objects.length,
          shardsVerified: 256,
          verificationScope: "S3 bytes SHA and metadata",
        }),
        { mode: 0o600, flag: "wx" },
      );
      const last = await owner.snapshot();
      if (JSON.stringify(last) !== JSON.stringify(plan.before))
        throw new Error("Worker drift after staged upload");
      await owner.patch(plan.settings);
      after = await owner.snapshot();
    }
    const actual: Json = {
      bindings: after.settings.bindings,
      annotations: Object.fromEntries(
        Object.entries(after.settings.annotations ?? {}).filter(
          ([key]) => key !== "workers/triggered_by",
        ),
      ),
    };
    for (const key of settingsKeys)
      if (after.settings[key] !== undefined) actual[key] = after.settings[key];
    if (
      after.codeSha256 !== plan.before.codeSha256 ||
      JSON.stringify(actual) !== JSON.stringify(plan.settings)
    )
      throw new Error("Worker readback differs");
    if (!resume)
      await writeFile(
        join(job, "activation-receipt.json"),
        JSON.stringify({
          activatedAt: new Date().toISOString(),
          deploymentId: after.deployment,
          prefix: plan.prefix,
          inventorySha256: plan.inventorySha256,
          codeSha256: after.codeSha256,
          settingsSha256: digest(JSON.stringify(actual)),
          planSha256: options.planSha256,
          publicQualificationComplete: false,
        }),
        { mode: 0o600, flag: "wx" },
      );
    if (originActivation) {
      const receipt = await originActivation.activate({
        inventoryPath: join(job, "delta/inventory.json"),
        inventorySha256: plan.inventorySha256,
        manifestPrefix: plan.prefix,
        publisherLock: join(stateDirectory, "publish.lock"),
      });
      if (
        receipt.inventorySha256 !== plan.inventorySha256 ||
        typeof receipt.applied !== "boolean" ||
        typeof receipt.replay !== "boolean" ||
        receipt.applied === receipt.replay ||
        receipt.writes !== (receipt.applied ? 1 : 0)
      )
        throw Error("Infra origin activation readback differs");
      const originReceiptPath = join(job, "origin-activation-receipt.json");
      if (resume && (await Bun.file(originReceiptPath).exists())) {
        const stored = await privatePublicationReceipt(originReceiptPath);
        if (
          stored.inventorySha256 !== receipt.inventorySha256 ||
          typeof stored.applied !== "boolean" ||
          typeof stored.replay !== "boolean" ||
          stored.applied === stored.replay ||
          stored.writes !== (stored.applied ? 1 : 0)
        )
          throw Error("Stored origin activation receipt differs");
      } else
        await writeFile(originReceiptPath, JSON.stringify(receipt), {
          mode: 0o600,
          flag: "wx",
        });
    }
    const selected = Object.entries(delta.entries).filter(
      ([path]) =>
        (options.siteRelease
          ? inputEntries({ [path]: delta.entries[path]! }, publicRoots).length > 0
          : path.startsWith(target.pathname + "/")) ||
        (path.startsWith("/catalog/assets/") && path.includes(delta.catalog.revision)) ||
        path === "/catalog/assets/index.json",
    );
    const nativeOriginAttestation = await attestQualificationOrigins(
      options,
      plan.prefix,
      plan.inventorySha256,
    );
    let actualGets = 0;
    await parallel(selected, async ([path, entry]) => {
      for (const origin of origins) {
        try {
          const headers = await verifyPublic(new URL(path, origin), entry);
          if (
            (path === "/catalog/assets/index.json" ||
              (!options.siteRelease && path === target.pathname + "/index.json")) &&
            headers.get("cache-control") !== "no-store"
          )
            throw new Error("Public index must be no-store");
          actualGets++;
        } catch (error) {
          const message = error instanceof Error ? error.message : "",
            safe =
              /^Public verification HTTP [0-9]{3}$/.test(message) ||
              [
                "Invalid public byte bound",
                "Public body exceeds pinned size",
                "Public bytes differ",
                "Public index must be no-store",
              ].includes(message)
                ? message
                : "Public request failed";
          await writeFile(
            join(job, "public-failure.json"),
            JSON.stringify({
              failedAt: new Date().toISOString(),
              path,
              origin,
              expectedSha256: entry.sha256,
              expectedSize: entry.size,
              reason: safe,
            }),
            { mode: 0o600, flag: "wx" },
          ).catch(() => {});
          throw error;
        }
      }
    });
    await attestQualificationOrigins(options, plan.prefix, plan.inventorySha256);
    if (JSON.stringify(await owner.snapshot()) !== JSON.stringify(after))
      throw new Error("Worker drift during public qualification");
    const finalStateInfo = await lstat(statePath).catch((error: { code?: string }) => {
      if (error.code === "ENOENT") return undefined;
      throw error;
    });
    if (
      finalStateInfo &&
      (!finalStateInfo.isFile() ||
        finalStateInfo.isSymbolicLink() ||
        finalStateInfo.size > 16384 ||
        (process.platform !== "win32" &&
          (finalStateInfo.uid !== process.getuid?.() || finalStateInfo.mode & 0o077)))
    )
      throw Error("Publication state permissions changed during qualification");
    if ((finalStateInfo ? sha(await Bun.file(statePath).arrayBuffer()) : null) !== stateSha256)
      throw Error("Publication state changed during public qualification");
    const receipt = {
      finishedAt: new Date().toISOString(),
      inventoryPath: join(job, "delta/inventory.json"),
      inventorySha256: plan.inventorySha256,
      revision: delta.catalog.revision,
      indexSha256: options.siteRelease
        ? delta.catalog.indexSha256
        : delta.entries[target.pathname + "/index.json"]!.sha256,
      catalogIndexSha256: delta.catalog.indexSha256,
      objectsVerified: objects.length,
      shardsVerified: 256,
      publicFilesVerified: selected.length,
      actualGets,
      complete: actualGets === origins.length * selected.length,
      qualificationOrigins: origins,
      workerPublicQualified: !options.qualificationOrigins,
      nativeOriginAttestation,
      attestationGetChecks: options.qualificationOrigins ? 2 * origins.length : 0,
      sourceBefore: plan.before.codeSha256,
      sourceAfter: after.codeSha256,
      deploymentBefore: plan.before.deployment,
      deploymentId: after.deployment,
      prefix: plan.prefix,
      changedNames: plan.changedNames,
      beforeBindings: plan.before.settings.bindings.filter((b) => names.has(b.name)),
      afterBindings: after.settings.bindings.filter((b) => names.has(b.name)),
      urls: selected
        .filter(([path]) =>
          options.siteRelease
            ? inputEntries({ [path]: delta.entries[path]! }, publicRoots).length > 0
            : path.startsWith(target.pathname + "/"),
        )
        .map(([path, entry]) => ({
          url: new URL(path, options.cdnOrigin).href,
          sha256: entry.sha256,
          size: entry.size,
        })),
    };
    const receiptPath = join(job, "publication-receipt.json");
    if (resume && (await Bun.file(receiptPath).exists())) {
      const stored = await privatePublicationReceipt(receiptPath);
      const { finishedAt: _oldTime, ...oldProof } = stored;
      const { finishedAt: _newTime, ...newProof } = receipt;
      if (JSON.stringify(oldProof) !== JSON.stringify(newProof))
        throw Error("Stored publication receipt differs");
    } else await writeFile(receiptPath, JSON.stringify(receipt), { mode: 0o600, flag: "wx" });
    const stateNext = join(stateDirectory, "current-inventory.json.next");
    await writeFile(
      stateNext,
      JSON.stringify({
        inventoryPath: receipt.inventoryPath,
        inventorySha256: receipt.inventorySha256,
        prefix: receipt.prefix,
        deploymentId: receipt.deploymentId,
        codeSha256: receipt.sourceAfter,
        receiptPath,
      }),
      { mode: 0o600, flag: "wx" },
    );
    await rename(stateNext, join(stateDirectory, "current-inventory.json"));
    return { ...receipt, receiptPath };
  } finally {
    await rmdir(join(stateDirectory, "publish.lock"));
  }
}
export function publishCatalog(options: PublishCatalogOptions) {
  return publishCatalogCore(options);
}
/** Finish the reviewed, already activated candidate without another upload or Worker mutation. */
export async function resumeActivatedPublication(
  options: PublishCatalogOptions,
  planSha256: string,
) {
  const result = await publishCatalogCore({ ...options, apply: true, planSha256 }, true);
  if (!("complete" in result))
    throw Error("Activated publication cannot prepare another candidate");
  return result;
}
if (import.meta.main) {
  const args = Bun.argv.slice(2);
  if (args.includes("--help"))
    console.log(
      "publish-catalog --options FILE [--apply --plan-sha256 HASH] (prepare is read-only remotely; reviewed apply stages, activates and verifies)",
    );
  else {
    const at = args.indexOf("--options"),
      pin = args.indexOf("--plan-sha256");
    if (at < 0 || !args[at + 1]) throw new Error("Explicit owner options required");
    publishCatalog({
      ...(await Bun.file(args[at + 1]).json()),
      apply: args.includes("--apply"),
      planSha256: pin < 0 ? undefined : args[pin + 1],
    })
      .then((result) => console.log(JSON.stringify(result)))
      .catch(() => {
        console.error("Publication failed; inspect private job and owner gates");
        process.exitCode = 1;
      });
  }
}
