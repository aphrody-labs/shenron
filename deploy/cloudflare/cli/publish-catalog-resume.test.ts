// SPDX-License-Identifier: Apache-2.0
import { expect, mock, test } from "bun:test";
import { chmod, mkdir, mkdtemp, rm, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { digest } from "./cloudflare-ops";

// Cloudflare and S3 transports are scoped to this module. The inventory, publisher,
// generated SDK module, receipts, byte checks and canonical state writer are real.
const stored = new Map<string, Uint8Array>();
const transfer = await import("./transfer");
const scopedStore = transfer.objectStore;
mock.module("./transfer", () => ({
  ...transfer,
  objectStore: async (
    _profile: string,
    manifest: Parameters<typeof scopedStore>[1],
    sdk: string,
  ) => {
    const { AwsClient } = await import(Bun.pathToFileURL(sdk).href);
    const client = new AwsClient();
    return {
      async put(key: string, bytes: Uint8Array, hash: string) {
        if (digest(bytes) !== hash) throw Error("Fixture storage checksum differs");
        const url = `https://${manifest.accountId}.r2.cloudflarestorage.com/${manifest.bucket}/${key}`;
        const head = await client.fetch(url, { method: "HEAD" });
        if (head.status === 404) await client.fetch(url, { method: "PUT", body: bytes });
        const get = await client.fetch(url, { method: "GET" });
        if (digest(new Uint8Array(await get.arrayBuffer())) !== hash)
          throw Error("Fixture readback differs");
      },
    };
  },
}));
const { publishCatalog, reconcileCatalogPublication } = await import("./publish-catalog");
const { acquirePublicationLock } = await import("./publication-state");

async function fixture() {
  stored.clear();
  const root = await mkdtemp(join(tmpdir(), "publisher-reconcile-"));
  await chmod(root, 0o700);
  const publicRoot = join(root, "public"),
    job = join(root, "job"),
    stateDirectory = join(root, "state");
  await mkdir(join(publicRoot, "publications/notice/objects"), { recursive: true });
  await Bun.write(
    join(publicRoot, "publications/notice/index.json"),
    JSON.stringify({ notice: "Original notice" }),
  );
  await Bun.write(
    join(publicRoot, "publications/notice/objects/" + digest("source") + ".md"),
    "source",
  );
  const previous = JSON.stringify({ entries: {} });
  const emptyHashes = Object.fromEntries(
    Array.from({ length: 256 }, (_, i) => [i.toString(16).padStart(2, "0"), digest("{}")]),
  );
  let settings: Record<string, unknown> = {
    bindings: [
      { name: "MANIFEST_PREFIX", type: "plain_text", text: "_migration/manifests/prior/" },
      ...Array.from({ length: 4 }, (_, group) => ({
        name: "MANIFEST_SHARD_HASHES_" + group,
        type: "json",
        json: Object.fromEntries(
          Object.entries(emptyHashes).filter(
            ([key]) => Math.floor(parseInt(key, 16) / 64) === group,
          ),
        ),
      })),
      { name: "BUCKET", type: "r2_bucket", bucket_name: "public-test" },
      { name: "IMPORT_ENABLED", type: "plain_text", text: "false" },
      { name: "VERIFY_UPLOADS", type: "plain_text", text: "false" },
    ],
    annotations: {},
  };
  const code = "export default {}",
    codeSha = digest(JSON.stringify([{ name: "worker.mjs", sha256: digest(code) }]));
  let deployment = "11111111-1111-1111-1111-111111111111";
  const files = {
    previous: join(root, "previous.json"),
    manifest: join(root, "manifest.json"),
    token: join(root, "token"),
    sdk: join(root, "sdk.mjs"),
    profile: join(root, "profile.json"),
  };
  await Bun.write(files.previous, previous);
  await Bun.write(
    files.manifest,
    JSON.stringify({
      accountId: "a".repeat(32),
      zoneId: "b".repeat(32),
      bucket: "public-test",
      worker: "fixture-worker",
      tunnelId: "1".repeat(36),
    }),
  );
  await Bun.write(files.token, "fixture-only-token");
  await Bun.write(
    files.sdk,
    "export class AwsClient {fetch(url,init){return globalThis.fetch(url,init)}}",
  );
  await Bun.write(
    files.profile,
    JSON.stringify({
      endpoint: `https://${"a".repeat(32)}.r2.cloudflarestorage.com`,
      bucket: "public-test",
      permission: "object-read-write",
      prefixes: ["_objects/", "_migration/"],
      accessKeyId: "fixture",
      secretAccessKey: "fixture",
      sessionToken: "fixture",
      expiresAt: new Date(Date.now() + 3600000).toISOString(),
    }),
  );
  for (const path of Object.values(files)) await chmod(path, 0o600);
  await chmod(files.profile, 0o400);
  const options = {
    publicRoot,
    job,
    stateDirectory,
    inventoryRoot: root,
    targetUrl: "https://dragonballfr.com/publications/notice",
    previousInventory: files.previous,
    previousInventorySha256: digest(previous),
    manifest: files.manifest,
    tokenFile: files.token,
    sdkModule: files.sdk,
    profile: files.profile,
    workerOrigin: "https://worker.example",
    cdnOrigin: "https://cdn.example",
    expectedDeployment: deployment,
    expectedCodeSha256: codeSha,
    expectedPrefix: "_migration/manifests/prior/",
  };
  const stats = { patches: 0, applied: 0, puts: new Map<string, number>(), gets: 0 };
  let fail: "none" | "snapshot" | "upload" | "before-patch" | "after-patch" = "none";
  let publicHook: (() => Promise<void>) | undefined;
  const original = globalThis.fetch;
  globalThis.fetch = (async (input: URL | string | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    if (url.hostname === "api.cloudflare.com") {
      if (url.pathname.endsWith("/settings")) {
        if (init?.method === "PATCH") {
          stats.patches++;
          if (fail === "before-patch") {
            fail = "none";
            throw Error("Fixture interrupted before patch");
          }
          settings = JSON.parse(String((init.body as FormData).get("settings")));
          deployment = "22222222-2222-2222-2222-222222222222";
          stats.applied++;
          if (fail === "after-patch") {
            fail = "none";
            throw Error("Fixture lost activation ACK");
          }
          return Response.json({ success: true, result: {} });
        }
        if (fail === "snapshot") {
          fail = "none";
          throw Error("Fixture interrupted before plan");
        }
        return Response.json({ success: true, result: settings });
      }
      if (url.pathname.endsWith("/deployments"))
        return Response.json({ success: true, result: { deployments: [{ id: deployment }] } });
      const form = new FormData();
      form.set("worker.mjs", new Blob([code]), "worker.mjs");
      return new Response(form);
    }
    if (url.hostname.endsWith(".r2.cloudflarestorage.com")) {
      if (fail === "upload") {
        fail = "none";
        throw Error("Fixture interrupted upload");
      }
      const key = url.pathname.slice("/public-test/".length);
      if (init?.method === "PUT") {
        stats.puts.set(key, (stats.puts.get(key) ?? 0) + 1);
        stored.set(key, new Uint8Array(await new Response(init.body).arrayBuffer()));
      }
      const bytes = stored.get(key);
      if (!bytes) return new Response(null, { status: 404 });
      const hash = digest(bytes);
      return new Response(init?.method === "HEAD" ? null : (bytes as BodyInit), {
        headers: {
          "x-amz-meta-sha256": hash,
          "x-amz-checksum-sha256": Buffer.from(hash, "hex").toString("base64"),
        },
      });
    }
    if (["worker.example", "cdn.example"].includes(url.hostname)) {
      stats.gets++;
      if (publicHook) {
        const hook = publicHook;
        publicHook = undefined;
        await hook();
      }
      const delta = await Bun.file(join(job, "delta/inventory.json")).json();
      const entry = delta.entries[url.pathname];
      return new Response(await Bun.file(entry.sourcePath).bytes(), {
        headers: { "cache-control": entry.cacheControl },
      });
    }
    throw Error("Unexpected fixture transport");
  }) as typeof fetch;
  return {
    root,
    job,
    stateDirectory,
    options,
    stats,
    interrupt(value: typeof fail) {
      fail = value;
    },
    onPublic(hook: () => Promise<void>) {
      publicHook = hook;
    },
    async close() {
      globalThis.fetch = original;
      await rm(root, { recursive: true, force: true });
    },
  };
}

test("real publisher resumes before plan and after an interrupted staged inventory without replacing bytes", async () => {
  const f = await fixture();
  try {
    f.interrupt("snapshot");
    await expect(reconcileCatalogPublication(f.options)).rejects.toThrow("before plan");
    const prepared = await publishCatalog(f.options);
    const plan = await Bun.file(join(f.job, "publication-plan.json")).text();
    expect((await publishCatalog(f.options)).planSha256).toBe(prepared.planSha256!);
    await unlink(join(f.job, "publication-plan.json"));
    await unlink(join(f.job, "delta/shards/ff.json"));
    const resumed = await reconcileCatalogPublication(f.options);
    expect(resumed.complete).toBe(true);
    expect(await Bun.file(join(f.job, "publication-plan.json")).text()).toBe(plan);
    expect(f.stats.applied).toBe(1);
  } finally {
    await f.close();
  }
}, 30000);

for (const phase of ["upload", "before-patch", "after-patch"] as const)
  test(`real writer reconciles ${phase} and completed state without repeated PUT or activation`, async () => {
    const f = await fixture();
    try {
      f.interrupt(phase);
      await expect(reconcileCatalogPublication(f.options)).rejects.toThrow("Fixture");
      const first = await reconcileCatalogPublication(f.options);
      expect(first.complete).toBe(true);
      expect(Math.max(...f.stats.puts.values())).toBe(1);
      expect(f.stats.applied).toBe(1);
      const puts = [...f.stats.puts],
        patches = f.stats.patches;
      const state = await Bun.file(join(f.stateDirectory, "current-inventory.json")).text();
      const replay = await reconcileCatalogPublication(f.options);
      expect(replay.complete).toBe(true);
      expect("replay" in replay && replay.replay).toBe(true);
      expect([...f.stats.puts]).toEqual(puts);
      expect(f.stats.patches).toBe(patches);
      expect(await Bun.file(join(f.stateDirectory, "current-inventory.json")).text()).toBe(state);
    } finally {
      await f.close();
    }
  }, 30000);

test("publisher preserves drifted staged bytes and canonical state", async () => {
  const f = await fixture();
  try {
    await publishCatalog(f.options);
    await Bun.write(join(f.job, "delta/shards/ff.json"), "changed");
    await expect(reconcileCatalogPublication(f.options)).rejects.toThrow();
    expect(await Bun.file(join(f.job, "delta/shards/ff.json")).text()).toBe("changed");
    expect(f.stats.applied).toBe(0);
  } finally {
    await f.close();
  }
});

test("uploaded receipt drift and concurrent canonical state changes fail closed", async () => {
  const f = await fixture();
  try {
    f.interrupt("before-patch");
    await expect(reconcileCatalogPublication(f.options)).rejects.toThrow("before patch");
    const path = join(f.job, "upload-receipt.json");
    const bytes = await Bun.file(path).text();
    await Bun.write(
      path,
      JSON.stringify({ ...JSON.parse(bytes), prefix: "_migration/manifests/foreign/" }),
    );
    await expect(reconcileCatalogPublication(f.options)).rejects.toThrow("upload receipt differs");
    await Bun.write(path, bytes);
    const state = JSON.stringify({
      inventoryPath: f.options.previousInventory,
      inventorySha256: f.options.previousInventorySha256,
      prefix: f.options.expectedPrefix,
      deploymentId: f.options.expectedDeployment,
      codeSha256: f.options.expectedCodeSha256,
    });
    f.onPublic(async () => {
      await Bun.write(join(f.stateDirectory, "current-inventory.json"), state);
      await chmod(join(f.stateDirectory, "current-inventory.json"), 0o600);
    });
    await expect(reconcileCatalogPublication(f.options)).rejects.toThrow("state changed");
    expect(await Bun.file(join(f.stateDirectory, "current-inventory.json")).text()).toBe(state);
    expect(f.stats.applied).toBe(1);
  } finally {
    await f.close();
  }
}, 30000);

test("kernel lock excludes a live owner and recovers its directory after process death", async () => {
  const root = await mkdtemp(join(tmpdir(), "publisher-lock-"));
  await chmod(root, 0o700);
  const module = new URL("./publication-state.ts", import.meta.url).href;
  const child = Bun.spawn(
    [
      process.execPath,
      "-e",
      `const {acquirePublicationLock}=await import(${JSON.stringify(module)});await acquirePublicationLock(${JSON.stringify(root)});console.log("READY");setInterval(()=>{},1000)`,
    ],
    { stdout: "pipe", stderr: "pipe" },
  );
  try {
    const reader = child.stdout.getReader();
    const first = await reader.read();
    reader.releaseLock();
    expect(new TextDecoder().decode(first.value)).toContain("READY");
    await expect(acquirePublicationLock(root)).rejects.toThrow("busy");
    child.kill("SIGKILL");
    await child.exited;
    const release = await acquirePublicationLock(root);
    await release();
    expect(await Bun.file(join(root, "publish.lock/owner.json")).exists()).toBe(false);
    await mkdir(join(root, "publish.lock"), { mode: 0o700 });
    await expect(acquirePublicationLock(root)).rejects.toThrow("independent owner evidence");
  } finally {
    child.kill();
    await child.exited;
    await rm(root, { recursive: true, force: true });
  }
});
