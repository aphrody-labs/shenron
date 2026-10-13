import { afterEach, describe, expect, mock, test } from "bun:test";
import { NextRequest } from "next/server";

mock.module("@/lib/session", () => ({ isCurrentUserAdmin: async () => true }));
mock.module("@/lib/env", () => ({ env: { SHENRON_ADMIN_TOKEN: "test-token" } }));
mock.module("@/lib/config", () => ({ botApiBaseUrl: () => "http://bot.test" }));

const { GET, DELETE } = await import("../src/app/api/bot-admin/[...path]/route");
const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
});
const ctx = { params: Promise.resolve({ path: ["services"] }) };

describe("bot admin proxy", () => {
  test("returns JSON when the upstream connection fails", async () => {
    globalThis.fetch = (async () => {
      throw new TypeError("Connection refused");
    }) as unknown as typeof fetch;
    const response = await GET(new NextRequest("http://site.test/api/bot-admin/services"), ctx);
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ error: "Bot API unavailable" });
  });

  test("preserves successful no-content mutations", async () => {
    globalThis.fetch = (async () => new Response(null, { status: 204 })) as unknown as typeof fetch;
    const response = await DELETE(
      new NextRequest("http://site.test/api/bot-admin/services", { method: "DELETE" }),
      ctx,
    );
    expect(response.status).toBe(204);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.text()).toBe("");
  });

  test("returns JSON when the upstream body stream fails", async () => {
    const stream = new ReadableStream({
      start(controller) {
        controller.error(new Error("Connection interrupted"));
      },
    });
    globalThis.fetch = (async () =>
      new Response(stream, {
        headers: { "content-type": "application/json" },
      })) as unknown as typeof fetch;
    const response = await GET(new NextRequest("http://site.test/api/bot-admin/services"), ctx);
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ error: "Bot API unavailable" });
  });

  test("streams server events without buffering", async () => {
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode("data: ready\n\n"));
        controller.close();
      },
    });
    globalThis.fetch = (async () =>
      new Response(stream, {
        headers: { "content-type": "text/event-stream" },
      })) as unknown as typeof fetch;
    const response = await GET(new NextRequest("http://site.test/api/bot-admin/services"), ctx);
    expect(response.headers.get("x-accel-buffering")).toBe("no");
    expect(await response.text()).toBe("data: ready\n\n");
  });
});
