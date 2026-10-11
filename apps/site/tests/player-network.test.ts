// SPDX-License-Identifier: Apache-2.0
import { expect, test } from "bun:test";
import { probePlayerNetwork } from "../src/lib/player-network";

test("network probe does not require CORS or send provider credentials", async () => {
  const signal = new AbortController().signal;
  const request = async (_url: string, options: RequestInit) => {
    expect(options).toMatchObject({ method: "HEAD", mode: "no-cors", credentials: "omit", signal });
    return new Response(null);
  };
  expect(await probePlayerNetwork("https://example.com/embed", signal, request)).toBe("reachable");
});

test("DNS/network failure triggers fallback but cancellation is inconclusive", async () => {
  const request = async () => {
    throw new TypeError("Failed to fetch");
  };
  expect(
    await probePlayerNetwork("https://example.com/embed", new AbortController().signal, request),
  ).toBe("unreachable");
  expect(await probePlayerNetwork("https://example.com/embed", AbortSignal.abort(), request)).toBe(
    "unknown",
  );
});
