// SPDX-License-Identifier: Apache-2.0
import { describe, expect, test } from "bun:test";
import { choice, inspect, noul, selections } from "../src/index";
import { letterProbabilities, llamaServer } from "../src/llama-server";

function server(tops: { token: string; logprob: number }[][]) {
  const prompts: string[] = [];
  let call = 0;
  const fetch_ = (async (_url: unknown, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body));
    expect(body.chat_template_kwargs).toEqual({ enable_thinking: false });
    expect(body.max_tokens).toBe(1);
    prompts.push(body.messages[0].content);
    const top = tops[call++] ?? tops[tops.length - 1]!;
    return Response.json({ choices: [{ logprobs: { content: [{ top_logprobs: top }] } }] });
  }) as typeof fetch;
  return { fetch: fetch_, prompts };
}

describe("letterProbabilities", () => {
  test("renormalises over the valid letters and ignores other tokens", () => {
    const p = letterProbabilities([{ token: "A", logprob: Math.log(0.6) }, { token: "B", logprob: Math.log(0.2) }, { token: "The", logprob: Math.log(0.2) }], 2);
    expect(p[0]).toBeCloseTo(0.75, 5);
    expect(p[1]).toBeCloseTo(0.25, 5);
  });

  test("a leading space and lower case still count", () => {
    expect(letterProbabilities([{ token: " b", logprob: 0 }], 2)).toEqual([0, 1]);
  });

  test("letters beyond the outcome count are ignored; no valid letter is an error", () => {
    expect(() => letterProbabilities([{ token: "C", logprob: 0 }], 2)).toThrow("no probability");
  });
});

describe("llamaServer provider", () => {
  const criteria = { supports: "The excerpt supports the claim", contradicts: "The excerpt contradicts the claim", unrelated: "The excerpt is unrelated" };

  test("choice answer carries the real probabilities and abstains below the threshold", async () => {
    const mock = server([[{ token: "A", logprob: Math.log(0.55) }, { token: "B", logprob: Math.log(0.3) }, { token: "C", logprob: Math.log(0.15) }]]);
    const request = { state: { claim: "x" }, questions: { relation: choice("How does the excerpt relate to the claim?", criteria) } };
    const result = await inspect(request, { provider: llamaServer({ url: "http://127.0.0.1:1", model: "qwen3.5-2b", fetch: mock.fetch }) });
    const answer = result.answers.relation;
    expect(answer.choice).toBe("supports");
    expect(answer.confidence).toBeCloseTo(0.55, 5);
    expect(answer.probabilities.contradicts).toBeCloseTo(0.3, 5);
    expect(selections(request, result, 0.5).relation).toBe("supports");
    expect(selections(request, result, 0.8).relation).toBeNull();
    expect(mock.prompts[0]).toContain("A. supports:");
  });

  test("noul reads the probability of yes", async () => {
    const mock = server([[{ token: "A", logprob: Math.log(0.2) }, { token: "B", logprob: Math.log(0.8) }]]);
    const result = await inspect({ state: {}, questions: { flag: noul("Is it canon?") } }, { provider: llamaServer({ url: "http://x", model: "m", fetch: mock.fetch }) });
    expect(result.answers.flag.noul).toBeCloseTo(0.8, 5);
  });

  test("a server error is an error, never a silent answer", async () => {
    const failing = (async () => new Response("boom", { status: 503 })) as unknown as typeof fetch;
    await expect(inspect({ state: {}, questions: { q: choice("?", { a: "a", b: "b" }) } }, { provider: llamaServer({ url: "http://x", model: "m", fetch: failing }) })).rejects.toThrow("llama-server 503");
  });
});
