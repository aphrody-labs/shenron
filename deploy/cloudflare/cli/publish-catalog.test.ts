// SPDX-License-Identifier: Apache-2.0
import { expect, test } from "bun:test";
import { mkdtemp, mkdir, rm, chmod } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { digest } from "./cloudflare-ops";
import {
  publicTarget,
  pointerSettings,
  publishCatalog,
  parallel,
  verifyPublic,
  siteReleaseTarget,
  inputEntries,
  sealedArchiveSha256,
  verifyQualifiedPublication,
  qualificationOrigins,
  attestQualificationOrigins,
  assertQualificationReceipt,
} from "./publish-catalog";

const nativeOptions = {
  workerOrigin: "https://worker.example",
  cdnOrigin: "https://cdn.dragonballfr.com",
  qualificationOrigins: [
    "https://cdn.dragonballfr.com",
    "https://origin-cdn.dragonballfr.com",
  ] as const,
  qualificationService: {
    serviceVersion: "shenron-cdn-origin/v1" as const,
    codeSha256: "a".repeat(64),
  },
};
const nativeProof = {
  backend: "native-manifest-origin" as const,
  ...nativeOptions.qualificationService,
  manifestPrefix: "_migration/manifests/site-new/",
  inventorySha256: "b".repeat(64),
};

test("native qualification is an explicit exact allowlist with a separate code pin", () => {
  expect(
    qualificationOrigins({
      workerOrigin: "https://worker.example",
      cdnOrigin: "https://cdn.example",
    }),
  ).toEqual(["https://worker.example", "https://cdn.example"]);
  expect(qualificationOrigins(nativeOptions)).toEqual([...nativeOptions.qualificationOrigins]);
  for (const origins of [
    ["https://origin-cdn.dragonballfr.com", "https://cdn.dragonballfr.com"],
    ["https://cdn.dragonballfr.com", "https://evil.example"],
    ["https://cdn.dragonballfr.com", "https://origin-cdn.dragonballfr.com/private"],
    ["https://cdn.dragonballfr.com", "https://origin-cdn.dragonballfr.com/"],
    ["https://cdn.dragonballfr.com", "https://user@origin-cdn.dragonballfr.com"],
    [
      "https://cdn.dragonballfr.com",
      "https://origin-cdn.dragonballfr.com",
      "https://worker.example",
    ],
  ])
    expect(() =>
      qualificationOrigins({
        ...nativeOptions,
        qualificationOrigins: origins as unknown as readonly [string, string],
      }),
    ).toThrow();
  expect(() =>
    qualificationOrigins({ ...nativeOptions, qualificationService: undefined }),
  ).toThrow();
  expect(() =>
    qualificationOrigins({
      ...nativeOptions,
      qualificationService: { ...nativeOptions.qualificationService, codeSha256: "invalid" },
    }),
  ).toThrow();
});

test("both native origins must freshly attest the exact service, code, prefix and inventory tuple", async () => {
  const original = globalThis.fetch;
  const urls: string[] = [];
  try {
    globalThis.fetch = (async (url: URL, init?: RequestInit) => {
      urls.push(String(url));
      expect(init?.credentials).toBe("omit");
      return Response.json(nativeProof, { headers: { "cache-control": "no-store" } });
    }) as unknown as typeof fetch;
    expect(
      await attestQualificationOrigins(
        nativeOptions,
        nativeProof.manifestPrefix,
        nativeProof.inventorySha256,
      ),
    ).toEqual(nativeProof);
    expect(urls).toEqual(
      nativeOptions.qualificationOrigins.map(
        (origin) => `${origin}/.well-known/shenron-cdn-origin.json`,
      ),
    );
    for (const drift of [
      { codeSha256: "c".repeat(64) },
      { serviceVersion: "other" },
      { manifestPrefix: "_migration/manifests/old/" },
      { inventorySha256: "c".repeat(64) },
    ]) {
      globalThis.fetch = (async () =>
        Response.json(
          { ...nativeProof, ...drift },
          { headers: { "cache-control": "no-store" } },
        )) as unknown as typeof fetch;
      await expect(
        attestQualificationOrigins(
          nativeOptions,
          nativeProof.manifestPrefix,
          nativeProof.inventorySha256,
        ),
      ).rejects.toThrow("tuple differs");
    }
    globalThis.fetch = (async () => Response.json(nativeProof)) as unknown as typeof fetch;
    await expect(
      attestQualificationOrigins(
        nativeOptions,
        nativeProof.manifestPrefix,
        nativeProof.inventorySha256,
      ),
    ).rejects.toThrow("unavailable");
  } finally {
    globalThis.fetch = original;
  }
});

test("cached native receipts pin actual origins without claiming the Worker was publicly qualified", () => {
  const receipt = {
    qualificationOrigins: [...nativeOptions.qualificationOrigins],
    workerPublicQualified: false,
    nativeOriginAttestation: nativeProof,
    prefix: nativeProof.manifestPrefix,
    inventorySha256: nativeProof.inventorySha256,
  };
  expect(() => assertQualificationReceipt(nativeOptions, receipt)).not.toThrow();
  expect(() =>
    assertQualificationReceipt(nativeOptions, { ...receipt, workerPublicQualified: true }),
  ).toThrow();
  expect(() =>
    assertQualificationReceipt(nativeOptions, {
      ...receipt,
      qualificationOrigins: [nativeOptions.workerOrigin, nativeOptions.cdnOrigin],
    }),
  ).toThrow();
  expect(() =>
    assertQualificationReceipt(nativeOptions, {
      ...receipt,
      nativeOriginAttestation: { ...nativeProof, codeSha256: "c".repeat(64) },
    }),
  ).toThrow();
});

test("site release capability remains explicit and excludes private remote references from upload selection", async () => {
  expect(siteReleaseTarget("https://dragonballfr.com").pathname).toBe("/");
  for (const url of [
    "https://other.example/",
    "https://dragonballfr.com/admin",
    "https://dragonballfr.com/?x=1",
    "https://user:pass@dragonballfr.com/",
  ])
    expect(() => siteReleaseTarget(url)).toThrow();
  expect(() => publicTarget("https://dragonballfr.com/")).toThrow();
  const root = join(tmpdir(), "public-scope"),
    entry = { sha256: digest("x"), size: 1, contentType: "text/plain", cacheControl: "public" };
  const entries = {
    "/remote.txt": entry,
    "/new.txt": { ...entry, sourcePath: join(root, "new.txt") },
    "/outside.txt": { ...entry, sourcePath: root + "-private/secret" },
  } as unknown as Parameters<typeof inputEntries>[0];
  expect(inputEntries(entries, [root]).map(([path]) => path)).toEqual(["/new.txt"]);
  const job = await mkdtemp(join(tmpdir(), "sealed-public-"));
  try {
    const file = join(job, "public.tar.zst");
    await Bun.write(file, "sealed public bytes");
    await chmod(file, 0o600);
    expect(await sealedArchiveSha256(file)).toBe(digest("sealed public bytes"));
  } finally {
    await rm(job, { recursive: true, force: true });
  }
});

const hashes = Object.fromEntries(
  Array.from({ length: 256 }, (_, i) => [i.toString(16).padStart(2, "0"), digest(String(i))]),
);
const before = {
  bindings: [
    { name: "MANIFEST_PREFIX", type: "plain_text", text: "_migration/manifests/prior/" },
    ...Array.from({ length: 4 }, (_, i) => ({
      name: "MANIFEST_SHARD_HASHES_" + i,
      type: "json",
      json: {},
    })),
    { name: "BUCKET", type: "r2_bucket", bucket_name: "public-test" },
    { name: "IMPORT_ENABLED", type: "plain_text", text: "false" },
    { name: "VERIFY_UPLOADS", type: "plain_text", text: "false" },
  ],
  compatibility_date: "2026-10-01",
  compatibility_flags: ["nodejs_compat"],
  logpush: true,
  placement: { mode: "smart" },
  annotations: {
    "workers/message": "owner note",
    "workers/tag": "release",
    "workers/triggered_by": "api",
  },
};
test("public verification cancels oversized streams and rejects wrong digest", async () => {
  const original = globalThis.fetch;
  let cancelled = false;
  try {
    globalThis.fetch = (async () =>
      new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(new Uint8Array(20));
          },
          cancel() {
            cancelled = true;
          },
        }),
      )) as unknown as typeof fetch;
    await expect(
      verifyPublic(new URL("https://cdn.example/a"), { size: 10, sha256: digest("x") }),
    ).rejects.toThrow("exceeds");
    expect(cancelled).toBe(true);
    globalThis.fetch = (async () => new Response("public")) as unknown as typeof fetch;
    await expect(
      verifyPublic(new URL("https://cdn.example/a"), { size: 6, sha256: digest("other!") }),
    ).rejects.toThrow("differ");
  } finally {
    globalThis.fetch = original;
  }
});
test("failed parallel upload drains all in-flight work before releasing owner lock", async () => {
  let resolveOther: () => void = () => {};
  const gate = new Promise<void>((resolve) => {
    resolveOther = resolve;
  });
  let otherFinished = false,
    returned = false;
  const run = parallel([0, 1], async (item) => {
    if (item === 0) throw new Error("fixture failure");
    await gate;
    otherFinished = true;
  }).catch(() => {
    returned = true;
  });
  await Promise.resolve();
  await Promise.resolve();
  expect(returned).toBe(false);
  resolveOther();
  await run;
  expect(otherFinished).toBe(true);
  expect(returned).toBe(true);
});
test("pointer patch preserves settings and user annotations and changes only five names", () => {
  const result = pointerSettings(before, "_migration/manifests/new/", hashes);
  expect(result.changedNames).toHaveLength(5);
  expect(result.settings.annotations).toEqual({
    "workers/message": "owner note",
    "workers/tag": "release",
  });
  expect(result.settings.placement).toEqual(before.placement);
  expect(result.settings.bindings).toContainEqual(before.bindings[5]);
  expect(() =>
    pointerSettings(
      { ...before, bindings: [...before.bindings, { name: "SECRET", type: "secret_text" }] },
      "_migration/manifests/new/",
      hashes,
    ),
  ).toThrow();
  expect(() =>
    pointerSettings({ ...before, unknown_setting: true }, "_migration/manifests/new/", hashes),
  ).toThrow();
  expect(() => pointerSettings(before, "_migration/manifests/new/", {})).toThrow();
});
test("publication target refuses alternate paths credentials and encoded traversal", () => {
  expect(publicTarget("https://dragonballfr.com/publications/notice").pathname).toBe(
    "/publications/notice",
  );
  for (const path of [
    "https://user@dragonballfr.com/publications/a",
    "https://dragonballfr.com/admin",
    "http://dragonballfr.com/publications/a",
    "https://dragonballfr.com/publications/%2e%2e",
    "https://dragonballfr.com/publications/a?auth=x",
  ])
    expect(() => publicTarget(path)).toThrow();
});
test("prepare unions baseline generates catalog pins code and never remotely mutates", async () => {
  const root = await mkdtemp(join(tmpdir(), "shenron-owner-publication-"));
  const original = globalThis.fetch;
  const methods: string[] = [];
  try {
    const publicRoot = join(root, "public"),
      job = join(root, "job"),
      state = join(root, "state");
    await mkdir(join(publicRoot, "publications/notice/objects"), { recursive: true });
    const body = "Original public notice",
      bodySha = digest(body);
    await Bun.write(join(publicRoot, "publications/notice/objects/" + bodySha + ".md"), body);
    await Bun.write(
      join(publicRoot, "publications/notice/index.json"),
      JSON.stringify({ schema: "shenron-source-publication/v1", documents: [{ bodySha }] }),
    );
    const previous = JSON.stringify({
      entries: {
        "/older.txt": {
          sha256: digest("old"),
          size: 3,
          contentType: "text/plain",
          cacheControl: "no-store",
          sourcePath: join(root, "older.txt"),
        },
      },
    });
    await Bun.write(join(root, "previous.json"), previous);
    await Bun.write(join(root, "unused-sdk"), "export class AwsClient {}");
    const oldEntry = JSON.parse(previous).entries["/older.txt"];
    const { sourcePath: _sourcePath, ...oldPublic } = oldEntry;
    const priorHashes = Object.fromEntries(
      Array.from({ length: 256 }, (_, i) => {
        const key = i.toString(16).padStart(2, "0");
        return [
          key,
          digest(
            JSON.stringify(
              key === digest("/older.txt").slice(0, 2) ? { "/older.txt": oldPublic } : {},
            ),
          ),
        ];
      }),
    );
    const deployedBefore = {
      ...before,
      bindings: before.bindings.map((binding) =>
        binding.name.startsWith("MANIFEST_SHARD_HASHES_")
          ? Object.assign({}, binding, {
              json: Object.fromEntries(
                Object.entries(priorHashes).filter(
                  ([key]) => Math.floor(parseInt(key, 16) / 64) === Number(binding.name.slice(-1)),
                ),
              ),
            })
          : binding,
      ),
    };
    await Bun.write(
      join(root, "manifest.json"),
      JSON.stringify({
        accountId: "a".repeat(32),
        zoneId: "b".repeat(32),
        bucket: "public-test",
        worker: "test-worker",
        tunnelId: "1".repeat(36),
      }),
    );
    await Bun.write(join(root, "token"), "fixture-only-token");
    await chmod(join(root, "token"), 0o600);
    await chmod(join(root, "previous.json"), 0o600);
    const code = "export default {}",
      codeSha = digest(JSON.stringify([{ name: "worker.mjs", sha256: digest(code) }]));
    globalThis.fetch = (async (input: URL | string | Request, init?: RequestInit) => {
      methods.push(init?.method ?? "GET");
      const url = String(input);
      if (url.endsWith("/settings"))
        return Response.json({ success: true, result: deployedBefore });
      if (url.endsWith("/deployments"))
        return Response.json({ success: true, result: { deployments: [{ id: "qualified" }] } });
      const form = new FormData();
      form.set("worker.mjs", new Blob([code]), "worker.mjs");
      return new Response(form);
    }) as unknown as typeof fetch;
    const result = await publishCatalog({
      publicRoot,
      job,
      stateDirectory: state,
      inventoryRoot: root,
      targetUrl: "https://dragonballfr.com/publications/notice",
      previousInventory: join(root, "previous.json"),
      previousInventorySha256: digest(previous),
      manifest: join(root, "manifest.json"),
      profile: join(root, "unused-profile"),
      tokenFile: join(root, "token"),
      sdkModule: join(root, "unused-sdk"),
      workerOrigin: "https://worker.example",
      cdnOrigin: "https://cdn.example",
      expectedDeployment: "qualified",
      expectedCodeSha256: codeSha,
      expectedPrefix: "_migration/manifests/prior/",
    });
    expect(result.prepared).toBe(true);
    expect(methods.every((method) => method === "GET")).toBe(true);
    const delta = await Bun.file(join(job, "delta/inventory.json")).json();
    expect(delta.entries["/older.txt"].sha256).toBe(digest("old"));
    expect(delta.entries["/publications/notice/index.json"].cacheControl).toBe("no-store");
    expect(delta.catalog.artifacts).toBeGreaterThan(256);
    const plan = await Bun.file(join(job, "publication-plan.json")).text();
    expect(digest(plan)).toBe(result.planSha256!);
    const options = JSON.parse(plan).options;
    const deploymentId = "11111111-1111-1111-1111-111111111111";
    await Bun.write(
      join(state, "current-inventory.json"),
      JSON.stringify({
        inventoryPath: options.previousInventory,
        inventorySha256: options.previousInventorySha256,
        prefix: options.expectedPrefix,
        deploymentId,
        codeSha256: options.expectedCodeSha256,
      }),
    );
    await chmod(join(state, "current-inventory.json"), 0o600);
    globalThis.fetch = (async (input: URL | string | Request) => {
      const url = String(input);
      if (url.endsWith("/settings"))
        return Response.json({ success: true, result: deployedBefore });
      if (url.endsWith("/deployments"))
        return Response.json({ success: true, result: { deployments: [{ id: deploymentId }] } });
      const form = new FormData();
      form.set("worker.mjs", new Blob([code]), "worker.mjs");
      return new Response(form);
    }) as typeof fetch;
    const nextJob = join(root, "next-job");
    const next = await publishCatalog({
      ...options,
      job: nextJob,
      expectedDeployment: "stale-bootstrap",
    });
    expect(next.prepared).toBe(true);
    const nextPlan = await Bun.file(join(nextJob, "publication-plan.json")).json();
    expect(nextPlan.options.expectedDeployment).toBe(deploymentId);
    expect(nextPlan.stateSha256).toMatch(/^[a-f0-9]{64}$/);
    const active = {
      ...deployedBefore,
      bindings: deployedBefore.bindings.map((binding) =>
        binding.name === "MANIFEST_PREFIX"
          ? Object.assign({}, binding, { text: JSON.parse(plan).prefix })
          : binding.name.startsWith("MANIFEST_SHARD_HASHES_")
            ? Object.assign({}, binding, {
                json: Object.fromEntries(
                  Object.entries(JSON.parse(plan).shardHashes).filter(
                    ([key]) =>
                      Math.floor(parseInt(key, 16) / 64) === Number(binding.name.slice(-1)),
                  ),
                ),
              })
            : binding,
      ),
    };
    const activeState = {
      inventoryPath: join(job, "delta/inventory.json"),
      inventorySha256: result.inventorySha256,
      prefix: JSON.parse(plan).prefix,
      deploymentId,
      codeSha256: codeSha,
    };
    await Bun.write(join(state, "current-inventory.json"), JSON.stringify(activeState));
    await chmod(join(state, "current-inventory.json"), 0o600);
    const qualified = {
      ...activeState,
      complete: true,
      apiMutations: 0,
      registryMutations: 0,
      publicFilesVerified: delta.catalog.artifacts + 2,
      actualGets: 2 * (delta.catalog.artifacts + 2),
    };
    const qualification = JSON.stringify(qualified),
      qualifiedPath = join(job, "qualified.json");
    await Bun.write(qualifiedPath, qualification);
    await chmod(qualifiedPath, 0o600);
    globalThis.fetch = (async (input: URL | string | Request, init?: RequestInit) => {
      methods.push(init?.method ?? "GET");
      const url = String(input);
      if (url.endsWith("/settings")) return Response.json({ success: true, result: active });
      if (url.endsWith("/deployments"))
        return Response.json({ success: true, result: { deployments: [{ id: deploymentId }] } });
      if (url.startsWith("https://worker.example/") || url.startsWith("https://cdn.example/")) {
        const entry = delta.entries[new URL(url).pathname];
        return new Response(await Bun.file(entry.sourcePath).bytes(), {
          headers: { "cache-control": entry.cacheControl },
        });
      }
      const form = new FormData();
      form.set("worker.mjs", new Blob([code]), "worker.mjs");
      return new Response(form);
    }) as typeof fetch;
    const recovery = await verifyQualifiedPublication(
      options,
      qualifiedPath,
      digest(qualification),
    );
    expect(recovery.qualificationRecovery).toBe(true);
    expect(recovery.freshPublicGetChecks).toBe(6);
    expect(methods.every((method) => method === "GET")).toBe(true);
    const nativeRecoveryOptions = { ...options, ...nativeOptions };
    await expect(
      verifyQualifiedPublication(nativeRecoveryOptions, qualifiedPath, digest(qualification)),
    ).rejects.toThrow("origins differ");
    const pinnedNativeProof = {
      ...nativeProof,
      manifestPrefix: activeState.prefix,
      inventorySha256: activeState.inventorySha256,
    };
    const nativeReceipt = JSON.stringify({
      ...qualified,
      qualificationOrigins: [...nativeOptions.qualificationOrigins],
      workerPublicQualified: false,
      nativeOriginAttestation: pinnedNativeProof,
    });
    const nativeReceiptPath = join(job, "qualified-native.json");
    await Bun.write(nativeReceiptPath, nativeReceipt);
    await chmod(nativeReceiptPath, 0o600);
    const workerFetch = globalThis.fetch;
    let nativeGets = 0;
    globalThis.fetch = (async (input: URL | string | Request, init?: RequestInit) => {
      const url = new URL(String(input));
      if (nativeOptions.qualificationOrigins.includes(url.origin as never)) {
        expect(init?.method ?? "GET").toBe("GET");
        if (url.pathname === "/.well-known/shenron-cdn-origin.json")
          return Response.json(pinnedNativeProof, { headers: { "cache-control": "no-store" } });
        nativeGets++;
        const entry = delta.entries[url.pathname];
        return new Response(await Bun.file(entry.sourcePath).bytes(), {
          headers: { "cache-control": entry.cacheControl },
        });
      }
      return workerFetch(input, init);
    }) as unknown as typeof fetch;
    const nativeRecovery = await verifyQualifiedPublication(
      nativeRecoveryOptions,
      nativeReceiptPath,
      digest(nativeReceipt),
    );
    expect(nativeRecovery.workerPublicQualified).toBe(false);
    expect(nativeRecovery.qualificationOrigins).toEqual([...nativeOptions.qualificationOrigins]);
    expect(nativeRecovery.freshPublicGetChecks).toBe(nativeGets);
    expect(nativeGets).toBe(6);
    expect(nativeRecovery.attestationGetChecks).toBe(4);
    globalThis.fetch = workerFetch;
    await expect(
      verifyQualifiedPublication(options, qualifiedPath, "0".repeat(64)),
    ).rejects.toThrow("receipt changed");
    const sitePayload = join(root, "site-payload"),
      siteRoot = join(sitePayload, "site"),
      staticRoot = join(sitePayload, "static"),
      releasePublicRoot = join(sitePayload, "release-public");
    await mkdir(join(siteRoot, "public"), { recursive: true });
    await mkdir(staticRoot);
    await mkdir(releasePublicRoot);
    await Bun.write(join(siteRoot, "public/logo.svg"), "<svg/>");
    await Bun.write(join(staticRoot, "new.js"), "new static");
    const archivePath = join(root, "public.tar.zst");
    await Bun.write(archivePath, "sealed fixture");
    await chmod(archivePath, 0o600);
    const siteJob = join(root, "site-job"),
      siteResult = await publishCatalog({
        ...options,
        publicRoot: sitePayload,
        job: siteJob,
        targetUrl: "https://dragonballfr.com",
        siteRelease: {
          siteRoot,
          staticRoot,
          releasePublicRoot,
          archivePath,
          archiveSha256: digest("sealed fixture"),
        },
      });
    expect(siteResult.prepared).toBe(true);
    expect(siteResult.prefix).toStartWith("_migration/manifests/site-");
    const siteDelta = await Bun.file(join(siteJob, "delta/inventory.json")).json();
    expect(siteDelta.entries["/publications/notice/index.json"].sha256).toBe(
      delta.entries["/publications/notice/index.json"].sha256,
    );
    expect(siteDelta.entries["/_next/static/new.js"].sha256).toBe(digest("new static"));
    expect(siteDelta.entries["/logo.svg"].sha256).toBe(digest("<svg/>"));
    expect(methods.every((method) => method === "GET")).toBe(true);
  } finally {
    globalThis.fetch = original;
    await rm(root, { recursive: true, force: true });
  }
}, 20000);
