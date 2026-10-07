// SPDX-License-Identifier: Apache-2.0
import { expect, test } from "bun:test";
import { join } from "node:path";
import { startEngine } from "@aphrody/agent-browser/engine";
import { TestPage } from "@aphrody/web-test";

test.skipIf(process.env.SHENRON_WEB_LIVE !== "1")(
  "shared mobile safe-area CSS keeps the Discord control above the navigation",
  async () => {
    const css = await Bun.file(
      join(import.meta.dir, "../../../../packages/ui/src/barre-nav.css"),
    ).text();
    const server = Bun.serve({
      hostname: "127.0.0.1",
      port: 0,
      fetch: () =>
        new Response(
          `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}
        body{margin:0}.fab-discord{position:fixed;left:16px;width:242px;height:44px}
        .barre-nav{position:fixed;bottom:0;width:100%;height:var(--barre-nav-total)}
        </style><header style="height:56px">Header</header><a class="fab-discord fab-secondary" href="#community">Discord</a><nav class="barre-nav">Navigation</nav>`,
          { headers: { "content-type": "text/html" } },
        ),
    });
    let engine: Awaited<ReturnType<typeof startEngine>> | undefined;
    let page: TestPage | undefined;
    try {
      engine = await startEngine({
        binary: process.env.APHRODY_WEB_BIN ?? Bun.which("aphrody-web") ?? undefined,
        allowPrivateNetwork: true,
      });
      page = await TestPage.create({ cdpUrl: engine.endpoint, baseURL: server.url.href });
      await page.raw._send("Emulation.setDeviceMetricsOverride", {
        width: 390,
        height: 844,
        deviceScaleFactor: 1,
        mobile: true,
      });
      await page.goto("/");
      const geometry = await page.raw.evaluate<{
        inviteTop: number;
        inviteBottom: number;
        navTop: number;
        navHeight: number;
        headerBottom: number;
        paddingBottom: string;
      }>(`(()=>{const rect=s=>document.querySelector(s).getBoundingClientRect();
        const invite=rect('.fab-discord'),nav=rect('.barre-nav'),header=rect('header');
        return {inviteTop:invite.top,inviteBottom:invite.bottom,navTop:nav.top,navHeight:nav.height,
          headerBottom:header.bottom,paddingBottom:getComputedStyle(document.body).paddingBottom}})()`);
      expect(geometry.paddingBottom).toBe("80px");
      expect(geometry.navHeight).toBe(80);
      expect(geometry.navTop).toBe(764);
      expect(geometry.inviteTop).toBe(652);
      expect(geometry.inviteTop).toBeGreaterThan(geometry.headerBottom);
      expect(geometry.inviteBottom).toBeLessThan(geometry.navTop);
    } finally {
      try {
        await page?.close();
      } finally {
        try {
          await engine?.stop();
        } finally {
          await server.stop(true);
        }
      }
    }
  },
  60_000,
);
