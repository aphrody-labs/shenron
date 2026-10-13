// SPDX-License-Identifier: Apache-2.0
import { mkdir, realpath, rmdir, stat, writeFile, rename, lstat } from "node:fs/promises";
import { join, resolve } from "node:path";
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
  expectedDeployment: string;
  expectedCodeSha256: string;
  expectedPrefix: string;
  stateDirectory: string;
  inventoryRoot: string;
  apply?: boolean;
  planSha256?: string;
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
export async function publishCatalog(inputOptions: PublishCatalogOptions) {
  let options = inputOptions;
  const target = publicTarget(options.targetUrl);
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
    for (const origin of [options.workerOrigin, options.cdnOrigin]) {
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
        emptySite,
        "--static",
        emptyStatic,
        "--release-public",
        root,
        "--out",
        join(job, "delta"),
      ]);
      const hashes = (await Bun.file(join(job, "delta/shard-hashes.json")).json()) as Record<
        string,
        string
      >;
      const inventorySha256 = sha(await Bun.file(join(job, "delta/inventory.json")).arrayBuffer());
      const generated = (await Bun.file(join(job, "delta/inventory.json")).json()) as Delta;
      const publicEntries = Object.entries(generated.entries).filter(([, entry]) =>
        within(entry.sourcePath, root),
      );
      if (!publicEntries.some(([path]) => path === target.pathname + "/index.json"))
        throw new Error("Publication index missing");
      for (const [path, entry] of publicEntries) {
        const suffix = path.slice(target.pathname.length);
        if (
          !path.startsWith(target.pathname + "/") ||
          (suffix !== "/index.json" &&
            !new RegExp("^/objects/" + entry.sha256 + "\\.[a-z0-9]+$").test(suffix))
        )
          throw new Error("Public root contains unrelated or non-addressed files");
      }
      const prefix = "_migration/manifests/publication-" + inventorySha256.slice(0, 24) + "/";
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
    guard(current, options);
    if (JSON.stringify(current) !== JSON.stringify(plan.before))
      throw new Error("Concurrent Worker settings changed");
    const store = await objectStore(options.profile, manifest, options.sdkModule);
    const roots = [root, await realpath(join(job, "delta/public-catalog"))];
    const objects = inventory(await Bun.file(join(job, "delta/delta-objects.json")).json());
    if (objects.length !== delta.addedObjects) throw new Error("Delta object count differs");
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
    const last = await owner.snapshot();
    if (JSON.stringify(last) !== JSON.stringify(plan.before))
      throw new Error("Worker drift after staged upload");
    await owner.patch(plan.settings);
    const after = await owner.snapshot();
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
    const selected = Object.entries(delta.entries).filter(
      ([path]) =>
        path.startsWith(target.pathname + "/") ||
        (path.startsWith("/catalog/assets/") && path.includes(delta.catalog.revision)) ||
        path === "/catalog/assets/index.json",
    );
    await parallel(selected, async ([path, entry]) => {
      for (const origin of [options.workerOrigin, options.cdnOrigin]) {
        const headers = await verifyPublic(new URL(path, origin), entry);
        if (path.endsWith("/index.json") && headers.get("cache-control") !== "no-store")
          throw new Error("Public index must be no-store");
      }
    });
    const receipt = {
      finishedAt: new Date().toISOString(),
      inventoryPath: join(job, "delta/inventory.json"),
      inventorySha256: plan.inventorySha256,
      revision: delta.catalog.revision,
      indexSha256: delta.entries[target.pathname + "/index.json"]!.sha256,
      catalogIndexSha256: delta.catalog.indexSha256,
      objectsVerified: objects.length,
      shardsVerified: 256,
      publicFilesVerified: selected.length,
      sourceBefore: plan.before.codeSha256,
      sourceAfter: after.codeSha256,
      deploymentBefore: plan.before.deployment,
      deploymentId: after.deployment,
      prefix: plan.prefix,
      changedNames: plan.changedNames,
      beforeBindings: plan.before.settings.bindings.filter((b) => names.has(b.name)),
      afterBindings: after.settings.bindings.filter((b) => names.has(b.name)),
      urls: selected
        .filter(([path]) => path.startsWith(target.pathname + "/"))
        .map(([path, entry]) => ({
          url: new URL(path, options.cdnOrigin).href,
          sha256: entry.sha256,
          size: entry.size,
        })),
    };
    const receiptPath = join(job, "publication-receipt.json");
    await writeFile(receiptPath, JSON.stringify(receipt), { mode: 0o600, flag: "wx" });
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
