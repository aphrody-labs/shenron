// SPDX-License-Identifier: Apache-2.0
import { expect, test } from "bun:test";
import { BxcServerBridge } from "../src/bxc/server";

test("The Node facade uses the authenticated typed HTTP owner", async () => {
  const received: Request[] = [];
  const fetcher = (async (url: string | URL | Request, init?: RequestInit) => {
    const request = new Request(url, init);
    received.push(request);
    return Response.json({ version: "aphrody 0.3.0", capabilities: ["frames-stats"] });
  }) as typeof fetch;
  const bridge = new BxcServerBridge({
    baseUrl: "https://owner.test",
    token: "test-owner",
    fetcher,
  });
  expect(await bridge.version()).toBe("aphrody 0.3.0");
  expect(received[0]!.url).toBe("https://owner.test/api/v1/web/status");
  expect(received[0]!.headers.get("authorization")).toBe("Bearer test-owner");
  expect(received[0]!.redirect).toBe("manual");
  expect(received[0]!.cache).toBe("no-store");
});

test("The facade rejects false receipts and redacts upstream failures", async () => {
  const invalid = new BxcServerBridge({
    baseUrl: "https://owner.test",
    token: "test",
    fetcher: (async () => Response.json({ online: true })) as typeof fetch,
  });
  await expect(invalid.version()).rejects.toThrow("invalid receipt");
  const unavailable = new BxcServerBridge({
    baseUrl: "https://owner.test",
    token: "test",
    fetcher: (async () => new Response("private-secret", { status: 503 })) as typeof fetch,
  });
  await expect(unavailable.version()).rejects.toThrow("HTTP 503");
  const credentials = new BxcServerBridge({
    baseUrl: "https://user:secret@owner.test",
    token: "test",
  });
  await expect(credentials.version()).rejects.toThrow("Invalid Shenron Web owner URL");
});
