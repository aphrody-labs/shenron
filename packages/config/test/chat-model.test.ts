// SPDX-License-Identifier: Apache-2.0
import { describe, expect, test } from "bun:test";

import {
  CHAT_ADAPTER,
  CHAT_BASE_MODEL,
  DEFAULT_CHAT_CTX,
  llamaRuntimeUrl,
  LLAMA_RUNTIME,
  resolveChatModelConfig,
} from "../src/chat-model";

describe("resolveChatModelConfig", () => {
  test("desktop default: pinned sources, adapter on, digests checked", () => {
    const config = resolveChatModelConfig({}, "desktop");
    expect(config).toEqual({
      enabled: true,
      modelPath: null,
      modelUrl: CHAT_BASE_MODEL.url,
      modelSha256: CHAT_BASE_MODEL.sha256,
      lora: true,
      loraPath: null,
      loraUrl: null,
      loraSha256: CHAT_ADAPTER.sha256,
      llamaBin: null,
      ctx: DEFAULT_CHAT_CTX,
    });
    expect(CHAT_BASE_MODEL.url).toContain(CHAT_BASE_MODEL.file);
  });

  test("profiles and explicit values", () => {
    expect(resolveChatModelConfig({}, "public").enabled).toBe(false);
    expect(resolveChatModelConfig({ SHENRON_CHAT_MODEL: "auto" }, "public").enabled).toBe(true);
    expect(resolveChatModelConfig({ SHENRON_CHAT_MODEL: "auto" }, "production").enabled).toBe(
      false,
    );
    expect(resolveChatModelConfig({ SHENRON_CHAT_MODEL: "off" }, "desktop").enabled).toBe(false);
    const own = resolveChatModelConfig(
      {
        SHENRON_CHAT_MODEL: "/m/base.gguf",
        SHENRON_CHAT_MODEL_URL: "https://example.test/base.gguf",
        SHENRON_CHAT_LORA_URL: "https://example.test/lora.gguf",
        APHRODY_LLAMA_BIN: "/opt/llama-server",
        SHENRON_CHAT_CTX: "16384",
      },
      "desktop",
    );
    expect(own.modelPath).toBe("/m/base.gguf");
    expect(own.modelSha256).toBe(null);
    expect(own.loraSha256).toBe(null);
    expect(own.llamaBin).toBe("/opt/llama-server");
    expect(own.ctx).toBe(16384);
    expect(resolveChatModelConfig({ SHENRON_CHAT_LORA: "off" }, "desktop").lora).toBe(false);
    expect(resolveChatModelConfig({ SHENRON_CHAT_CTX: "12" }, "desktop").ctx).toBe(
      DEFAULT_CHAT_CTX,
    );
    expect(
      resolveChatModelConfig(
        { SHENRON_LLAMA_BIN: "/a/llama-server", APHRODY_LLAMA_BIN: "/b" },
        "desktop",
      ).llamaBin,
    ).toBe("/a/llama-server");
  });

  test("llama.cpp runtime assets are pinned to one release", () => {
    for (const asset of Object.values(LLAMA_RUNTIME.assets)) {
      expect(asset.name).toContain(LLAMA_RUNTIME.tag);
      expect(asset.sha256).toMatch(/^[0-9a-f]{64}$/);
      expect(llamaRuntimeUrl(asset.name)).toContain(`/download/${LLAMA_RUNTIME.tag}/`);
    }
  });
});
