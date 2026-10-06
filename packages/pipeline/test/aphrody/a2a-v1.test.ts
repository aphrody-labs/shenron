// SPDX-License-Identifier: Apache-2.0
/** A2A 1.0 face of the Shenron hub and its durable file store. */
import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ShenronA2AHub, a2aTaskStore, A2A_TARGETS } from "../../src/aphrody/a2a";
import { v1SendToLegacy, toV1Task } from "../../src/aphrody/a2a-v1";
import { fileStoreDir } from "../../src/aphrody/a2a-file-store";

const storeDir = mkdtempSync(join(tmpdir(), "a2a-v1-store-"));
const saved = {
  store: process.env.SHENRON_A2A_STORE_DIR,
  api: process.env.APHRODY_A2A_COORD_API,
};

beforeAll(() => {
  process.env.SHENRON_A2A_STORE_DIR = storeDir;
  delete process.env.APHRODY_A2A_COORD_API;
});
afterAll(() => {
  if (saved.store === undefined) delete process.env.SHENRON_A2A_STORE_DIR;
  else process.env.SHENRON_A2A_STORE_DIR = saved.store;
  if (saved.api !== undefined) process.env.APHRODY_A2A_COORD_API = saved.api;
  rmSync(storeDir, { recursive: true, force: true });
});

const rpc = (method: string, params: unknown) =>
  ShenronA2AHub.handleJsonRpc({ jsonrpc: "2.0", id: 1, method, params });

describe("A2A 1.0 card", () => {
  it("offers a JSON-RPC 1.0 interface and keeps the pre-1.0 fields", () => {
    const card = ShenronA2AHub.getAgentCard("https://dragonballfr.com");
    expect(card.supportedInterfaces).toEqual([
      {
        url: "https://dragonballfr.com/api/a2a",
        protocolBinding: "JSONRPC",
        protocolVersion: "1.0",
      },
    ]);
    expect(card.url).toBe("https://dragonballfr.com/api/a2a");
    expect(card.skills.every((skill) => skill.tags.length > 0)).toBe(true);
    expect(card.defaultInputModes.length).toBeGreaterThan(0);
  });

  it("is the card published at /.well-known/agent-card.json", async () => {
    const published = await Bun.file(
      new URL("../../../../apps/site/public/.well-known/agent-card.json", import.meta.url),
    ).json();
    expect(published).toEqual(
      JSON.parse(JSON.stringify(ShenronA2AHub.getAgentCard("https://dragonballfr.com"))),
    );
  });
});

describe("SendMessage routing", () => {
  it("reads the target from metadata or an @target: prefix", () => {
    const meta = v1SendToLegacy(
      {
        message: {
          messageId: "m1",
          role: "ROLE_USER",
          parts: [{ text: "hi" }],
          metadata: { target: "claude" },
        },
      },
      A2A_TARGETS,
    );
    expect("params" in meta && meta.params.target).toBe("claude");
    const prefixed = v1SendToLegacy(
      { message: { messageId: "m2", role: "ROLE_USER", parts: [{ text: "@agycli: review" }] } },
      A2A_TARGETS,
    );
    expect("params" in prefixed && prefixed.params.target).toBe("agycli");
    expect(
      "params" in prefixed &&
        (prefixed.params.message as { parts: Array<{ text: string }> }).parts[0]!.text,
    ).toBe("review");
    expect("error" in v1SendToLegacy({ message: { parts: [{}] } }, A2A_TARGETS)).toBe(true);
  });
});

describe("round trip through the file store", () => {
  it("SendMessage, GetTask, ListTasks, then a peer closes the task", async () => {
    expect(fileStoreDir()).toBe(storeDir);
    const sent = await rpc("SendMessage", {
      message: {
        messageId: "m-1",
        role: "ROLE_USER",
        parts: [{ text: "@agycli: list the elevated MCP tools" }],
        metadata: { sourceAgent: "test-v1" },
      },
    });
    expect("result" in sent).toBe(true);
    const task = (sent as { result: { task: { id: string; status: { state: string } } } }).result
      .task;
    expect(task.status.state).toBe("TASK_STATE_SUBMITTED");
    expect(readdirSync(join(storeDir, "tasks"))).toContain(`${task.id}.json`);

    // A fresh process only has the files: forget the in-memory cache.
    (a2aTaskStore as unknown as { tasks: Map<string, unknown> }).tasks.clear();
    const got = await rpc("GetTask", { id: task.id });
    expect((got as { result: { id: string } }).result.id).toBe(task.id);

    const listed = await rpc("ListTasks", { metadata: { target: "agycli" } });
    const ids = (listed as { result: { tasks: Array<{ id: string }> } }).result.tasks.map(
      (t) => t.id,
    );
    expect(ids).toContain(task.id);

    const closed = await rpc("SendMessage", {
      message: {
        messageId: "m-2",
        role: "ROLE_AGENT",
        taskId: task.id,
        parts: [{ text: "Done: 57 elevated tools." }],
        metadata: { sourceAgent: "agycli", status: "TASK_STATE_COMPLETED", verdict: "INCOMPLET" },
      },
    });
    const state = (closed as { result: { task: { status: { state: string } } } }).result.task.status
      .state;
    expect(state).toBe("TASK_STATE_COMPLETED");

    const missing = await rpc("GetTask", { id: "task-0-none" });
    expect((missing as { error: { code: number } }).error.code).toBe(-32001);
  });

  it("maps every hub state", () => {
    const now = new Date().toISOString();
    const v1 = toV1Task({
      id: "task-1",
      target: "rag",
      status: "completed",
      verdict: "FAIT",
      description: "x",
      createdAt: now,
      updatedAt: now,
      history: [{ role: "agent", parts: [{ type: "text", text: "answer" }] }],
      artifacts: [],
      metadata: {},
      resultMarkdown: "answer",
    });
    expect(v1.status).toMatchObject({ state: "TASK_STATE_COMPLETED" });
    expect(v1.artifacts).toEqual([
      { artifactId: "result-0", name: "result", parts: [{ text: "answer" }] },
    ]);
  });
});
