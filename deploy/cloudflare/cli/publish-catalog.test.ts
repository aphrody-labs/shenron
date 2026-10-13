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
} from "./publish-catalog";

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
  } finally {
    globalThis.fetch = original;
    await rm(root, { recursive: true, force: true });
  }
});
