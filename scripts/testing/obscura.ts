// SPDX-License-Identifier: Apache-2.0
/**
 * Runs a callback against a local YOLO WEB CDP server (`yolo-browser serve --port N`).
 *
 * Uses native BunBrowser CDP client to drive the session with zero external dependencies.
 * `YOLO_WEB_BIN` overrides the executable.
 */
import { BunBrowser, type BunBrowserPage } from "./bun-browser";

export type ObscuraSession = { cdpUrl: string; page: (baseURL: string) => Promise<BunBrowserPage> };

async function freePort(): Promise<number> {
  const probe = Bun.listen({ hostname: "127.0.0.1", port: 0, socket: { data() {} } });
  const { port } = probe;
  probe.stop(true);
  return port;
}

/** Spawns a CDP server, waits for `/json/version`, runs the callback, then stops the server. */
export async function withCdpServer<T>(
  command: (port: number) => string[],
  run: (session: ObscuraSession) => Promise<T>,
): Promise<T> {
  const port = await freePort();
  const child = Bun.spawn(command(port), { stdout: "ignore", stderr: "ignore" });
  try {
    const deadline = Date.now() + 15_000;
    let cdpUrl = "";
    while (!cdpUrl) {
      try {
        const response = await fetch(`http://127.0.0.1:${port}/json/version`);
        if (response.ok)
          cdpUrl = ((await response.json()) as { webSocketDebuggerUrl: string })
            .webSocketDebuggerUrl;
      } catch {
        // No /json/version (yolo-browser serves the browser endpoint only): accept an open port.
        try {
          const socket = await Bun.connect({ hostname: "127.0.0.1", port, socket: { data() {} } });
          socket.end();
          cdpUrl = `ws://127.0.0.1:${port}/devtools/browser`;
        } catch {
          // server not listening yet
        }
      }
      if (!cdpUrl && Date.now() > deadline)
        throw new Error(`CDP server did not open port ${port} in 15s`);
      if (!cdpUrl) await Bun.sleep(100);
    }
    const browser = await BunBrowser.connect(cdpUrl);
    try {
      return await run({
        cdpUrl,
        page: (baseURL) => browser.newPage({ baseURL }),
      });
    } finally {
      await browser.close();
    }
  } finally {
    child.kill();
    await child.exited;
  }
}

export async function withObscura<T>(run: (session: ObscuraSession) => Promise<T>): Promise<T> {
  const binary = process.env.YOLO_WEB_BIN ?? Bun.which("yolo-browser");
  if (!binary)
    throw new Error(
      "yolo-browser not found; build apps/yolo-browser-cli from yolo-rs/yolo-web or set YOLO_WEB_BIN",
    );
  return withCdpServer((port) => [binary, "serve", "--port", String(port)], run);
}

export const VIEWPORTS = [
  { name: "desktop", width: 1280, height: 800, mobile: false },
  { name: "mobile", width: 390, height: 844, mobile: true },
] as const;

export async function setViewport(page: BunBrowserPage, viewport: (typeof VIEWPORTS)[number]) {
  await page.setViewport(viewport);
}
