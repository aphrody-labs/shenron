import { afterEach, describe, expect, test } from "bun:test";
import { api, ApiError } from "../src/lib/admin-api";

const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("admin browser API", () => {
  test("surfaces the upstream JSON error message", async () => {
    globalThis.fetch = (async () =>
      Response.json({ error: "Service offline" }, { status: 502 })) as unknown as typeof fetch;
    try {
      await api.get("/services");
      throw new Error("Expected failure");
    } catch (error) {
      expect(error).toBeInstanceOf(ApiError);
      expect((error as ApiError).status).toBe(502);
      expect((error as ApiError).message).toBe("Service offline");
    }
  });

  test("accepts empty JSON success responses", async () => {
    globalThis.fetch = (async () =>
      new Response("", {
        headers: { "content-type": "application/json" },
      })) as unknown as typeof fetch;
    expect(await api.get("/services")).toBeNull();
  });

  test("forwards cancellation to the browser request", async () => {
    const controller = new AbortController();
    let received: AbortSignal | null | undefined;
    globalThis.fetch = (async (_input: RequestInfo | URL, opts?: RequestInit) => {
      received = opts?.signal;
      return Response.json({ ok: true });
    }) as unknown as typeof fetch;
    await api.get("/services", { signal: controller.signal });
    expect(received).toBe(controller.signal);
  });

  test("parses structured JSON content types", async () => {
    globalThis.fetch = (async () =>
      new Response('{"ok":true}', {
        headers: { "content-type": "application/vnd.shenron+json" },
      })) as unknown as typeof fetch;
    expect(await api.get("/services")).toEqual({ ok: true });
  });
});
