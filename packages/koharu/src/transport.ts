// SPDX-License-Identifier: MIT OR Apache-2.0
/**
 * Transport of the generated protocol (`./protocol` imports `invoke` and `Channel` from here).
 *
 * - In the Shenron desktop app (Tauri) both are Tauri IPC (`@aphrody/api/core`): the engine
 *   (`koharu-library`) runs in the app process.
 * - Elsewhere, on a site served by `shenron-server`, they speak its local bridge to a
 *   `koharu-sdk` child: each command is `POST /api/local/koharu/invoke`
 *   (`{ command, args }`, session header), answered with `{ result }`, `{ error }` or the
 *   raw bytes of a byte result; channel values arrive on the server-sent events of
 *   `GET /api/local/koharu/events?session=<id>` as `{ channel, message }`, then
 *   `{ channel, end: true }`.
 *
 * Byte results (canvas packets, thumbnails, font samples) are `ArrayBuffer`s on both paths.
 * Runtime class `pure`: browser globals are reached through `globalThis` and guarded.
 */
import {
  Channel as TauriChannel,
  SERIALIZE_TO_IPC_FN,
  invoke as tauriInvoke,
} from "@aphrody/api/core";

/** Base path of the local bridge of `shenron-server`. */
export const KOHARU_BRIDGE_PATH = "/api/local/koharu";
/** Header carrying the session of the bridge's event stream. */
export const KOHARU_SESSION_HEADER = "x-koharu-session";

type Listener = (message: unknown) => void;

interface BridgeEvent {
  channel?: unknown;
  message?: unknown;
  end?: unknown;
}

interface EventSourceLike {
  addEventListener(type: string, listener: (event: { data?: unknown }) => void): void;
  close(): void;
}

/** `true` inside the Tauri desktop app. */
export function isTauriHost(): boolean {
  const host = globalThis as {
    __TAURI_INTERNALS__?: unknown;
    __TAURI__?: { core?: unknown };
  };
  return Boolean(host.__TAURI_INTERNALS__ || host.__TAURI__?.core);
}

function sessionId(): string {
  const crypto = globalThis.crypto as { randomUUID?: () => string } | undefined;
  if (typeof crypto?.randomUUID === "function") return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function errorMessage(body: unknown, status: number): string {
  if (body && typeof body === "object" && "error" in body && typeof body.error === "string")
    return body.error;
  return `Koharu local engine: HTTP ${status}`;
}

/** Client of the `/api/local/koharu` bridge: one session, its event stream and channels. */
export class KoharuBridge {
  readonly session = sessionId();
  readonly #base: string;
  readonly #listeners = new Map<number, Listener>();
  #events: EventSourceLike | null = null;
  #next = 1;

  constructor(
    base = KOHARU_BRIDGE_PATH,
    readonly browserFiles = false,
  ) {
    this.#base = base.replace(/\/+$/, "");
  }

  /** Register a channel listener; its id is the one the IPC token carries. */
  register(listener: Listener): number {
    const id = this.#next++;
    this.#listeners.set(id, listener);
    this.#connect();
    return id;
  }

  /** Deliver one bridge event (`{ channel, message }` or `{ channel, end: true }`). */
  deliver(event: BridgeEvent): void {
    if (typeof event.channel !== "number") return;
    if (event.end === true) {
      this.#listeners.delete(event.channel);
      return;
    }
    this.#listeners.get(event.channel)?.(event.message);
  }

  #connect(): void {
    if (this.#events) return;
    const Source = (globalThis as { EventSource?: new (url: string) => EventSourceLike })
      .EventSource;
    if (!Source) return;
    const url = `${this.#base}/events?session=${encodeURIComponent(this.session)}`;
    const events = new Source(url);
    events.addEventListener("message", (event) => {
      if (typeof event.data !== "string") return;
      try {
        this.deliver(JSON.parse(event.data) as BridgeEvent);
      } catch {
        // A malformed event cannot interrupt the stream.
      }
    });
    this.#events = events;
  }

  async invoke<T>(command: string, args: Record<string, unknown> = {}): Promise<T> {
    this.#connect();
    if (this.browserFiles && command === "import")
      return this.#importFiles<T>(args.source === "folder");
    if (this.browserFiles && command === "export") return this.#exportFiles<T>(args.format);
    const response = await fetch(`${this.#base}/invoke`, {
      method: "POST",
      headers: { "content-type": "application/json", [KOHARU_SESSION_HEADER]: this.session },
      // Channels serialize to their IPC token (`toJSON`).
      body: JSON.stringify({ command, args }),
    });
    const type = response.headers.get("content-type") ?? "";
    if (response.ok && type.startsWith("application/octet-stream"))
      return (await response.arrayBuffer()) as T;
    const body: unknown = await response.json().catch(() => null);
    if (!response.ok || !body || typeof body !== "object" || !("result" in body))
      throw new Error(errorMessage(body, response.status));
    return body.result as T;
  }

  async #importFiles<T>(folder: boolean): Promise<T> {
    const files = await selectBrowserFiles(folder);
    if (files.length === 0) return null as T;
    const form = new FormData();
    for (const file of files) form.append("files", file, file.name);
    const response = await fetch(`${this.#base}/import`, {
      method: "POST",
      headers: { [KOHARU_SESSION_HEADER]: this.session },
      body: form,
    });
    const body: unknown = await response.json().catch(() => null);
    if (!response.ok || !body || typeof body !== "object" || !("result" in body))
      throw new Error(errorMessage(body, response.status));
    return body.result as T;
  }

  async #exportFiles<T>(format: unknown): Promise<T> {
    const response = await fetch(`${this.#base}/export`, {
      method: "POST",
      headers: { "content-type": "application/json", [KOHARU_SESSION_HEADER]: this.session },
      body: JSON.stringify({ format }),
    });
    if (!response.ok)
      throw new Error(errorMessage(await response.json().catch(() => null), response.status));
    const url = URL.createObjectURL(await response.blob());
    const link = browserDocument().createElement("a");
    link.href = url;
    link.download = format === "cbz" ? "studio.cbz" : `studio-${String(format)}.tar.gz`;
    browserDocument().body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30_000);
    return null as T;
  }

  /** Close the event stream (channels stop receiving). */
  close(): void {
    this.#events?.close();
    this.#events = null;
  }
}

let shared: KoharuBridge | null = null;

/** Selected only after the host has authenticated and qualified its real engine. */
export function configureKoharuBridge(base: string, browserFiles = false): void {
  if (!base.startsWith("/") || base.startsWith("//") || /[?#]/.test(base))
    throw new Error("Studio bridge must be same-origin");
  shared?.close();
  shared = new KoharuBridge(base, browserFiles);
}

function selectBrowserFiles(folder: boolean): Promise<File[]> {
  return new Promise((resolve) => {
    const input = browserDocument().createElement("input");
    input.type = "file";
    input.multiple = true;
    input.accept = ".png,.jpg,.jpeg,.webp,.bmp,.tif,.tiff,.gif,.pdf,.cbz,.zip";
    if (folder) input.setAttribute("webkitdirectory", "");
    input.hidden = true;
    const finish = (files: File[]) => {
      input.remove();
      resolve(files);
    };
    input.addEventListener("change", () => finish(Array.from(input.files ?? [])), { once: true });
    input.addEventListener("cancel", () => finish([]), { once: true });
    browserDocument().body.append(input);
    input.click();
  });
}

/** The bridge of this page, created on first use. */
export function koharuBridge(): KoharuBridge {
  shared ??= new KoharuBridge();
  return shared;
}

export function usesHostedStudio(): boolean {
  return shared?.browserFiles === true;
}

function browserDocument(): Document {
  const document = globalThis.document;
  if (!document) throw new Error("Studio file selection requires a browser");
  return document;
}

const handlers = new WeakMap<object, (message: unknown) => void>();

/**
 * A channel streaming values from the engine, as `Channel` of `@aphrody/api/core`: a Tauri
 * channel in the desktop app, a bridge channel elsewhere. It has no private member, so a
 * Tauri `Channel` is also accepted where the protocol expects one (inside Tauri only).
 */
export class Channel<T = unknown> {
  readonly id: number;

  constructor(onmessage?: (message: T) => void) {
    handlers.set(this, (onmessage ?? (() => {})) as (message: unknown) => void);
    const receive = (message: unknown) => handlers.get(this)?.(message);
    this.id = isTauriHost()
      ? new TauriChannel<unknown>(receive).id
      : koharuBridge().register(receive);
  }

  get onmessage(): (message: T) => void {
    return handlers.get(this) as (message: T) => void;
  }

  set onmessage(handler: (message: T) => void) {
    handlers.set(this, handler as (message: unknown) => void);
  }

  [SERIALIZE_TO_IPC_FN](): string {
    return `__CHANNEL__:${this.id}`;
  }

  toJSON(): string {
    return this[SERIALIZE_TO_IPC_FN]();
  }
}

/** Run an engine command: Tauri IPC in the desktop app, the local bridge elsewhere. */
export function invoke<T>(command: string, args: Record<string, unknown> = {}): Promise<T> {
  return isTauriHost() ? tauriInvoke<T>(command, args) : koharuBridge().invoke<T>(command, args);
}
