// SPDX-License-Identifier: Apache-2.0
import { expect, test } from "bun:test";
import { join } from "node:path";

test(
  "native adapters preserve Shenron doctor routing and sanitized auth presence",
  () => {
    const adapter = join(import.meta.dir, "../../src/aphrody/native.ts");
    const child = Bun.spawnSync(
      [
        process.execPath,
        "-e",
        `
    import { mock } from "bun:test";
    import assert from "node:assert/strict";
    let status = {configured: true, admin_credentials_present: false};
    let args;
    mock.module("@aphrody/shenron-native/shenron", () => ({
      EXPECTED_SHENRON_ABI_VERSION: 2,
      shenronAbiVersion: () => 2,
      shenronVersion: () => "fixture",
      shenronRunCaptured: () => { throw new Error("long commands run on the worker pool"); },
      shenronPersonaPrompt: () => "fixture",
      shenronAuthStatus: () => ({code: 0, stdout: JSON.stringify(status), stderr: ""}),
    }));
    let signal;
    mock.module("@aphrody/shenron-native/worker", () => ({
      shenronWorkerPool: () => ({
        runCaptured: async (received, options) => {
          args = received;
          signal = options.signal;
          return {code: 0, stdout: JSON.stringify({pillar: "shenron_sovereign_bridge", status: "degraded"}), stderr: ""};
        },
        ragSearch: async (query, options) => {
          if (options.signal?.aborted) throw options.signal.reason;
          return {q: query, mode: "hybrid", results: [
            {title: "", url: "/a", snippet: "A", score: 2, kind: "wiki", sourceId: null, originSourceId: null, entity: null, lang: "fr", content: null},
            {title: "B", url: "/b", snippet: "B", score: 1, kind: "wiki", sourceId: "s", originSourceId: null, entity: null, lang: null, content: "full"},
          ]};
        },
        ragStats: async () => ({backend: "local", chunks: 3, vectors: 2, vectorsStored: null, mode: "fts", builtAt: null, ragReady: true,
          sources: [{sourceId: "db", kind: "databook", count: 3, vectors: null}]}),
      }),
    }));
    const {aphrodyNative} = await import(${JSON.stringify(adapter)});
    assert.deepEqual(await aphrodyNative.doctor(), {pillar: "shenron_sovereign_bridge", status: "degraded"});
    assert.deepEqual(args, ["doctor", "--json"]);
    delete process.env.RAG_BACKEND;
    const hits = await aphrodyNative.ragSearch("Goku", {limit: 2});
    assert.deepEqual(hits.map((hit) => [hit.title, hit.score, hit.sourceId, hit.content]),
      [["Sans titre", 1, undefined, "A"], ["B", 0.4, "s", "full"]]);
    const controller = new AbortController();
    controller.abort(new Error("caller abort"));
    await assert.rejects(aphrodyNative.ragSearch("Goku", {signal: controller.signal}), /caller abort/);
    assert.deepEqual(await aphrodyNative.ragStats(),
      {chunks: 3, vectors: 2, sources: [{sourceId: "db", kind: "databook", count: 3}]});
    for (const configured of [false, true]) for (const present of [false, true]) {
      status = {configured, admin_credentials_present: present, secret: "must not project"};
      assert.deepEqual(aphrodyNative.authStatus(), {configured, adminCredentialsPresent: present});
    }
    status = {admin_token_configured: true, ai_token_configured: true};
    assert.equal(aphrodyNative.authStatus(), null);
    status = {configured: true, admin_credentials_present: "true"};
    assert.equal(aphrodyNative.authStatus(), null);
  `,
      ],
      { stdout: "pipe", stderr: "pipe" },
    );
    if (child.exitCode !== 0) throw new Error(new TextDecoder().decode(child.stderr));
    expect(child.exitCode).toBe(0);
    // Allow a cold Windows debug child to load the adapter without changing its command deadlines.
  },
  process.platform === "win32" ? 30_000 : 5_000,
);
