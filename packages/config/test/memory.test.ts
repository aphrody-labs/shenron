// SPDX-License-Identifier: Apache-2.0
import { describe, expect, test } from "bun:test";
import { CHAT_MEMORY_DEFAULTS, chatMemoryAgentId, resolveChatMemory } from "../src/memory";

describe("chat memory settings", () => {
  test("defaults live under the data directory", () => {
    expect(resolveChatMemory({}, "/home/u/.shenron/data/")).toEqual({
      dbPath: "/home/u/.shenron/data/memory.sqlite",
      agentPrefix: "shenron",
      recall: CHAT_MEMORY_DEFAULTS.recall,
      remote: false,
    });
    expect(resolveChatMemory({ SHENRON_MEMORY_REMOTE: "on" }, "/d").remote).toBe(true);
  });

  test("overrides, off switch and invalid values", () => {
    const env = {
      SHENRON_MEMORY_DB: "/srv/m.sqlite",
      SHENRON_MEMORY_AGENT: "studio",
      SHENRON_MEMORY_RECALL: "0",
    };
    expect(resolveChatMemory(env, "/d")).toEqual({
      dbPath: "/srv/m.sqlite",
      agentPrefix: "studio",
      recall: 0,
      remote: false,
    });
    expect(resolveChatMemory({ SHENRON_MEMORY: "off" }, "/d").dbPath).toBeNull();
    const invalid = resolveChatMemory(
      { SHENRON_MEMORY_AGENT: "a/b", SHENRON_MEMORY_RECALL: "99" },
      "/d",
    );
    expect(invalid.agentPrefix).toBe("shenron");
    expect(invalid.recall).toBe(CHAT_MEMORY_DEFAULTS.recall);
    expect(chatMemoryAgentId(invalid, "local")).toBe("shenron/local");
  });
});
