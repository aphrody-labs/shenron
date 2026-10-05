// SPDX-License-Identifier: Apache-2.0
/**
 * The front server of `shenron-server` with the real API host (`@shenron/api/host`) on a test
 * VFS, a fake Next upstream and no external service: routing order, WebSocket upgrade, SSE,
 * local health groups, disabled groups, production split and the MCP sidecar.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LocalHealthResponse } from "@shenron/api/contract";
import { SSE_KEEPALIVE_MS } from "@shenron/api/server";

import { type Backend, planBackend, startBackend, startMcpSidecar } from "../src/backend";
import type { ServerPaths } from "../src/config";
import { FRONT_IDLE_TIMEOUT_S, serveFront } from "../src/front";
import { localApi } from "../src/local-api";
import { testPaths, writeTestVfs } from "./support";

const root = mkdtempSync(join(tmpdir(), "shenron-front-"));
const ABSENT_APHRODY = join(root, "absent", "aphrody");

/** Fake Next upstream: echoes the path; `/stream` writes an SSE comment every 300 ms. */
const next = Bun.serve({
  port: 0,
  hostname: "127.0.0.1",
  idleTimeout: 10,
  fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === "/stream") {
      let n = 0;
      let timer: ReturnType<typeof setInterval>;
      return new Response(
        new ReadableStream<Uint8Array>({
          start(controller) {
            timer = setInterval(() => {
              controller.enqueue(new TextEncoder().encode(`: keepalive ${++n}\n\n`));
              if (n === 6) {
                clearInterval(timer);
                controller.close();
              }
            }, 300);
          },
          cancel() {
            clearInterval(timer);
          },
        }),
        { headers: { "content-type": "text/event-stream" } },
      );
    }
    return Response.json({ next: url.pathname });
  },
});

function layout(dir: string) {
  const dist = join(dir, ".next");
  const publicDir = join(dir, "public");
  mkdirSync(join(dist, "static", "chunks"), { recursive: true });
  mkdirSync(publicDir, { recursive: true });
  writeFileSync(join(dist, "static", "chunks", "app.js"), "chunk");
  writeFileSync(join(publicDir, "hello.txt"), "bonjour");
  return { dist, publicDir };
}

interface Running {
  base: string;
  paths: ServerPaths;
  backend: Backend;
  stop(): Promise<void>;
}

const running: Running[] = [];

async function start(
  name: string,
  env: Record<string, string | undefined>,
  o: { vfs?: boolean; idleTimeout?: number; mcpScript?: string } = {},
): Promise<Running> {
  const dir = join(root, name);
  const paths = testPaths(dir);
  const payloadDir = join(dir, "payload");
  if (o.vfs !== false) writeTestVfs(join(payloadDir, "vfs", "shenron-vfs.sqlite"));
  if (o.mcpScript) {
    const binary = join(paths.exeDir, "shenron-mcp");
    writeFileSync(binary, `#!${process.execPath}\n${o.mcpScript}`);
    chmodSync(binary, 0o755);
  }
  const fullEnv = { HOME: dir, APHRODY_BIN: ABSENT_APHRODY, SHENRON_CHAT_TOOLS: "0", ...env };
  const backend = await startBackend(paths, fullEnv, { payloadDir });
  const front = serveFront({
    hostname: "127.0.0.1",
    port: 0,
    layout: layout(dir),
    local: localApi(
      paths,
      () => ({ site: true, buildId: name, groups: backend.groups() }),
      fullEnv,
    ),
    host: backend.host,
    nextPort: next.port!,
    ready: () => true,
    ...(o.idleTimeout ? { idleTimeout: o.idleTimeout } : {}),
  });
  const entry: Running = {
    base: `http://127.0.0.1:${front.port}`,
    paths,
    backend,
    async stop() {
      void front.stop(true);
      await backend.stop();
    },
  };
  running.push(entry);
  return entry;
}

afterAll(async () => {
  for (const entry of running) await entry.stop();
  void next.stop(true);
  rmSync(root, { recursive: true, force: true });
});

const json = async (response: Response) => (await response.json()) as Record<string, unknown>;

describe("desktop profile: the front mounts the API host", () => {
  let app: Running;
  beforeAll(async () => {
    app = await start("desktop", {
      SHENRON_PROFILE: "desktop",
      SHENRON_CHAT_BACKENDS: "extractive",
    });
  });

  test("/api/local/health reports every group, valid against the contract", async () => {
    const response = await fetch(`${app.base}/api/local/health`);
    expect(response.status).toBe(200);
    const body = LocalHealthResponse.parse(await response.json());
    expect(body.profile).toBe("desktop");
    const available = Object.entries(body.groups)
      .filter(([, status]) => status.available)
      .map(([name]) => name)
      .toSorted();
    expect(available).toEqual(
      ["chat", "conversations", "models", "rag", "sync", "vfs", "wiki"].toSorted(),
    );
    expect(body.groups.ocr).toEqual({
      available: false,
      reason: "aphrody introuvable : OCR indisponible",
    });
    expect(body.groups.mcp).toEqual({ available: false, reason: "serveur MCP non configuré" });
    // Reasons are short French texts, never an internal path.
    expect(JSON.stringify(body.groups)).not.toContain(root);
  });

  test("/api/v1 and /api/public routes are answered from the embedded VFS", async () => {
    const info = await json(await fetch(`${app.base}/api/v1/vfs`));
    expect(info.profile).toBe("public");
    expect(info.wiki).toBe(1);
    const categories = await json(await fetch(`${app.base}/api/public/wiki/categories`));
    expect(categories.categories).toContainEqual({
      name: "characters",
      label: "Personnages",
      total: 1,
    });
    const goku = await json(await fetch(`${app.base}/api/public/wiki/characters/son-goku`));
    expect(goku.name).toBe("Son Goku");
    const rag = await json(await fetch(`${app.base}/api/public/rag/search?q=Kamehameha`));
    expect(rag.mode).toBe("lexical");
    expect((rag.results as { title: string }[])[0]?.title).toBe("Kamehameha");
    const list = await json(await fetch(`${app.base}/api/v1/vfs/list?path=/home`));
    expect(list.entries).toMatchObject([{ name: "SOUL.md", kind: "file", storage: "inline" }]);
  });

  test("the OpenAPI document of the contract", async () => {
    const response = await fetch(`${app.base}/api/public/openapi.json`);
    expect(response.status).toBe(200);
    const document = await json(response);
    expect(String(document.openapi)).toStartWith("3.1");
    expect(Object.keys(document.paths as object)).toContain("/api/v1/chat");
  });

  test("an unknown /api/v1 path is the API's JSON 404, never a Next page", async () => {
    const response = await fetch(`${app.base}/api/v1/nothing`);
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "Not found" });
  });

  test("the Next relay stays last: static files, VFS assets, then Next", async () => {
    expect(await (await fetch(`${app.base}/hello.txt`)).text()).toBe("bonjour");
    expect(await (await fetch(`${app.base}/_next/static/chunks/app.js`)).text()).toBe("chunk");
    expect(await (await fetch(`${app.base}/assets/logo.txt`)).text()).toBe("logo du VFS");
    for (const path of ["/wiki/personnages", "/bureau", "/api/health", "/api/chat"])
      expect(await json(await fetch(`${app.base}${path}`))).toEqual({ next: path });
  });

  test("the chat WebSocket upgrades on the front server and streams a stored turn", async () => {
    const events: { type: string; data: Record<string, unknown> }[] = [];
    const ws = new WebSocket(`${app.base.replace("http", "ws")}/api/v1/chat/ws`);
    await new Promise<void>((resolve, reject) => {
      ws.addEventListener("open", () => resolve());
      ws.addEventListener("error", () => reject(new Error("WebSocket upgrade failed")));
    });
    const done = new Promise<void>((resolve) => {
      ws.addEventListener("message", (message) => {
        const event = JSON.parse(String(message.data));
        events.push(event);
        if (event.type === "done" || event.type === "error") resolve();
      });
    });
    ws.send(
      JSON.stringify({
        type: "chat",
        request: { message: "Qui a créé la technique du Kamehameha ?", tools: false },
      }),
    );
    await done;
    ws.close();
    const types = events.map((event) => event.type);
    expect(types[0]).toBe("meta");
    expect(types).toContain("sources");
    expect(types.at(-1)).toBe("done");
    const finished = events.at(-1)!.data;
    expect(finished.backend).toBe("extractive");
    expect(finished.stored).toBe(true);
    // The loopback desktop owner reads its conversation back.
    const conversations = await json(await fetch(`${app.base}/api/v1/conversations`));
    expect(conversations.conversations).toHaveLength(1);
  });

  test("POST /api/v1/chat streams Server-Sent Events through the front", async () => {
    const response = await fetch(`${app.base}/api/v1/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message: "Que sait-on du Kamehameha ?", tools: false }),
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toStartWith("text/event-stream");
    const text = await response.text();
    expect(text).toContain("event: meta");
    expect(text).toContain("event: done");
  });
});

describe("SSE and the idle timeout", () => {
  test("the chat keepalive is far below the front idle timeout", () => {
    expect(SSE_KEEPALIVE_MS * 4).toBeLessThanOrEqual(FRONT_IDLE_TIMEOUT_S * 1000);
  });

  test("a stream that keeps writing outlives a shorter idle timeout", async () => {
    // 1 s idle timeout, one write every 300 ms for 1.8 s: every write counts as activity.
    const app = await start("idle", { SHENRON_PROFILE: "desktop" }, { vfs: false, idleTimeout: 1 });
    const text = await (await fetch(`${app.base}/stream`)).text();
    expect(text.match(/: keepalive \d+/g)).toHaveLength(6);
  });
});

describe("absent capabilities: groups disabled, the server keeps serving", () => {
  let app: Running;
  beforeAll(async () => {
    app = await start(
      "bare",
      { SHENRON_PROFILE: "public", SHENRON_CHAT_STORE: "off" },
      { vfs: false },
    );
  });

  test("health reports each missing capability with its reason", async () => {
    const body = LocalHealthResponse.parse(
      await (await fetch(`${app.base}/api/local/health`)).json(),
    );
    expect(body.groups).toEqual({
      wiki: { available: false, reason: "aucun VFS Shenron installé" },
      rag: { available: false, reason: "aucun VFS Shenron installé" },
      chat: {
        available: false,
        reason: "aucun modèle de chat déclaré (llama-server, aphrody-llama-daemon)",
      },
      conversations: { available: false, reason: "stockage des conversations désactivé" },
      sync: { available: false, reason: "stockage des conversations désactivé" },
      vfs: { available: false, reason: "aucun VFS Shenron installé" },
      ocr: { available: false, reason: "aphrody introuvable : OCR indisponible" },
      mcp: { available: false, reason: "serveur MCP non configuré" },
      models: {
        available: false,
        reason: "aucun modèle de chat déclaré (llama-server, aphrody-llama-daemon)",
      },
    });
  });

  test("a disabled /api/v1 group is a JSON 404; /api/public falls back to the site", async () => {
    for (const path of ["/api/v1/vfs", "/api/v1/models", "/api/v1/conversations"]) {
      const response = await fetch(`${app.base}${path}`);
      expect(response.status).toBe(404);
      expect(await response.json()).toEqual({ error: "Not found" });
    }
    expect(await json(await fetch(`${app.base}/api/public/wiki/categories`))).toEqual({
      next: "/api/public/wiki/categories",
    });
  });

  test("the chat WebSocket is refused without a chat backend", async () => {
    const ws = new WebSocket(`${app.base.replace("http", "ws")}/api/v1/chat/ws`);
    const opened = await new Promise<boolean>((resolve) => {
      ws.addEventListener("open", () => resolve(true));
      ws.addEventListener("error", () => resolve(false));
    });
    expect(opened).toBe(false);
  });
});

describe("production profile", () => {
  test("the wiki stays on the site, the VFS RAG is served, no implicit loopback owner", async () => {
    const app = await start("production", {
      SHENRON_PROFILE: "production",
      SHENRON_CHAT_BACKENDS: "extractive",
    });
    const health = LocalHealthResponse.parse(
      await (await fetch(`${app.base}/api/local/health`)).json(),
    );
    expect(health.groups.wiki).toEqual({ available: false, reason: "wiki servi par le site" });
    expect(await json(await fetch(`${app.base}/api/public/wiki/categories`))).toEqual({
      next: "/api/public/wiki/categories",
    });
    const rag = await json(await fetch(`${app.base}/api/public/rag/search?q=Kamehameha`));
    expect((rag.results as unknown[]).length).toBe(1);
    expect((await fetch(`${app.base}/api/v1/conversations`)).status).toBe(401);
  });
});

describe.skipIf(process.platform === "win32")("MCP sidecar beside the executable", () => {
  const SCRIPT = `
const args = process.argv.slice(2);
const [host, port] = args[args.indexOf("--http") + 1].split(":");
Bun.serve({
  hostname: host,
  port: Number(port),
  fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === "/health") return new Response("ok");
    return Response.json({ mcp: url.pathname, public: args.includes("--public"), host: request.headers.get("host") });
  },
});
`;

  test("started on a free loopback port and proxied at /mcp", async () => {
    const app = await start(
      "mcp",
      { SHENRON_PROFILE: "desktop" },
      { vfs: false, mcpScript: SCRIPT },
    );
    const health = LocalHealthResponse.parse(
      await (await fetch(`${app.base}/api/local/health`)).json(),
    );
    expect(health.groups.mcp).toEqual({ available: true });
    const body = await json(await fetch(`${app.base}/mcp`, { method: "POST", body: "{}" }));
    expect(body.mcp).toBe("/mcp");
    expect(body.public).toBe(true);
    expect(String(body.host)).toStartWith("127.0.0.1:");
    expect(app.backend.host?.groups.mcp.available).toBe(true);
    await app.backend.stop();
    await Bun.sleep(100);
    expect(app.backend.groups().mcp).toEqual({
      available: false,
      reason: "serveur MCP local arrêté",
    });
  });

  test("a sidecar that cannot start leaves the MCP group disabled", async () => {
    const app = await start(
      "mcp-broken",
      { SHENRON_PROFILE: "desktop" },
      { vfs: false, mcpScript: "process.exit(3);\n" },
    );
    expect(app.backend.groups().mcp).toEqual({
      available: false,
      reason: "serveur MCP local injoignable",
    });
    // Without a running MCP server, /mcp is the site's own route.
    expect(await json(await fetch(`${app.base}/mcp`))).toEqual({ next: "/mcp" });
  });

  test("an explicit SHENRON_MCP_URL wins over the shipped sidecar", () => {
    const paths = testPaths(join(root, "mcp-explicit"));
    writeFileSync(join(paths.exeDir, "shenron-mcp"), "#!/bin/false\n");
    chmodSync(join(paths.exeDir, "shenron-mcp"), 0o755);
    expect(planBackend(paths, {}).mcpSidecar).toBe(join(paths.exeDir, "shenron-mcp"));
    expect(planBackend(paths, { SHENRON_MCP_URL: "http://127.0.0.1:8790" }).mcpSidecar).toBeNull();
  });

  test("startMcpSidecar rejects a binary that exits", async () => {
    const binary = join(root, "exits");
    writeFileSync(binary, `#!${process.execPath}\nprocess.exit(2);\n`);
    chmodSync(binary, 0o755);
    await expect(startMcpSidecar(binary, { timeoutMs: 5_000 })).rejects.toThrow(
      "shenron-mcp exited with 2",
    );
  });
});
