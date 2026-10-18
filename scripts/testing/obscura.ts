// SPDX-License-Identifier: Apache-2.0
/**
 * Runs a callback against a local Obscura CDP server (`aphrody-web launch`).
 *
 * `startEngine` of @aphrody/agent-browser needs libaphrody_ffi.so, which is built on the VPS
 * factory only. The `aphrody-web` multicall link (`aphrody package install`) is enough for
 * rendered checks, so this helper spawns it directly on a free port and stops it afterwards.
 * `APHRODY_WEB_BIN` overrides the executable.
 */
import { TestPage } from "@aphrody/web-test";

export type ObscuraSession = { cdpUrl: string; page: (baseURL: string) => Promise<TestPage> };

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
        // server not listening yet
      }
      if (!cdpUrl && Date.now() > deadline)
        throw new Error(`CDP server did not open port ${port} in 15s`);
      if (!cdpUrl) await Bun.sleep(100);
    }
    return await run({
      cdpUrl,
      page: (baseURL) => TestPage.create({ cdpUrl, baseURL }),
    });
  } finally {
    child.kill();
    await child.exited;
  }
}

export async function withObscura<T>(run: (session: ObscuraSession) => Promise<T>): Promise<T> {
  const binary = process.env.APHRODY_WEB_BIN ?? Bun.which("aphrody-web");
  if (!binary) throw new Error("aphrody-web not found; run `aphrody package install`");
  return withCdpServer((port) => [binary, "launch", "--port", String(port)], run);
}

export const VIEWPORTS = [
  { name: "desktop", width: 1280, height: 800, mobile: false },
  { name: "mobile", width: 390, height: 844, mobile: true },
] as const;

export async function setViewport(page: TestPage, viewport: (typeof VIEWPORTS)[number]) {
  await page.raw.cdp("Emulation.setDeviceMetricsOverride", {
    width: viewport.width,
    height: viewport.height,
    deviceScaleFactor: 1,
    mobile: viewport.mobile,
  });
}
