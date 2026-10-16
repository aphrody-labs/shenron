// SPDX-License-Identifier: Apache-2.0
/** Runtime capability probes: each Bun API is optional, the pipeline falls back when absent. */
export interface Capabilities {
  fetchSession: boolean;
  nativeCrawl: boolean;
  webView: boolean;
  vectorIndex: boolean;
  adblock: boolean;
  yolo: boolean;
  vpn: "connected" | "down" | "unavailable";
}

type BunGlobals = {
  FetchSession?: unknown;
  Crawl?: { available?: boolean | (() => boolean) };
  WebView?: unknown;
  VectorIndex?: { available?: boolean | (() => boolean) };
};

const flag = (value: boolean | (() => boolean) | undefined) =>
  typeof value === "function" ? value() : value === true;

async function importable(specifier: string): Promise<boolean> {
  try {
    await import(specifier);
    return true;
  } catch {
    return false;
  }
}

async function vpnState(timeoutMs: number): Promise<Capabilities["vpn"]> {
  try {
    const child = Bun.spawn([process.execPath, "vpn", "status"], {
      stdin: "ignore",
      stdout: "pipe",
      stderr: "pipe",
    });
    const timer = setTimeout(() => child.kill(), timeoutMs);
    const [out, code] = await Promise.all([new Response(child.stdout).text(), child.exited]);
    clearTimeout(timer);
    return code === 0 && /connected/i.test(out) && !/disconnected/i.test(out)
      ? "connected"
      : "down";
  } catch {
    return "unavailable";
  }
}

export async function probeCapabilities(
  options: { vpnTimeoutMs?: number } = {},
): Promise<Capabilities> {
  const bun = Bun as unknown as BunGlobals;
  return {
    fetchSession: typeof bun.FetchSession === "function",
    nativeCrawl: flag(bun.Crawl?.available),
    webView: typeof bun.WebView === "function",
    vectorIndex: flag(bun.VectorIndex?.available),
    adblock: await importable("bun:adblock"),
    yolo: await importable("bun:yolo"),
    vpn: await vpnState(options.vpnTimeoutMs ?? 4000),
  };
}
