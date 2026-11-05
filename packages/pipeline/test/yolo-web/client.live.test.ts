// Live tier, run on the build VPS only (`*.live.test.ts` is excluded from `bun run test`).
//   YOLO_WEB_CLI=<yolo-web>/packages/web-cli/src/index.ts \
//   YOLO_CDP_ENDPOINT=http://127.0.0.1:9222 \
//   bun test packages/pipeline/test/yolo-web/client.live.test.ts
// Needs a yolo-web checkout with `bun install` done and a CDP endpoint (headless Chrome with
// --remote-debugging-port=9222 is enough; yolo-web does not start one). Skips without YOLO_WEB_CLI.
import { describe, expect, it } from "bun:test";
import { probeYoloWeb, withYoloWeb } from "../../src/yolo-web";

const live = process.env.YOLO_WEB_CLI ? describe : describe.skip;

live("YOLO WEB live (web-cli mcp over stdio)", () => {
  it("lists the real browser tools and probes the CDP endpoint", async () => {
    const probe = await probeYoloWeb();
    expect(probe.hasBrowserTools).toBe(true);
    expect(probe.tools).toBeGreaterThan(10);
    expect(probe.cdp.browser.length).toBeGreaterThan(0);
  }, 60_000);

  it("navigates, extracts text and evaluates on a real page", async () => {
    const url = process.env.YOLO_WEB_LIVE_URL ?? "https://dragonballfr.com/";
    await withYoloWeb(async (mcp) => {
      const text = await mcp.markdown(url);
      expect(text).toContain(`Source: ${new URL(url).origin}`);
      const links = await mcp.extract({ links: "a[href]" });
      expect(Array.isArray(links.links)).toBe(true);
      expect(links.links.length).toBeGreaterThan(0);
      expect(await mcp.evaluate<string>("document.title")).toBeTypeOf("string");
    });
  }, 120_000);
});
