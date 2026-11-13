import { describe, expect, it } from "bun:test";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  YoloWebBatchCapture,
  YoloWebNotConfiguredError,
  probeYoloWeb,
  withYoloWeb,
  yoloWebScrape,
} from "../../src/yolo-web";

const FIXTURE = join(import.meta.dir, "fixture-server.ts");

describe("YOLO WEB stdio client (fixture server with the web-cli mcp framing)", () => {
  it("has no default entry: a missing YOLO_WEB_CLI is a configuration error", async () => {
    const saved = process.env.YOLO_WEB_CLI;
    delete process.env.YOLO_WEB_CLI;
    try {
      await expect(yoloWebScrape("https://gemini.google.com/")).rejects.toBeInstanceOf(
        YoloWebNotConfiguredError,
      );
    } finally {
      if (saved !== undefined) process.env.YOLO_WEB_CLI = saved;
    }
  });

  it("refuses non-HTTP(S) URLs and embedded credentials before spawning anything", async () => {
    await withYoloWeb(
      async (mcp) => {
        await expect(mcp.navigate("file:///etc/passwd")).rejects.toThrow("HTTP(S)");
        await expect(mcp.capture("https://u:p@gemini.google.com/")).rejects.toThrow("credentials");
      },
      { cli: FIXTURE },
    );
  });

  it("handshakes, lists tools and calls a tool over stdio", async () => {
    await withYoloWeb(
      async (mcp) => {
        const tools = await mcp.listTools();
        expect(tools.map((tool) => tool.name)).toContain("browser_navigate");
        expect(mcp.serverInfo.name).toBe("fixture-web-mcp");
        expect(await mcp.markdown("https://gemini.google.com/a")).toContain(
          "Source: https://gemini.google.com/a",
        );
        expect(await mcp.capture("https://gemini.google.com/b")).toEqual({
          url: "https://gemini.google.com/b",
          title: "Fixture",
          content: "<html>https://gemini.google.com/b</html>",
        });
        await expect(mcp.tool("nope")).rejects.toThrow("unknown tool nope");
      },
      { cli: FIXTURE },
    );
  });

  it("probe reports tools and the CDP version, and fails when the CDP endpoint is down", async () => {
    const ok = await probeYoloWeb({
      cli: FIXTURE,
      env: { YOLO_CDP_ENDPOINT: "http://127.0.0.1:9" },
      fetcher: (async () => Response.json({ Browser: "Chrome/150.0" })) as unknown as typeof fetch,
    });
    expect(ok).toMatchObject({
      server: { name: "fixture-web-mcp" },
      tools: 3,
      hasBrowserTools: true,
      cdp: { endpoint: "http://127.0.0.1:9", browser: "Chrome/150.0" },
    });
    await expect(
      probeYoloWeb({
        cli: FIXTURE,
        env: { YOLO_CDP_ENDPOINT: "http://127.0.0.1:9" },
        fetcher: (async () => new Response("no", { status: 502 })) as unknown as typeof fetch,
      }),
    ).rejects.toThrow("HTTP 502");
  });

  it("a server that exits is reported with its status, not a hang", async () => {
    await expect(
      yoloWebScrape("https://gemini.google.com/", { cli: "/bin/false", timeoutMs: 5_000 }),
    ).rejects.toThrow(/exited with code|failed to start|timed out/);
  });

  it("batch capture writes one HTML file per URL", async () => {
    const dir = mkdtempSync(join(tmpdir(), "yolo-web-batch-"));
    try {
      const batch = new YoloWebBatchCapture(dir, { cli: FIXTURE });
      const job = await batch.crawl({
        urls: ["https://gemini.google.com/1", "https://gemini.google.com/2"],
      });
      expect(job.status).toBe("completed");
      expect(job.stats).toEqual({ total: 2, saved: 2, failed: 0 });
      const files = readdirSync(dir);
      expect(files).toHaveLength(2);
      expect(readFileSync(join(dir, files[0]!), "utf8")).toContain("<html>");
      expect((await batch.status(job.id)).status).toBe("completed");
      await expect(batch.status("unknown")).rejects.toMatchObject({ status: 404 });
      await expect(batch.crawl({ urls: [] })).rejects.toThrow("1 to 10");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
