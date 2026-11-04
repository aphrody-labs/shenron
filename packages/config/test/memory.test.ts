// SPDX-License-Identifier: Apache-2.0
import { describe, expect, test } from "bun:test";
import {
  CHAT_MEMORY_DEFAULTS,
  chatMemoryAgentId,
  legacyChatMemoryAgentId,
  resolveChatMemory,
} from "../src/memory";

describe("chat memory settings", () => {
  test("defaults: under the data directory, injected for every backend", () => {
    expect(resolveChatMemory({}, "/home/u/.shenron/data/")).toEqual({
      dbPath: "/home/u/.shenron/data/memory.sqlite",
      recall: CHAT_MEMORY_DEFAULTS.recall,
      remote: true,
    });
  });

  test("overrides, off switches and invalid values", () => {
    expect(
      resolveChatMemory(
        {
          SHENRON_MEMORY_DB: "/srv/m.sqlite",
          SHENRON_MEMORY_RECALL: "0",
          SHENRON_MEMORY_REMOTE: "off",
        },
        "/d",
      ),
    ).toEqual({ dbPath: "/srv/m.sqlite", recall: 0, remote: false });
    expect(resolveChatMemory({ SHENRON_MEMORY: "off" }, "/d").dbPath).toBeNull();
    expect(resolveChatMemory({ SHENRON_MEMORY_RECALL: "99" }, "/d").recall).toBe(
      CHAT_MEMORY_DEFAULTS.recall,
    );
  });

  test("agent ids are the agent home ids; the former ones stay known", () => {
    expect(chatMemoryAgentId("discord:123")).toBe("discord:123");
    expect(chatMemoryAgentId("local")).toBe("local");
    expect(legacyChatMemoryAgentId("local")).toBe("shenron/local");
  });
});
