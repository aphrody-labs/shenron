// SPDX-License-Identifier: Apache-2.0
import { expect, test } from "bun:test";
import { watch } from "node:fs";
import { chmod, mkdir, mkdtemp, readdir, rename, rm, symlink } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createSourceCollectionControl } from "../src/api/source-collection-control";
const digest = (s: string) => new Bun.CryptoHasher("sha256").update(s).digest("hex");
async function fixture() {
  const dataRoot = await mkdtemp(join(tmpdir(), "shenron-control-")),
    root = join(dataRoot, "source-pipeline");
  await mkdir(root, { mode: 0o700 });
  const configPath = join(root, "config.json"),
    body = JSON.stringify({ version: 1, collectionIsolation: "required" });
  await Bun.write(configPath, body);
  await chmod(configPath, 0o600);
  return {
    dataRoot,
    root,
    configPath,
    request: { configPath, configSha256: digest(body) },
    close: () => rm(dataRoot, { recursive: true, force: true }),
  };
}
async function pending(root: string) {
  const path = join(root, "control", "requests");
  let wake = Promise.withResolvers<void>();
  const watcher = watch(path, () => wake.resolve());
  try {
    for (;;) {
      const files = (await readdir(path)).filter((f) => /^[a-f0-9-]{36}\.json$/.test(f));
      if (files.length) return Bun.file(join(path, files[0]!)).json();
      await wake.promise;
      wake = Promise.withResolvers<void>();
    }
  } finally {
    watcher.close();
  }
}
function collection(f: Awaited<ReturnType<typeof fixture>>) {
  return {
    schema: "shenron-source-collection/v1" as const,
    configSha256: f.request.configSha256,
    pinnedConfigPath: join(f.root, "job", "revisions", "a".repeat(64), "config.json"),
    pinnedConfigSha256: "b".repeat(64),
    collectionSha256: "c".repeat(64),
    artifactsSha256: "d".repeat(64),
    revisionIdentity: "a".repeat(64),
  };
}
async function respond(
  f: Awaited<ReturnType<typeof fixture>>,
  request: any,
  extra: Record<string, unknown>,
) {
  const path = join(f.root, "control", "responses", request.requestId + ".json");
  await Bun.write(
    path + ".tmp",
    JSON.stringify({
      schema: "shenron-source-response/v1",
      requestId: request.requestId,
      configSha256: request.configSha256,
      ...extra,
    }),
  );
  await chmod(path + ".tmp", 0o600);
  await rename(path + ".tmp", path);
}
test("private mailbox carries only pinned configuration and consumes canonical receipt", async () => {
  const f = await fixture();
  try {
    const callback = await createSourceCollectionControl(f);
    const work = callback(f.request);
    const request = await pending(f.root);
    expect(Object.keys(request).toSorted()).toEqual([
      "configPath",
      "configSha256",
      "requestId",
      "schema",
    ]);
    expect(request.schema).toBe("shenron-source-request/v1");
    const receipt = collection(f);
    await respond(f, request, { status: "complete", collection: receipt });
    expect(await work).toEqual(receipt);
    expect(await readdir(join(f.root, "control", "requests"))).toEqual([]);
    expect(await readdir(join(f.root, "control", "responses"))).toEqual([]);
  } finally {
    await f.close();
  }
});
test("abort removes pending request to cancel host work and timeout is finite", async () => {
  const f = await fixture();
  try {
    const controller = new AbortController();
    const callback = await createSourceCollectionControl(f);
    const work = callback(f.request, controller.signal).catch((error) => error);
    await pending(f.root);
    controller.abort();
    expect((await work).name).toBe("AbortError");
    expect(await readdir(join(f.root, "control", "requests"))).toEqual([]);
    const deadline = new AbortController();
    const timed = await createSourceCollectionControl(f, {
      deadline: (milliseconds) => {
        expect(milliseconds).toBe(20 * 60 * 1000);
        return deadline.signal;
      },
    });
    const timeout = timed(f.request).catch((error) => error);
    await pending(f.root);
    deadline.abort(new DOMException("deadline", "TimeoutError"));
    expect((await timeout).name).toBe("TimeoutError");
    expect(await readdir(join(f.root, "control", "requests"))).toEqual([]);
  } finally {
    await f.close();
  }
});
test("wrong identity, unsafe failure and unpinned collection fail closed", async () => {
  const f = await fixture();
  try {
    const callback = await createSourceCollectionControl(f);
    for (const response of [
      { status: "complete", requestId: crypto.randomUUID(), collection: collection(f) },
      { status: "failed", errorCode: "arbitrary private text" },
      { status: "complete", collection: { ...collection(f), artifactsSha256: "bad" } },
    ]) {
      const work = callback(f.request).catch((error) => error),
        request = await pending(f.root);
      await respond(f, request, response);
      expect(await work).toBeInstanceOf(Error);
    }
    const work = callback(f.request).catch((error) => error),
      request = await pending(f.root);
    await respond(f, request, { status: "failed", errorCode: "ERR_SOURCE_JOB_STATE_UNCERTAIN" });
    expect((await work).code).toBe("ERR_SOURCE_JOB_STATE_UNCERTAIN");
  } finally {
    await f.close();
  }
});
test("configuration hash, symlink and privacy failures never publish a request", async () => {
  const f = await fixture();
  try {
    const callback = await createSourceCollectionControl(f);
    await expect(callback({ ...f.request, configSha256: "0".repeat(64) })).rejects.toThrow(
      "configuration differs",
    );
    await chmod(join(f.root, "control", "requests"), 0o755);
    await expect(callback(f.request)).rejects.toThrow("Private canonical");
    await chmod(join(f.root, "control", "requests"), 0o700);
    await rm(join(f.root, "control", "responses"), { recursive: true });
    await symlink(join(f.root, "control", "requests"), join(f.root, "control", "responses"));
    await expect(callback(f.request)).rejects.toThrow("Private canonical");
    expect(await readdir(join(f.root, "control", "requests"))).toEqual([]);
  } finally {
    await f.close();
  }
});

test("existing bot job binds required private collection and shutdown withdraws its request", async () => {
  const { registerSourcePipelineJob } = await import("../src/api/source-pipeline-job");
  const f = await fixture();
  let task: (() => Promise<void>) | undefined;
  let job: Awaited<ReturnType<typeof registerSourcePipelineJob>> | undefined;
  try {
    job = await registerSourcePipelineJob(
      {
        register(value) {
          task = value.fn;
        },
        async run() {
          await task!();
        },
      },
      { dataRoot: f.dataRoot, configPath: f.configPath, intervalMs: 60000 },
    );
    const initial = job.initialRun.catch((error) => error);
    const request = await pending(f.root);
    expect(request.configSha256).toBe(f.request.configSha256);
    expect(request.configPath).toBe(f.configPath);
    await job.stop();
    expect(await initial).toMatchObject({ name: "AbortError" });
    expect(await readdir(join(f.root, "control", "requests"))).toEqual([]);
  } finally {
    await job?.stop();
    await f.close();
  }
});
