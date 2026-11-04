import { describe, expect, test } from "bun:test";
import { DM_CHAT_DEFAULTS, resolveDmChat } from "../src/dm-chat";

describe("resolveDmChat", () => {
  test("defaults", () => {
    const s = resolveDmChat({});
    expect(s.enabled).toBe(true);
    expect(s.concurrency).toBe(DM_CHAT_DEFAULTS.concurrency);
    expect(s.userWindowMs).toBe(DM_CHAT_DEFAULTS.userWindowSeconds * 1000);
    expect(s.timeoutMs).toBe(DM_CHAT_DEFAULTS.timeoutSeconds * 1000);
  });

  test("valid values are read, invalid ones fall back", () => {
    const s = resolveDmChat({
      SHENRON_DM_CHAT: "off",
      SHENRON_DM_CONCURRENCY: "1",
      SHENRON_DM_QUEUE_MAX: "abc",
      SHENRON_DM_MAX_TOKENS: "99999",
      SHENRON_DM_USER_WINDOW_S: "60",
    });
    expect(s.enabled).toBe(false);
    expect(s.concurrency).toBe(1);
    expect(s.queueMax).toBe(DM_CHAT_DEFAULTS.queueMax);
    expect(s.maxTokens).toBe(DM_CHAT_DEFAULTS.maxTokens);
    expect(s.userWindowMs).toBe(60_000);
  });
});
