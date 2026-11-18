// SPDX-License-Identifier: Apache-2.0
import { describe, expect, test } from "bun:test";
import { handleBotScheduled, handleBotWorker } from "./bot-worker";

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

describe("shenron-bot worker", () => {
  test("health reports interactions config without leaking secrets", async () => {
    const res = await handleBotWorker(new Request("https://bot.dragonballfr.com/health"), {
      DISCORD_PUBLIC_KEY: "00".repeat(32),
      SHENRON_PUBLIC_SITE_URL: "https://dragonballfr.com",
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      status: "ok",
      service: "shenron-bot",
      interactionsConfigured: true,
      site: "https://dragonballfr.com",
    });
  });

  test("rejects unsigned interactions and responds PONG / command over Ed25519 Web Crypto", async () => {
    const keyPair = (await crypto.subtle.generateKey("Ed25519", true, [
      "sign",
      "verify",
    ])) as CryptoKeyPair;
    const rawPub = new Uint8Array(await crypto.subtle.exportKey("raw", keyPair.publicKey));
    const pubHex = toHex(rawPub);

    const bad = await handleBotWorker(
      new Request("https://bot.dragonballfr.com/interactions", {
        method: "POST",
        headers: { "X-Signature-Ed25519": "00".repeat(64), "X-Signature-Timestamp": "123" },
        body: JSON.stringify({ type: 1 }),
      }),
      { DISCORD_PUBLIC_KEY: pubHex },
    );
    expect(bad.status).toBe(401);

    const body = JSON.stringify({ id: "1", application_id: "2", token: "t", type: 1 });
    const ts = "1700000000";
    const sig = new Uint8Array(
      await crypto.subtle.sign(
        "Ed25519",
        keyPair.privateKey,
        new TextEncoder().encode(`${ts}${body}`),
      ),
    );
    const pong = await handleBotWorker(
      new Request("https://bot.dragonballfr.com/interactions", {
        method: "POST",
        headers: { "X-Signature-Ed25519": toHex(sig), "X-Signature-Timestamp": ts },
        body,
      }),
      { DISCORD_PUBLIC_KEY: pubHex },
    );
    expect(pong.status).toBe(200);
    expect(await pong.json()).toEqual({ type: 1 });
  });

  test("scheduled flushes billing outbox and probes health without throwing", async () => {
    const calls: string[] = [];
    const savedFetch = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      calls.push(String(input));
      return new Response("{}", { status: 200 });
    }) as typeof fetch;
    try {
      await handleBotScheduled(
        { cron: "0 * * * *", scheduledTime: Date.now() },
        {
          SHENRON_PUBLIC_SITE_URL: "https://dragonballfr.com",
          SHENRON_BILLING_OUTBOX_TOKEN: "t".repeat(32),
        },
      );
      expect(calls).toEqual([
        "https://dragonballfr.com/api/cron/billing-outbox",
        "https://dragonballfr.com/api/health",
      ]);
    } finally {
      globalThis.fetch = savedFetch;
    }
  });
});
