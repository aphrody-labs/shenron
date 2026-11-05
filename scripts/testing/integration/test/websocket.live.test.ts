// SPDX-License-Identifier: Apache-2.0
import { expect, test } from "bun:test";
import { startEngine } from "@aphrody/agent-browser/engine";
import { TestPage } from "@aphrody/web-test";

test.skipIf(process.env.SHENRON_WEB_LIVE !== "1")(
  "Obscura exchanges real WebSocket messages through the browser SDK",
  async () => {
    let upgrades = 0;
    const server = Bun.serve({
      hostname: "127.0.0.1",
      port: 0,
      fetch(request, listener) {
        if (new URL(request.url).pathname === "/ws") {
          if (listener.upgrade(request)) {
            upgrades++;
            return;
          }
          return new Response("Upgrade failed", { status: 400 });
        }
        return new Response("<html><body>WebSocket fixture</body></html>", {
          headers: { "content-type": "text/html" },
        });
      },
      websocket: {
        message(socket, message) {
          socket.send(message);
        },
      },
    });
    let engine: Awaited<ReturnType<typeof startEngine>> | undefined;
    let page: TestPage | undefined;
    try {
      engine = await startEngine({
        binary: process.env.YOLO_WEB_BIN ?? Bun.which("yolo-browser") ?? undefined,
        allowPrivateNetwork: true,
      });
      page = await TestPage.create({ cdpUrl: engine.endpoint });
      await page.goto(`http://127.0.0.1:${server.port}`);
      await page.raw.evaluate(`
        globalThis.__webSocketQualification = { status: "pending" };
        const socket = new WebSocket("ws://127.0.0.1:${server.port}/ws");
        socket.onopen = () => socket.send("日本語é");
        socket.onmessage = event => {
          globalThis.__webSocketQualification = { status: "received", data: event.data };
          socket.close(3001, "qualified");
        };
        socket.onerror = () => { globalThis.__webSocketQualification = { status: "error" }; };
      `);
      let result: { status: string; data?: string } | undefined;
      const deadline = Date.now() + 5_000;
      do {
        result = await page.raw.evaluate("globalThis.__webSocketQualification");
        if (result?.status !== "pending") break;
        await Bun.sleep(50);
      } while (Date.now() < deadline);
      expect(upgrades).toBe(1);
      expect(result).toEqual({ status: "received", data: "日本語é" });
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
  30_000,
);
