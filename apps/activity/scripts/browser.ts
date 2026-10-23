// SPDX-License-Identifier: Apache-2.0
/**
 * A minimal Chrome DevTools Protocol driver over Bun's WebSocket, for the browser check of the
 * Activity (`scripts/browser-check.ts`). It launches a real, headless Chrome (rendering, layout and
 * CSP are the browser's own), so what it measures is what a Discord client's web view shows.
 * No dependency: the protocol is JSON over one socket.
 */
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const CHROME_CANDIDATES = [
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
];

export function findChrome(): string | null {
  const fromEnv = process.env.CHROME_PATH;
  if (fromEnv && Bun.file(fromEnv).size > 0) return fromEnv;
  for (const name of ["google-chrome", "chromium", "chrome"]) {
    const found = Bun.which(name);
    if (found) return found;
  }
  return CHROME_CANDIDATES.find((path) => Bun.file(path).size > 0) ?? null;
}

type Params = Record<string, unknown>;
type Pending = { resolve: (value: Params) => void; reject: (error: Error) => void };

class Connection {
  readonly #socket: WebSocket;
  readonly #pending = new Map<number, Pending>();
  readonly #listeners = new Set<(method: string, params: Params, sessionId?: string) => void>();
  #next = 1;

  private constructor(socket: WebSocket) {
    this.#socket = socket;
    socket.addEventListener("message", (event) => {
      const message = JSON.parse(String(event.data)) as {
        id?: number;
        method?: string;
        params?: Params;
        result?: Params;
        error?: { message: string };
        sessionId?: string;
      };
      if (message.id !== undefined) {
        const pending = this.#pending.get(message.id);
        this.#pending.delete(message.id);
        if (message.error) pending?.reject(new Error(message.error.message));
        else pending?.resolve(message.result ?? {});
      } else if (message.method) {
        for (const listener of this.#listeners)
          listener(message.method, message.params ?? {}, message.sessionId);
      }
    });
  }

  static async open(url: string): Promise<Connection> {
    const socket = new WebSocket(url);
    await new Promise<void>((resolve, reject) => {
      socket.addEventListener("open", () => resolve());
      socket.addEventListener("error", () => reject(new Error("cannot reach the browser")));
    });
    return new Connection(socket);
  }

  send(method: string, params: Params = {}, sessionId?: string): Promise<Params> {
    const id = this.#next++;
    return new Promise((resolve, reject) => {
      this.#pending.set(id, { resolve, reject });
      this.#socket.send(
        JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }),
      );
    });
  }

  on(listener: (method: string, params: Params, sessionId?: string) => void): void {
    this.#listeners.add(listener);
  }

  close(): void {
    this.#socket.close();
  }
}

export interface Viewport {
  readonly width: number;
  readonly height: number;
  /** Phone emulation (touch, mobile viewport meta handling). */
  readonly mobile?: boolean;
}

export class BrowserPage {
  /** Console errors, uncaught exceptions and browser-side violations (CSP, failed loads). */
  readonly problems: string[] = [];
  readonly #connection: Connection;
  readonly #sessionId: string;
  readonly #targetId: string;

  constructor(connection: Connection, sessionId: string, targetId: string) {
    this.#connection = connection;
    this.#sessionId = sessionId;
    this.#targetId = targetId;
    connection.on((method, params, session) => {
      if (session !== sessionId) return;
      if (method === "Runtime.exceptionThrown") {
        const details = params.exceptionDetails as {
          text?: string;
          exception?: { description?: string };
        };
        this.problems.push(`exception: ${details.exception?.description ?? details.text}`);
      } else if (method === "Runtime.consoleAPICalled" && params.type === "error") {
        const args = (params.args as Array<{ value?: unknown; description?: string }>) ?? [];
        this.problems.push(`console.error: ${args.map((a) => a.value ?? a.description).join(" ")}`);
      } else if (method === "Log.entryAdded") {
        const entry = params.entry as { level: string; text: string; url?: string };
        if (entry.level === "error" && !/favicon/.test(entry.url ?? ""))
          this.problems.push(`log: ${entry.text} ${entry.url ?? ""}`);
      }
    });
  }

  #cdp(method: string, params: Params = {}): Promise<Params> {
    return this.#connection.send(method, params, this.#sessionId);
  }

  async init(): Promise<void> {
    await Promise.all([
      this.#cdp("Page.enable"),
      this.#cdp("Runtime.enable"),
      this.#cdp("Log.enable"),
    ]);
  }

  async viewport(view: Viewport): Promise<void> {
    await this.#cdp("Emulation.setDeviceMetricsOverride", {
      width: view.width,
      height: view.height,
      deviceScaleFactor: 1,
      mobile: view.mobile ?? false,
    });
    if (view.mobile) await this.#cdp("Emulation.setTouchEmulationEnabled", { enabled: true });
  }

  async reducedMotion(reduce: boolean): Promise<void> {
    await this.#cdp("Emulation.setEmulatedMedia", {
      features: [{ name: "prefers-reduced-motion", value: reduce ? "reduce" : "no-preference" }],
    });
  }

  async goto(url: string): Promise<void> {
    const loaded = new Promise<void>((resolve) => {
      this.#connection.on((method, _params, session) => {
        if (method === "Page.loadEventFired" && session === this.#sessionId) resolve();
      });
    });
    await this.#cdp("Page.navigate", { url });
    await loaded;
  }

  /** Evaluates an expression in the page and returns its JSON value. */
  async eval<T = unknown>(expression: string): Promise<T> {
    const result = (await this.#cdp("Runtime.evaluate", {
      expression,
      awaitPromise: true,
      returnByValue: true,
    })) as {
      result: { value?: T };
      exceptionDetails?: { exception?: { description?: string }; text: string };
    };
    if (result.exceptionDetails)
      throw new Error(
        result.exceptionDetails.exception?.description ?? result.exceptionDetails.text,
      );
    return result.result.value as T;
  }

  /** Polls `expression` until it is truthy. */
  async waitFor(expression: string, timeoutMs = 15_000): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      if (await this.eval<boolean>(`Boolean(${expression})`).catch(() => false)) return;
      if (Date.now() > deadline) throw new Error(`timed out waiting for: ${expression}`);
      await Bun.sleep(50);
    }
  }

  click(selector: string): Promise<void> {
    return this.eval(
      `(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el) throw new Error("no element " + ${JSON.stringify(selector)}); el.click(); })()`,
    );
  }

  async key(key: string, code = key): Promise<void> {
    const text = key.length === 1 ? key : undefined;
    await this.#cdp("Input.dispatchKeyEvent", {
      type: "keyDown",
      key,
      code,
      ...(text ? { text } : {}),
    });
    await this.#cdp("Input.dispatchKeyEvent", { type: "keyUp", key, code });
  }

  /** Screenshot of the whole document (not only the viewport) as a PNG file. */
  async screenshot(path: string): Promise<void> {
    const metrics = (await this.#cdp("Page.getLayoutMetrics")) as {
      cssContentSize: { width: number; height: number };
    };
    const { width, height } = metrics.cssContentSize;
    const shot = (await this.#cdp("Page.captureScreenshot", {
      format: "png",
      captureBeyondViewport: true,
      clip: { x: 0, y: 0, width, height: Math.min(height, 4000), scale: 1 },
    })) as { data: string };
    await Bun.write(path, Buffer.from(shot.data, "base64"));
  }

  async close(): Promise<void> {
    await this.#connection.send("Target.closeTarget", { targetId: this.#targetId }).catch(() => {});
  }
}

export class Chrome {
  readonly #process: Bun.Subprocess;
  readonly #connection: Connection;
  readonly #profile: string;

  private constructor(process: Bun.Subprocess, connection: Connection, profile: string) {
    this.#process = process;
    this.#connection = connection;
    this.#profile = profile;
  }

  static async launch(executable = findChrome()): Promise<Chrome> {
    if (!executable) throw new Error("Chrome not found: set CHROME_PATH");
    const profile = mkdtempSync(join(tmpdir(), "activity-chrome-"));
    const process = Bun.spawn(
      [
        executable,
        "--headless=new",
        "--remote-debugging-port=0",
        `--user-data-dir=${profile}`,
        "--no-first-run",
        "--no-default-browser-check",
        "--hide-scrollbars",
        "--disable-extensions",
        "--disable-background-networking",
        "about:blank",
      ],
      { stdout: "ignore", stderr: "ignore" },
    );
    const portFile = join(profile, "DevToolsActivePort");
    let endpoint: string | null = null;
    for (let i = 0; i < 200 && !endpoint; i++) {
      try {
        const [port, path] = readFileSync(portFile, "utf8").trim().split("\n");
        if (port && path) endpoint = `ws://127.0.0.1:${port}${path}`;
      } catch {
        await Bun.sleep(50);
      }
    }
    if (!endpoint) {
      process.kill();
      throw new Error("Chrome did not expose its DevTools port");
    }
    return new Chrome(process, await Connection.open(endpoint), profile);
  }

  async newPage(): Promise<BrowserPage> {
    const { targetId } = (await this.#connection.send("Target.createTarget", {
      url: "about:blank",
    })) as { targetId: string };
    const { sessionId } = (await this.#connection.send("Target.attachToTarget", {
      targetId,
      flatten: true,
    })) as { sessionId: string };
    const page = new BrowserPage(this.#connection, sessionId, targetId);
    await page.init();
    return page;
  }

  async close(): Promise<void> {
    // Ask Chrome to quit (it closes its own child processes), then make sure.
    await this.#connection.send("Browser.close").catch(() => {});
    this.#connection.close();
    await Promise.race([this.#process.exited, Bun.sleep(5_000)]);
    this.#process.kill();
    await this.#process.exited;
    try {
      rmSync(this.#profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
    } catch {
      // A profile left in the temporary directory is harmless; the OS cleans it up.
    }
  }
}
