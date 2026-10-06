// SPDX-License-Identifier: Apache-2.0
/**
 * Selectable chat models: the `models` list of `GET /api/v1/models` (managed local models,
 * then Gemini web), `ChatRequest.model` routing to its backend with the upstream model, and
 * the plugin index in the system prompt of every model.
 */
import { describe, expect, test } from "bun:test";
import { createChatEngine, pluginBlock } from "../src/chat/engine";
import type { LlmBackend, LlmMessage, LlmOptions } from "../src/chat/llm";
import { ChatRequest, type ChatDone, type ChatEvent, type ChatModelEntry } from "../src/contract";
import type { PluginBundle } from "../src/plugin";

const home = () => ({ persona: null, name: "Shenron", emoji: null, source: "none" as const });

function backend(id: string, model: string | null, available = true) {
  const calls: { messages: LlmMessage[]; options: LlmOptions }[] = [];
  const b: LlmBackend = {
    id,
    model,
    status: async () => ({ available, model }),
    async *stream(messages, options) {
      calls.push({ messages: [...messages], options });
      yield `${id}:${options.model ?? model}`;
    },
  };
  return { backend: b, calls };
}

const managed: ChatModelEntry[] = [
  {
    id: "shenron-chat-v2",
    label: "Qwen3-4B Instruct 2507 + shenron-chat-v2",
    backend: "local",
    available: true,
    default: true,
    remote: false,
    state: "ready",
  },
  {
    id: "gemma4-e2b",
    label: "Gemma 4 E2B",
    backend: "local",
    available: false,
    default: false,
    remote: false,
    state: "downloading",
    progress: { received: 10, total: 100 },
  },
];

const bundle: PluginBundle = {
  name: "shenron",
  version: "1.4.0",
  description: "Dragon Ball",
  entries: [
    {
      kind: "skill",
      name: "dragon-ball-canon",
      description: "Vérifie la canonicité",
      path: "skills/x/SKILL.md",
    },
  ],
  files: [],
  sha256: "a".repeat(64),
  loadedAt: "2026-10-06T00:00:00.000Z",
};

async function turn(engine: ReturnType<typeof createChatEngine>, extra: Record<string, unknown>) {
  const events: ChatEvent[] = [];
  for await (const event of engine.run(
    {
      request: ChatRequest.parse({ message: "Qui est Vegeta ?", tools: false, ...extra }),
      ownerId: "alice",
      streamId: "s00000001",
    },
    new AbortController().signal,
  ))
    events.push(event);
  return {
    events,
    text: events
      .filter((e) => e.type === "delta")
      .map((e) => (e.data as { text: string }).text)
      .join(""),
    done: events.find((e) => e.type === "done")?.data as ChatDone,
  };
}

describe("chat models", () => {
  test("the list: managed local models (default first), then Gemini web", async () => {
    const local = backend("local", "shenron-chat-v2");
    const gemini = backend("gemini-web", "gemini-web/flash");
    const engine = createChatEngine({
      rag: null,
      backends: [gemini.backend, local.backend],
      home,
      catalog: async () => managed,
    });
    const models = await engine.models();
    expect(models.defaultModel).toBe("shenron-chat-v2");
    expect(models.models.map((m) => [m.id, m.backend, m.state, m.default, m.remote])).toEqual([
      ["shenron-chat-v2", "local", "ready", true, false],
      ["gemma4-e2b", "local", "downloading", false, false],
      ["gemini-web/flash", "gemini-web", "ready", false, true],
    ]);
  });

  test("without a catalog, the configured local backend is one model", async () => {
    const engine = createChatEngine({
      rag: null,
      backends: [backend("local", "qwen3", false).backend],
      home,
    });
    const models = await engine.models();
    expect(models.models).toEqual([
      expect.objectContaining({ id: "qwen3", available: false, state: "unavailable" }),
    ]);
    expect(models.defaultModel).toBe(null);
  });

  test("ChatRequest.model routes to its backend with the upstream model", async () => {
    const local = backend("local", "shenron-chat-v2");
    const gemini = backend("gemini-web", "gemini-web/flash");
    const engine = createChatEngine({
      rag: null,
      backends: [gemini.backend, local.backend],
      home,
      catalog: async () => managed,
      plugin: { load: async () => bundle },
    });
    const gemma = await turn(engine, { model: "gemma4-e2b" });
    expect(gemma.text).toBe("local:gemma4-e2b");
    expect(gemma.done.model).toBe("gemma4-e2b");
    expect((await turn(engine, { model: "gemini-web/flash" })).text).toBe(
      "gemini-web:gemini-web/flash",
    );
    // Every model reads the same Shenron system prompt, with the plugin index.
    const systems = [local.calls[0]!, gemini.calls[0]!].map((c) => c.messages[0]!);
    for (const system of systems) {
      expect(system.role).toBe("system");
      expect(system.content).toContain("Plugin shenron 1.4.0");
      expect(system.content).toContain("dragon-ball-canon");
    }
    expect(systems[0]!.content).toBe(systems[1]!.content);
    // No model given: the configured order (backend `auto`).
    expect((await turn(engine, {})).text).toBe("gemini-web:gemini-web/flash");
  });

  test("a model this server does not have is an error, not another model", async () => {
    const engine = createChatEngine({
      rag: null,
      backends: [backend("gemini-web", "gemini-web/flash").backend],
      home,
    });
    const { events } = await turn(engine, { model: "gemma4-e2b" });
    const error = events.find((e) => e.type === "error")?.data as { code: string; message: string };
    expect(error.code).toBe("no_backend");
    expect(error.message).toContain("unknown model");
  });

  test("pluginBlock lists skills and agents, empty without entries", () => {
    expect(pluginBlock(bundle)).toContain("- skill dragon-ball-canon : Vérifie la canonicité");
    expect(pluginBlock({ ...bundle, entries: [] })).toBe("");
  });
});
