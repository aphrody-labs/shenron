// SPDX-License-Identifier: Apache-2.0
/**
 * LLM backends of the chat, tried in order with a clean fallback:
 *
 * - `gemini-web`: the Gemini web app through Aphrody's native client (`aphrody-gemini-web`,
 *   crate `aphrody-gemini-web`, aphrody-labs/aphrody): one JSON request on stdin, cookies read
 *   from the private cookie store, never from arguments or the repository;
 * - `local`: an OpenAI-compatible server (llama-server managed by Aphrody), streamed;
 * - `extractive`: no model — the answer is the cited passages, explicitly labelled.
 *
 * A backend that fails before its first token hands over to the next one; the failure is
 * reported in `done.fallbacks`. A failing `gemini-web` is skipped for a cool-down period.
 * Runtime class: `bun`.
 */
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export interface LlmMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface LlmOptions {
  maxTokens?: number;
  temperature?: number;
  /** Upstream model of this request (one server, several models: llama-server router mode). */
  model?: string;
}

export interface LlmStatus {
  available: boolean;
  model: string | null;
  detail?: string;
}

export interface LlmBackend {
  readonly id: string;
  readonly model: string | null;
  status(): Promise<LlmStatus>;
  /** Text deltas; throws before the first delta when the backend cannot answer. */
  stream(
    messages: readonly LlmMessage[],
    options: LlmOptions,
    signal: AbortSignal,
  ): AsyncIterable<string>;
}

export class BackendUnavailable extends Error {
  constructor(
    readonly backend: string,
    message: string,
  ) {
    super(message);
    this.name = "BackendUnavailable";
  }
}

// ── OpenAI-compatible (llama-server) ────────────────────────────────────────

/** Parse an OpenAI-compatible SSE completion stream into text deltas. */
export async function* openAiDeltas(
  body: ReadableStream<Uint8Array>,
  signal: AbortSignal,
): AsyncGenerator<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    while (!signal.aborted) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let index: number;
      while ((index = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, index).trim();
        buffer = buffer.slice(index + 1);
        if (!line.startsWith("data:")) continue;
        const data = line.slice(5).trim();
        if (data === "[DONE]") return;
        let chunk: {
          choices?: { delta?: { content?: string | null }; finish_reason?: string | null }[];
          error?: { message?: string };
        };
        try {
          chunk = JSON.parse(data);
        } catch {
          continue;
        }
        if (chunk.error) throw new Error(chunk.error.message ?? "completion error");
        const text = chunk.choices?.[0]?.delta?.content;
        if (text) yield text;
      }
    }
  } finally {
    reader.releaseLock();
  }
}

export function createOpenAiBackend(o: {
  id?: string;
  baseUrl: string;
  model: string | null;
  apiKey?: string | null;
  fetch?: typeof fetch;
  timeoutMs?: number;
}): LlmBackend {
  const base = o.baseUrl.replace(/\/+$/, "");
  const doFetch = o.fetch ?? fetch;
  const id = o.id ?? "local";
  const headers = (): Record<string, string> => ({
    "content-type": "application/json",
    ...(o.apiKey ? { authorization: `Bearer ${o.apiKey}` } : {}),
  });
  return {
    id,
    model: o.model,
    async status() {
      try {
        const response = await doFetch(`${base}/models`, {
          headers: headers(),
          signal: AbortSignal.timeout(3000),
        });
        if (!response.ok)
          return { available: false, model: o.model, detail: `HTTP ${response.status}` };
        const body = (await response.json()) as { data?: { id: string }[] };
        const served = body.data?.map((m) => m.id) ?? [];
        return { available: true, model: o.model ?? served[0] ?? null, detail: served.join(", ") };
      } catch (error) {
        return {
          available: false,
          model: o.model,
          detail: error instanceof Error ? error.message : String(error),
        };
      }
    },
    async *stream(messages, options, signal) {
      let response: Response;
      try {
        response = await doFetch(`${base}/chat/completions`, {
          method: "POST",
          headers: headers(),
          body: JSON.stringify({
            ...((options.model ?? o.model) ? { model: options.model ?? o.model } : {}),
            messages,
            stream: true,
            max_tokens: options.maxTokens ?? 700,
            temperature: options.temperature ?? 0.3,
          }),
          signal: AbortSignal.any([signal, AbortSignal.timeout(o.timeoutMs ?? 180_000)]),
        });
      } catch (error) {
        throw new BackendUnavailable(id, error instanceof Error ? error.message : String(error));
      }
      if (!response.ok || !response.body) {
        throw new BackendUnavailable(
          id,
          `HTTP ${response.status}: ${(await response.text()).slice(0, 200)}`,
        );
      }
      yield* openAiDeltas(response.body, signal);
    },
  };
}

// ── Gemini web app (aphrody-gemini-web) ─────────────────────────────────────

/** Cookie stores of the Gemini web client, in the crate's resolution order. */
export function geminiCookieCandidates(
  env: Record<string, string | undefined>,
  home = homedir(),
): string[] {
  const explicit = env.APHRODY_GOOGLE_COOKIES_JSON?.trim();
  const dir = env.APHRODY_HOME?.trim() || join(home, ".aphrody");
  return [
    ...(explicit ? [explicit] : []),
    join(dir, "cookies", "gemini-web.json"),
    join(dir, "cookies", "gemini.json"),
    join(dir, "cookies", "google.json"),
    join(dir, "google-cookies.json"),
    join(dir, "google-session.json"),
    join(home, ".gemini", ".cookies", "gemini.google.com.json"),
  ];
}

/** Flatten a chat into the single prompt the Gemini web client accepts. */
export function flattenPrompt(messages: readonly LlmMessage[]): string {
  const system = messages
    .filter((m) => m.role === "system")
    .map((m) => m.content)
    .join("\n\n");
  const turns = messages
    .filter((m) => m.role !== "system")
    .map((m) => `${m.role === "user" ? "Utilisateur" : "Assistant"} : ${m.content}`)
    .join("\n\n");
  return `${system ? `Consignes :\n${system}\n\n` : ""}${turns}\n\nAssistant :`;
}

export function createGeminiWebBackend(o: {
  binary: string;
  cookiePaths: readonly string[];
  model?: string;
  /** Skip the backend for this long after a failure (default 5 min). */
  coolDownMs?: number;
  timeoutMs?: number;
}): LlmBackend {
  const model = o.model ?? "flash";
  let failedUntil = 0;
  let lastError: string | undefined;
  const cookie = () => o.cookiePaths.find((path) => existsSync(path)) ?? null;
  const installed = () =>
    /[\\/]/.test(o.binary) ? existsSync(o.binary) : Bun.which(o.binary) !== null;
  return {
    id: "gemini-web",
    model: `gemini-web/${model}`,
    async status() {
      if (!installed())
        return {
          available: false,
          model: `gemini-web/${model}`,
          detail: `${o.binary} not installed`,
        };
      if (!cookie())
        return { available: false, model: `gemini-web/${model}`, detail: "no Gemini cookie store" };
      if (Date.now() < failedUntil)
        return {
          available: false,
          model: `gemini-web/${model}`,
          detail: `cooling down: ${lastError}`,
        };
      return {
        available: true,
        model: `gemini-web/${model}`,
        detail: lastError ? `last error: ${lastError}` : undefined,
      };
    },
    async *stream(messages, _options, signal) {
      if (Date.now() < failedUntil)
        throw new BackendUnavailable("gemini-web", `cooling down after: ${lastError}`);
      const path = cookie();
      if (!path) throw new BackendUnavailable("gemini-web", "no Gemini cookie store");
      if (!installed()) throw new BackendUnavailable("gemini-web", `${o.binary} not installed`);
      const request = JSON.stringify({ cookie_path: path, prompt: flattenPrompt(messages), model });
      const child = Bun.spawn([o.binary], {
        stdin: new Blob([request]),
        stdout: "pipe",
        stderr: "pipe",
        signal: AbortSignal.any([signal, AbortSignal.timeout(o.timeoutMs ?? 125_000)]),
      });
      const [out, code] = await Promise.all([new Response(child.stdout).text(), child.exited]);
      let reply: { text?: string; error?: string };
      try {
        reply = JSON.parse(out.trim().split("\n").at(-1) ?? "{}");
      } catch {
        reply = { error: `invalid output (exit ${code})` };
      }
      if (!reply.text) {
        lastError = (reply.error ?? `exit ${code}`).slice(0, 300);
        failedUntil = Date.now() + (o.coolDownMs ?? 5 * 60_000);
        throw new BackendUnavailable("gemini-web", lastError);
      }
      lastError = undefined;
      // The web client answers in one piece: re-chunk it on word boundaries.
      for (const piece of reply.text.match(/\S+\s*/g) ?? [reply.text]) {
        if (signal.aborted) return;
        yield piece;
      }
    },
  };
}

// ── Extractive (no model) ───────────────────────────────────────────────────

export function createExtractiveBackend(): LlmBackend {
  return {
    id: "extractive",
    model: null,
    async status() {
      return { available: true, model: null, detail: "passages cited verbatim, no generation" };
    },
    async *stream(messages) {
      // The engine passes the numbered sources in the last user message.
      const user = messages.findLast((m) => m.role === "user")?.content ?? "";
      const blocks = [
        ...user.matchAll(/^\[(\d+)\] ([^\n]+)\n([\s\S]*?)(?=\n\[\d+\] |\n\nQuestion|$)/gm),
      ].slice(0, 3);
      if (blocks.length === 0) {
        yield "Aucune source de la base Shenron ne répond à cette question.";
        return;
      }
      yield "Extraits des sources (aucun modèle de langage n'était disponible) :\n";
      for (const [, n, title, text] of blocks) {
        const excerpt = (text ?? "").replace(/\s+/g, " ").trim().slice(0, 400);
        yield `\n[${n}] ${title?.split(" — ")[0] ?? ""} : ${excerpt}${excerpt.length >= 400 ? "…" : ""}\n`;
      }
    },
  };
}

/** Backends from the environment, in `SHENRON_CHAT_BACKENDS` order (default `gemini-web,local`). */
export function backendsFromEnv(env: Record<string, string | undefined>): LlmBackend[] {
  const order = (env.SHENRON_CHAT_BACKENDS ?? "gemini-web,local")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const out: LlmBackend[] = [];
  for (const id of order) {
    if (id === "gemini-web") {
      out.push(
        createGeminiWebBackend({
          binary: env.APHRODY_GEMINI_WEB_BIN?.trim() || "aphrody-gemini-web",
          cookiePaths: geminiCookieCandidates(env),
          ...(env.SHENRON_GEMINI_MODEL ? { model: env.SHENRON_GEMINI_MODEL } : {}),
        }),
      );
    } else if (id === "local") {
      const base =
        env.APHRODY_AI_CHAT_BASE_URL?.trim() ||
        env.APHRODY_SHENRON_LLM_BASE_URL?.trim() ||
        (env.APHRODY_LOCAL_MODEL_URL?.trim()
          ? `${env.APHRODY_LOCAL_MODEL_URL.trim().replace(/\/+$/, "")}/v1`
          : "");
      if (base) {
        out.push(
          createOpenAiBackend({
            id: "local",
            baseUrl: base,
            model: env.APHRODY_AI_CHAT_MODEL?.trim() || null,
            apiKey: env.APHRODY_AI_CHAT_API_KEY?.trim() || null,
          }),
        );
      }
    } else if (id === "extractive") {
      out.push(createExtractiveBackend());
    }
  }
  return out;
}
