// SPDX-License-Identifier: Apache-2.0
import { Database } from "bun:sqlite";
import { expect, test } from "bun:test";
import { ShenronVfs } from "@aphrody/shenron-db/vfs";
import { createRagWriter } from "@aphrody/shenron-db/vfs/build";
import { createLocalApi } from "../src/host";
const env = {
  SHENRON_CHAT_BACKENDS: "extractive",
  SHENRON_CHAT_STORE: "off",
  SHENRON_MEMORY: "off",
  SHENRON_VFS_OFFLINE: "1",
};
test("private query embedding cannot be injected into public or editorial Aphrody hosts", () => {
  const privateQueryEmbedding = {
    query: async () => new Float32Array(384),
    model: "Xenova/multilingual-e5-small",
  };
  for (const config of [
    { SHENRON_PROFILE: "public" },
    { SHENRON_VFS_PUBLIC_ONLY: "1" },
    { RAG_BACKEND: "aphrody" },
  ])
    expect(() => createLocalApi({ ...env, ...config }, { privateQueryEmbedding })).toThrow(
      "private local VFS host",
    );
});
test("real private chat uses its injected query embedder while the public RAG port does not", async () => {
  const db = new Database(":memory:");
  const vfs = new ShenronVfs(db);
  vfs.setMeta("profile", "complet");
  const vector = new Float32Array(384);
  vector[0] = 1;
  const writer = createRagWriter(db, "f32");
  writer.add(
    {
      corpus: "home",
      entity_id: "shenron:home:memory/reviewed.md:0",
      title: "Reviewed private observation",
      url: null,
      content: "Piccolo retains the reviewed Nail context.",
      metadata: { kind: "home", originSourceId: "agent_home" },
      updated_at: new Date().toISOString(),
      embedding: vector,
      model: "Xenova/multilingual-e5-small",
    },
    "private",
  );
  writer.finish();
  let calls = 0;
  const host = createLocalApi(env, {
    vfsDatabase: db,
    conversations: null,
    memory: null,
    betterAuth: null,
    wiki: false,
    privateQueryEmbedding: {
      query: async () => {
        calls++;
        return vector;
      },
      model: "Xenova/multilingual-e5-small",
    },
  });
  const server = Bun.serve({
    fetch: host.fetch,
    websocket: host.websocket,
    hostname: "127.0.0.1",
    port: 0,
  });
  try {
    const chat = await fetch(new URL("/api/v1/chat", server.url), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message: "unmatchedkeyword", backend: "extractive", tools: false }),
    });
    expect(chat.status).toBe(200);
    expect(await chat.text()).toContain('"source":"home"');
    expect(calls).toBe(1);
    const response = await fetch(new URL("/api/public/rag/search?q=unmatchedkeyword", server.url));
    expect(response.status).toBe(200);
    expect((await response.json()).results).toHaveLength(0);
    expect(calls).toBe(1);
  } finally {
    server.stop(true);
    await host.close();
  }
});
