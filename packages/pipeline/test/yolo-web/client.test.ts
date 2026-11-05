import { describe, expect, it } from "bun:test";
import {
  YoloWebCrawlClient,
  YoloWebMcp,
  YoloWebNotConfiguredError,
  resolveYoloWebUrl,
} from "../../src/yolo-web";

describe("YOLO WEB client", () => {
  it("has no default host: missing URL is a configuration error", () => {
    const saved = process.env.YOLO_WEB_API_URL;
    delete process.env.YOLO_WEB_API_URL;
    try {
      expect(() => resolveYoloWebUrl("YOLO_WEB_API_URL")).toThrow(YoloWebNotConfiguredError);
    } finally {
      if (saved !== undefined) process.env.YOLO_WEB_API_URL = saved;
    }
  });

  it("refuses plain HTTP off loopback and embedded credentials", () => {
    expect(() => resolveYoloWebUrl("X", "http://10.0.0.5:18800")).toThrow("HTTPS or loopback");
    expect(() => resolveYoloWebUrl("X", "https://u:p@host.example")).toThrow("credentials");
    expect(resolveYoloWebUrl("X", "http://127.0.0.1:18800").port).toBe("18800");
  });

  it("enqueues, reads status and results from the coordinator", async () => {
    const seen: string[] = [];
    const client = new YoloWebCrawlClient({
      baseUrl: "http://127.0.0.1:18800",
      fetcher: (async (input, init) => {
        const path = new URL(String(input)).pathname;
        seen.push(`${init?.method} ${path}`);
        if (path === "/enqueue") return Response.json({ enqueued: [7] });
        if (path === "/status")
          return Response.json({ queued: 1, workers: 1, observers: 0, jobs: { done: 2 } });
        return Response.json([]);
      }) as typeof fetch,
    });
    expect(await client.enqueue(["https://example.org/"], "cdp")).toEqual([7]);
    expect((await client.status()).queued).toBe(1);
    expect(await client.results()).toEqual([]);
    expect(seen).toEqual(["POST /enqueue", "GET /status", "GET /results"]);
    await expect(client.enqueue([])).rejects.toThrow("1 to 10");
  });

  it("captures a page through the MCP tools", async () => {
    const calls: string[] = [];
    const mcp = new YoloWebMcp({
      baseUrl: "http://127.0.0.1:3100",
      fetcher: (async (_input, init) => {
        const body = JSON.parse(String(init?.body)) as {
          id?: number;
          method: string;
          params?: { name?: string };
        };
        calls.push(body.params?.name ?? body.method);
        if (body.method === "notifications/initialized") return new Response(null, { status: 202 });
        const result =
          body.method === "initialize"
            ? {}
            : body.params?.name === "browser_evaluate"
              ? {
                  content: [
                    {
                      type: "text",
                      text: JSON.stringify({
                        result: { value: { title: "T", html: "<html>x</html>" } },
                      }),
                    },
                  ],
                }
              : { content: [{ type: "text", text: "{}" }] };
        return Response.json({ jsonrpc: "2.0", id: body.id, result });
      }) as typeof fetch,
    });
    const page = await mcp.capture("https://example.org/a");
    expect(page).toEqual({ url: "https://example.org/a", title: "T", content: "<html>x</html>" });
    expect(calls).toEqual([
      "initialize",
      "notifications/initialized",
      "browser_navigate",
      "browser_evaluate",
    ]);
  });
});
