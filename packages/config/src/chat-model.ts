// SPDX-License-Identifier: Apache-2.0
/**
 * The local chat models of Shenron Studio, served by one `llama-server` (llama.cpp, router
 * mode: one preset per model, loaded on demand) that `shenron-server` starts beside itself:
 *
 *   shenron-chat-v2   Qwen3-4B Instruct 2507 (GGUF Q4_K_M) + the Shenron LoRA adapter (default)
 *   gemma4-e2b        Gemma 4 E2B instruct (GGUF Q4_K_M), downloaded into SHENRON_HOME
 *
 * plus `gemini-web/flash` (the Gemini web app, remote) when its cookies exist. The one place
 * that spells the model ids, pinned sources, digests and defaults; `apps/server/src/chat-model.ts`
 * resolves and runs them.
 *
 * | variable                 | role                                              | default                            |
 * | ------------------------ | ------------------------------------------------- | ---------------------------------- |
 * | `SHENRON_CHAT_MODEL`     | `auto`, `off` or the path of the base GGUF        | `auto` (desktop), `off` otherwise  |
 * | `SHENRON_CHAT_MODEL_URL` | download source of the base GGUF                  | Hugging Face, pinned revision      |
 * | `SHENRON_CHAT_LORA`      | path of the adapter GGUF, `off` for the base only | shipped beside the app             |
 * | `SHENRON_CHAT_LORA_URL`  | download source of the adapter                    | none (shipped by the installer)    |
 * | `SHENRON_LLAMA_BIN`      | `llama-server` to run                             | shipped `llama/`, then PATH        |
 * | `SHENRON_CHAT_CTX`       | context size of the server                        | `8192`                             |
 * | `SHENRON_GEMMA_MODEL`    | `auto` (download), `manual` (on request), `off`, path | `auto` with the managed models     |
 * | `SHENRON_GEMMA_MODEL_URL`| download source of Gemma 4 E2B                    | Hugging Face, pinned (provisional) |
 * | `SHENRON_GEMMA_MODEL_SHA256` | digest of that source                         | pinned digest                      |
 *
 * Runtime class: `pure` (takes an explicit env record).
 */
import { type EnvSource, envString } from "./env";

export interface PinnedArtifact {
  /** File name in `<SHENRON_HOME>/models/`. */
  file: string;
  /** Default download source; `null` when the artefact only ships with the installer. */
  url: string | null;
  sha256: string;
  bytes: number;
}

/** Stable model ids of the chat (`ChatRequest.model`, `ModelsResponse.models[].id`). */
export const CHAT_MODEL_IDS = {
  shenron: "shenron-chat-v2",
  gemma: "gemma4-e2b",
  geminiWeb: "gemini-web/flash",
} as const;
/** Chat backends outside production: the local models, then the Gemini web app (remote). */
export const DEFAULT_LOCAL_CHAT_BACKENDS = "local,gemini-web";

/** Model answering when a request names none. */
export const DEFAULT_CHAT_MODEL_ID = CHAT_MODEL_IDS.shenron;

/** Base model: catalog id `qwen3-4b-instruct-2507-q4km` of aphrody-models (same revision). */
export const CHAT_BASE_MODEL = {
  id: "qwen3-4b-instruct-2507-q4km",
  label: "Qwen3-4B Instruct 2507",
  file: "Qwen3-4B-Instruct-2507-Q4_K_M.gguf",
  url: "https://huggingface.co/unsloth/Qwen3-4B-Instruct-2507-GGUF/resolve/a06e946bb6b655725eafa393f4a9745d460374c9/Qwen3-4B-Instruct-2507-Q4_K_M.gguf",
  sha256: "3605803b982cb64aead44f6c1b2ae36e3acdb41d8e46c8a94c6533bc4c67e597",
  bytes: 2_497_281_120,
} as const satisfies PinnedArtifact & { id: string; label: string };

/** Shenron LoRA adapter (`aphrody train run --kind lora`, run `shenron-chat-v2`). */
export const CHAT_ADAPTER = {
  id: "shenron-chat-v2",
  file: "shenron-chat-v2.gguf",
  url: null,
  sha256: "aab485357c68fdcbb6d4ba55911632b8228964106047db035e0223e2aecc6107",
  bytes: 132_155_648,
} as const satisfies PinnedArtifact & { id: string };

/**
 * Gemma 4 E2B instruct: catalog id `gemma-4-e2b-it-q4km` of aphrody-models (same revision).
 * The Hugging Face URL is provisional: the stable URL published beside the VPS server replaces
 * it through SHENRON_GEMMA_MODEL_URL (and SHENRON_GEMMA_MODEL_SHA256 when its digest differs).
 */
export const GEMMA_MODEL = {
  id: CHAT_MODEL_IDS.gemma,
  aphrodyId: "gemma-4-e2b-it-q4km",
  label: "Gemma 4 E2B",
  file: "gemma-4-E2B-it-Q4_K_M.gguf",
  url: "https://huggingface.co/unsloth/gemma-4-E2B-it-GGUF/resolve/0314792d7f1f7e229411f620751375812bb9faf2/gemma-4-E2B-it-Q4_K_M.gguf",
  sha256: "740185b21d22ceb83a11c3aa62ad5842ef32c70f6096d756bbee85a1e4ec34b8",
  bytes: 3_106_738_272,
} as const satisfies PinnedArtifact & { id: string; label: string; aphrodyId: string };

export type GemmaMode = "auto" | "manual" | "off";

export interface GemmaModelConfig {
  /** `auto`: downloaded once the default model is ready; `manual`: on request only. */
  mode: GemmaMode;
  path: string | null;
  url: string;
  sha256: string | null;
}

/** Gemma 4 E2B settings (only meaningful when the managed models are on). */
export function resolveGemmaConfig(env: EnvSource): GemmaModelConfig {
  const raw = envString(env, "SHENRON_GEMMA_MODEL");
  const url = envString(env, "SHENRON_GEMMA_MODEL_URL");
  const sha = envString(env, "SHENRON_GEMMA_MODEL_SHA256")?.toLowerCase();
  const mode: GemmaMode = raw === "off" ? "off" : raw === "manual" ? "manual" : "auto";
  return {
    mode,
    path: raw && !["auto", "manual", "off"].includes(raw) ? raw : null,
    url: url ?? GEMMA_MODEL.url,
    sha256: sha && /^[0-9a-f]{64}$/.test(sha) ? sha : url ? null : GEMMA_MODEL.sha256,
  };
}

/** llama.cpp release shipped by the installer (Vulkan build: NVIDIA, AMD, Intel, else CPU). */
export const LLAMA_RUNTIME = {
  tag: "b11312",
  assets: {
    "windows-x64": {
      name: "llama-b11312-bin-win-vulkan-x64.zip",
      sha256: "ad3e1e83bdcbc56c00fb2d740e8799e3012d63a12d0a64509407e625a77378a0",
    },
    "linux-x64": {
      name: "llama-b11312-bin-ubuntu-vulkan-x64.tar.gz",
      sha256: "81b207361c95483e861763944cd371f916964a9d5626d649919690e6860e744a",
    },
  },
} as const;

export const llamaRuntimeUrl = (asset: string): string =>
  `https://github.com/ggml-org/llama.cpp/releases/download/${LLAMA_RUNTIME.tag}/${asset}`;

export const DEFAULT_CHAT_CTX = 8192;

export interface ChatModelConfig {
  /** `false`: no managed model (explicit `off`, or not the desktop profile without opt-in). */
  enabled: boolean;
  /** Explicit base GGUF; `null` resolves `<home>/models/`, the Aphrody store, then downloads. */
  modelPath: string | null;
  modelUrl: string;
  /** Digest checked after a download; `null` for a custom source. */
  modelSha256: string | null;
  /** `false`: base model only. */
  lora: boolean;
  loraPath: string | null;
  loraUrl: string | null;
  loraSha256: string | null;
  llamaBin: string | null;
  ctx: number;
}

/** Resolve the chat model settings; `desktop` turns the managed model on by default. */
export function resolveChatModelConfig(env: EnvSource, profile: string): ChatModelConfig {
  const model = envString(env, "SHENRON_CHAT_MODEL");
  const enabled =
    profile !== "production" &&
    model !== "off" &&
    (model !== undefined ? true : profile === "desktop");
  const modelUrl = envString(env, "SHENRON_CHAT_MODEL_URL");
  const lora = envString(env, "SHENRON_CHAT_LORA");
  const loraUrl = envString(env, "SHENRON_CHAT_LORA_URL");
  const ctx = Number(envString(env, "SHENRON_CHAT_CTX"));
  return {
    enabled,
    modelPath: model && model !== "auto" && model !== "off" ? model : null,
    modelUrl: modelUrl ?? CHAT_BASE_MODEL.url,
    modelSha256: modelUrl ? null : CHAT_BASE_MODEL.sha256,
    lora: lora !== "off",
    loraPath: lora && lora !== "off" && lora !== "auto" ? lora : null,
    loraUrl: loraUrl ?? CHAT_ADAPTER.url,
    loraSha256: loraUrl ? null : CHAT_ADAPTER.sha256,
    llamaBin: envString(env, "SHENRON_LLAMA_BIN") ?? envString(env, "APHRODY_LLAMA_BIN") ?? null,
    ctx: Number.isInteger(ctx) && ctx >= 512 ? ctx : DEFAULT_CHAT_CTX,
  };
}
