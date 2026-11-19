// SPDX-License-Identifier: Apache-2.0
/**
 * CPU-first decision provider over a `llama-server` (llama.cpp) OpenAI-compatible endpoint.
 *
 * Each question becomes one single-token generation: the outcomes are labelled A, B, C and so on, the
 * model answers with one letter, and the probability of each outcome is read from the log-probabilities
 * of that first token, renormalised over the valid letters. Confidence is therefore a real model
 * probability (not a self-reported number), which is what the confidence abstention of `selections`
 * needs. One output token keeps CPU cost at the prompt prefill, which `cache_prompt` reuses across the
 * questions that share the same state.
 *
 * Probabilities are the model's, not calibrated: pick the abstention threshold on labelled data.
 */
import type { ChoiceQuestion, NoulQuestion, Provider, ProviderOptions, Question, Request } from "./types";

export interface LlamaServerOptions {
  /** Base URL of the server, for example `http://127.0.0.1:8080`. */
  url: string;
  /** Model name recorded in results; llama-server serves one model and ignores it in the request. */
  model: string;
  /** Bearer key when the server runs with `--api-key`. */
  apiKey?: string;
  /** Injected for tests; defaults to the global fetch. */
  fetch?: typeof fetch;
}

const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

interface TopLogprob {
  token: string;
  logprob: number;
}

function labelsOf(question: Question): string[] {
  if (question.type === "noul") return ["no", "yes"];
  if (question.type === "choice") return Object.keys(question.criteria);
  throw new TypeError("llama-server provider supports noul and choice questions only");
}

function describeOutcomes(question: ChoiceQuestion): string {
  return Object.entries(question.criteria)
    .map(([label, description], index) => `${LETTERS[index]}. ${label}: ${typeof description === "string" ? description : JSON.stringify(description)}`)
    .join("\n");
}

function promptFor(request: Request, name: string, question: Question): string {
  const state = JSON.stringify(request.state);
  const instructions = typeof question.instructions === "string" ? question.instructions : JSON.stringify(question.instructions ?? "");
  if (question.type === "noul") {
    return `State:\n${state}\n\nQuestion (${name}): ${instructions}\nAnswer with one letter: A for no, B for yes.`;
  }
  const choice = question as ChoiceQuestion;
  return `State:\n${state}\n\nQuestion (${name}): ${instructions}\nOutcomes:\n${describeOutcomes(choice)}\nAnswer with the letter of exactly one outcome.`;
}

/** Probabilities over the valid letters from the first generated token's top log-probabilities. */
export function letterProbabilities(top: readonly TopLogprob[], count: number): number[] {
  const mass = Array.from({ length: count }, () => 0);
  for (const { token, logprob } of top) {
    const index = LETTERS.indexOf(token.trim().toUpperCase());
    if (token.trim().length === 1 && index >= 0 && index < count) mass[index] = Math.max(mass[index]!, Math.exp(logprob));
  }
  const total = mass.reduce((sum, value) => sum + value, 0);
  if (total <= 0) throw new Error("model gave no probability to any valid outcome letter");
  return mass.map((value) => value / total);
}

export function llamaServer(options: LlamaServerOptions): Provider {
  const request_ = options.fetch ?? fetch;
  const endpoint = `${options.url.replace(/\/+$/, "")}/v1/chat/completions`;

  async function topLogprobs(prompt: string, count: number, signal: AbortSignal | undefined): Promise<TopLogprob[]> {
    const response = await request_(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json", ...(options.apiKey ? { authorization: `Bearer ${options.apiKey}` } : {}) },
      body: JSON.stringify({
        model: options.model,
        messages: [{ role: "user", content: prompt }],
        max_tokens: 1,
        temperature: 0,
        logprobs: true,
        top_logprobs: Math.min(20, Math.max(count * 4, 8)),
        cache_prompt: true,
        // Reasoning models (Qwen3.5) otherwise open with a thinking token, not the answer letter.
        chat_template_kwargs: { enable_thinking: false },
      }),
      ...(signal ? { signal } : {}),
    });
    if (!response.ok) throw new Error(`llama-server ${response.status}`);
    const body = (await response.json()) as { choices?: { logprobs?: { content?: { top_logprobs?: TopLogprob[] }[] } }[] };
    const top = body.choices?.[0]?.logprobs?.content?.[0]?.top_logprobs;
    if (!Array.isArray(top) || top.length === 0) throw new Error("llama-server returned no log-probabilities");
    return top;
  }

  return {
    async systemOne(request: Request, provider?: ProviderOptions) {
      const entries = Object.entries(request.questions);
      const answers: Record<string, unknown> = {};
      // The server is CPU-bound: questions run one after another, sharing the cached prompt prefix.
      for (const [name, question] of entries) {
        const labels = labelsOf(question);
        const probabilities = letterProbabilities(await topLogprobs(promptFor(request, name, question), labels.length, provider?.signal), labels.length);
        const best = probabilities.indexOf(Math.max(...probabilities));
        const byLabel = Object.fromEntries(labels.map((label, index) => [label, probabilities[index]!]));
        answers[name] =
          question.type === "noul"
            ? ({ type: "noul", noul: probabilities[1]! } satisfies { type: "noul"; noul: number })
            : { type: "choice", choice: labels[best]!, confidence: probabilities[best]!, probabilities: byLabel };
      }
      return { model: options.model, usage: null, answers };
    },
  };
}

export type { NoulQuestion };
