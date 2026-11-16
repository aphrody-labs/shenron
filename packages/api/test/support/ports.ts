// SPDX-License-Identifier: Apache-2.0
/**
 * Simulated ports of the native API server for the group tests (chat, sync, VFS, OCR,
 * WebSocket): no database, engine, network or OCR binary is ever reached.
 */
import { expect } from "bun:test";
import type { ConversationStore } from "@shenron/db/conversations/types";
import {
  ErrorEnvelope,
  type ApiErrorCode,
  type ChatEvent,
  type ChatRequestParsed,
  type ModelsResponse,
  type OcrResponse,
  type VfsInfoResponse,
  type VfsStatResponse,
} from "../../src/contract";
import { createMemoryRateLimiter, createPublicCache, noopInvalidation } from "../../src/http";
import {
  buildOpenApiDocument,
  type AuthPort,
  type ChatEnginePort,
  type OcrPort,
  type ShenronApiPorts,
  type VfsPort,
} from "../../src/server";

/** Owner of the request: the `x-test-owner` header; administrator: `x-test-admin: 1`. */
export const headerAuth: AuthPort = {
  owner: async (request) => request.headers.get("x-test-owner"),
  admin: async (request) => request.headers.get("x-test-admin") === "1",
};

export const ALICE = { "x-test-owner": "alice" } as const;
export const BOB = { "x-test-owner": "bob" } as const;

export function basePorts(over: Partial<ShenronApiPorts> = {}): ShenronApiPorts {
  return {
    auth: headerAuth,
    rateLimit: createMemoryRateLimiter(),
    publicCache: createPublicCache(),
    invalidation: noopInvalidation,
    cors: { allowedOrigins: ["https://dragonballfr.com"] },
    clientIp: (request) => request.headers.get("x-real-ip") ?? "203.0.113.7",
    isDirectLoopback: (request) => request.headers.get("x-test-loopback") === "1",
    ...over,
  };
}

/** Rate limiter that records its keys and refuses once `allowed` hits are spent. */
export function countingRateLimit(allowed = Number.POSITIVE_INFINITY) {
  const keys: string[] = [];
  return {
    keys,
    port: {
      async hit(key: string) {
        keys.push(key);
        return { allowed: keys.length <= allowed, retryAfterSeconds: 60 };
      },
    },
  };
}

type Responses = Record<string, Record<string, { responses: Record<string, unknown> }>>;
const DOCUMENT = buildOpenApiDocument() as { paths: Responses };

/** An error of the contract: ErrorEnvelope body, expected code, status documented in OpenAPI. */
export async function expectApiError(
  response: Response,
  o: { path: string; method: "get" | "post"; status: number; code?: ApiErrorCode },
): Promise<ErrorEnvelope> {
  expect(response.status).toBe(o.status);
  expect(response.headers.get("content-type")).toBe("application/json; charset=utf-8");
  const body = ErrorEnvelope.parse(await response.json());
  if (o.code) expect(body.code).toBe(o.code);
  expect(Object.keys(DOCUMENT.paths[o.path]?.[o.method]?.responses ?? {})).toContain(
    String(o.status),
  );
  return body;
}

// ── Chat ────────────────────────────────────────────────────────────────────

export const MODELS: ModelsResponse = {
  order: ["extractive"],
  backends: [{ id: "extractive", available: true, model: null }],
  models: [],
  defaultModel: null,
  embedder: { available: false, model: "none" },
};

export function metaEvent(streamId: string): ChatEvent {
  return {
    type: "meta",
    data: {
      streamId,
      conversationId: "conv-0001",
      messageId: "msg-0001",
      replyId: "rep-0001",
      persona: "shenron",
      retrieval: { mode: "none", hits: 0 },
    },
  };
}

export const deltaEvent = (text: string): ChatEvent => ({ type: "delta", data: { text } });

export function doneEvent(finishReason: "stop" | "aborted" = "stop"): ChatEvent {
  return {
    type: "done",
    data: {
      replyId: "rep-0001",
      conversationId: "conv-0001",
      backend: "extractive",
      model: null,
      fallbacks: [],
      citations: [],
      usage: { promptTokens: null, completionTokens: null, ms: 1, firstTokenMs: null },
      finishReason,
      stored: false,
    },
  };
}

/** A generation driven by the test: it yields what `push` queues until `end` or `fail`. */
export interface ScriptedRun {
  input: { request: ChatRequestParsed; ownerId: string; streamId: string };
  signal: AbortSignal;
  push(...events: ChatEvent[]): void;
  end(): void;
  fail(error: Error): void;
}

const END = Symbol("end");

export function scriptedChat(models: () => Promise<ModelsResponse> = async () => MODELS) {
  const runs: ScriptedRun[] = [];
  const port: ChatEnginePort = {
    run(input, signal) {
      const queue: (ChatEvent | typeof END | Error)[] = [];
      let wake: (() => void) | null = null;
      const put = (item: ChatEvent | typeof END | Error) => {
        queue.push(item);
        wake?.();
      };
      runs.push({
        input,
        signal,
        push: (...events) => events.forEach(put),
        end: () => put(END),
        fail: (error) => put(error),
      });
      // An aborted generation ends like the engine does: no further event.
      signal.addEventListener("abort", () => put(END), { once: true });
      return (async function* () {
        while (true) {
          while (queue.length === 0) await new Promise<void>((resolve) => (wake = resolve));
          wake = null;
          const item = queue.shift()!;
          if (item === END) return;
          if (item instanceof Error) throw item;
          yield item;
        }
      })();
    },
    models,
  };
  return { port, runs };
}

/** Lets the stream registry and the generations run their pending microtasks. */
export async function settle(turns = 5): Promise<void> {
  for (let i = 0; i < turns; i++) await new Promise<void>((resolve) => queueMicrotask(resolve));
}

export interface SseFrame {
  id?: string;
  event?: string;
  data?: unknown;
  comment?: string;
}

export function parseSse(text: string): SseFrame[] {
  return text
    .split("\n\n")
    .filter((block) => block.trim() !== "")
    .map((block) => {
      const frame: SseFrame = {};
      for (const line of block.split("\n")) {
        if (line.startsWith(":")) frame.comment = line.slice(1).trim();
        else if (line.startsWith("id: ")) frame.id = line.slice(4);
        else if (line.startsWith("event: ")) frame.event = line.slice(7);
        else if (line.startsWith("data: ")) frame.data = JSON.parse(line.slice(6));
      }
      return frame;
    });
}

/** Reads an SSE body until `enough(frames)` holds; the reader stays usable. */
export async function readFrames(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  enough: (frames: SseFrame[]) => boolean,
  state: { text: string } = { text: "" },
): Promise<SseFrame[]> {
  const decoder = new TextDecoder();
  while (!enough(parseSse(state.text))) {
    const { value, done } = await reader.read();
    if (done) break;
    state.text += decoder.decode(value, { stream: true });
  }
  return parseSse(state.text);
}

// ── Conversations ───────────────────────────────────────────────────────────

const ISO = "2026-10-05T10:00:00.000Z";

export function conversationRecord(id: string) {
  return {
    id,
    surface: "site" as const,
    title: "Goku",
    persona: null,
    createdAt: ISO,
    updatedAt: ISO,
    deletedAt: null,
    memoryOptIn: false,
    ragOptIn: false,
    metadata: {},
  };
}

export function messageRecord(id: string, conversationId: string) {
  return {
    id,
    conversationId,
    role: "user" as const,
    content: "Qui est Goku ?",
    citations: [],
    model: null,
    createdAt: ISO,
    updatedAt: ISO,
    deletedAt: null,
  };
}

/** In-memory conversation store recording its calls; `fail` makes every call throw. */
export function fakeConversationStore(o: { fail?: string } = {}) {
  const calls: unknown[][] = [];
  const guard = () => {
    if (o.fail) throw new Error(o.fail);
  };
  const store: ConversationStore = {
    async push(ownerId, batch) {
      calls.push(["push", ownerId, batch]);
      guard();
      const ids = [...(batch.conversations ?? []), ...(batch.messages ?? [])].map(
        (record) => (record as { id?: string }).id ?? "?",
      );
      return { accepted: ids, duplicates: [], conflicts: [], rejected: [], cursor: "c1" };
    },
    async pull(ownerId, cursor, limit) {
      calls.push(["pull", ownerId, cursor, limit]);
      guard();
      // Same cursor doctrine as the SQLite and PostgreSQL stores (`decodeCursor`).
      if (cursor !== null && !/^c[0-9a-z]{1,13}$/.test(cursor))
        throw new Error("invalid sync cursor");
      return {
        conversations: [conversationRecord("conv-0001")],
        messages: [messageRecord("msg-0001", "conv-0001")],
        cursor: "c2",
        hasMore: false,
      };
    },
    async get(ownerId, id) {
      calls.push(["get", ownerId, id]);
      guard();
      return id === "conv-0001"
        ? {
            conversation: conversationRecord(id),
            messages: [messageRecord("msg-0001", id)],
          }
        : null;
    },
    async list(ownerId) {
      calls.push(["list", ownerId]);
      guard();
      return [conversationRecord("conv-0001")];
    },
    async optedIn() {
      return { items: [], cursor: "c0" };
    },
  };
  return { store, calls };
}

// ── VFS ─────────────────────────────────────────────────────────────────────

type Node = Omit<VfsStatResponse, "path"> & { bytes?: Uint8Array };

const encoder = new TextEncoder();

function file(text: string, visibility: "public" | "private", sha256: string | null): Node {
  const bytes = encoder.encode(text);
  return {
    kind: "file",
    size: bytes.byteLength,
    sha256,
    mime: "text/markdown",
    storage: "inline",
    sourceUrl: null,
    visibility,
    bytes,
  };
}

function dir(visibility: "public" | "private"): Node {
  return {
    kind: "dir",
    size: 0,
    sha256: null,
    mime: null,
    storage: "inline",
    sourceUrl: null,
    visibility,
  };
}

export const VFS_INFO: VfsInfoResponse = {
  profile: "public",
  schemaVersion: "1",
  generatedAt: ISO,
  files: 3,
  dirs: 3,
  bytes: { inline: 42 },
  counts: { wiki: 2 },
  rag: { docs: 1, chunks: 2, vectorsF32: 0, vectorsI8: 0, model: null, kinds: { wiki: 2 } },
  wiki: 2,
};

/** Vfs error carrying the `code` of `@shenron/db/vfs` errors. */
function vfsError(code: string, message: string): Error {
  return Object.assign(new Error(message), { code });
}

/** In-memory VFS: `/wiki/goku.md` (public), `/wiki/secret.md` and `/private/` (private). */
export function fakeVfs(o: { publicOnly?: boolean; local?: boolean; failInfo?: boolean } = {}) {
  const nodes: Record<string, Node> = {
    "/": dir("public"),
    "/wiki": dir("public"),
    "/wiki/goku.md": file("# Son Goku\n", "public", "aa11"),
    "/wiki/secret.md": file("# Secret\n", "private", "bb22"),
    "/wiki/raw.bin": file("raw", "public", null),
    "/private": dir("private"),
  };
  const calls: string[] = [];
  const node = (path: string): Node => {
    if (!path.startsWith("/")) throw vfsError("InvalidPath", `invalid VFS path ${path}`);
    const found = nodes[path.length > 1 ? path.replace(/\/$/, "") : path];
    if (!found) throw vfsError("NotFound", `no such node ${path}`);
    return found;
  };
  const port: VfsPort = {
    info() {
      calls.push("info");
      if (o.failInfo) throw new Error("SQLITE_CANTOPEN: /srv/private/shenron-vfs.sqlite");
      return VFS_INFO;
    },
    stat(path) {
      calls.push(`stat:${path}`);
      const { bytes: _bytes, ...stat } = node(path);
      return stat;
    },
    readDir(path) {
      calls.push(`readDir:${path}`);
      if (node(path).kind !== "dir") throw vfsError("NotADirectory", `${path} is a file`);
      const prefix = path.endsWith("/") ? path : `${path}/`;
      return Object.entries(nodes)
        .filter(([key]) => key !== "/" && key.startsWith(prefix))
        .filter(([key]) => !key.slice(prefix.length).includes("/"))
        .map(([key, value]) => ({
          name: key.slice(prefix.length),
          kind: value.kind,
          size: value.size,
          storage: value.storage,
        }));
    },
    async read(path) {
      calls.push(`read:${path}`);
      return node(path).bytes ?? new Uint8Array();
    },
    query(sql, params) {
      calls.push(`query:${sql}`);
      if (sql.includes("boom")) throw new Error('near "boom": syntax error');
      return [{ sql, params: params.length }];
    },
    ...(o.local
      ? {
          localFile: (path: string) => {
            calls.push(`local:${path}`);
            const bytes = nodes[path]?.bytes;
            return bytes ? new Blob([bytes as Uint8Array<ArrayBuffer>]) : null;
          },
        }
      : {}),
    ...(o.publicOnly ? { publicOnly: true } : {}),
  };
  return { port, calls };
}

// ── OCR ─────────────────────────────────────────────────────────────────────

export function fakeOcr(o: { fail?: string } = {}) {
  const calls: { bytes: Uint8Array; mediaType: string }[] = [];
  const port: OcrPort = {
    async recognize(bytes, mediaType): Promise<OcrResponse> {
      calls.push({ bytes, mediaType });
      if (o.fail) throw new Error(o.fail);
      return { engine: "ppocr-v5-mobile", text: "ドラゴンボール", regions: 1, ms: 3 };
    },
  };
  return { port, calls };
}
