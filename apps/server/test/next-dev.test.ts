// SPDX-License-Identifier: Apache-2.0
import { expect, test } from "bun:test";
import { serveFront, freePort } from "../src/front";

const NativeWebSocket = WebSocket as typeof WebSocket & {
  new (url: string, options: Bun.WebSocketOptions): WebSocket;
};

async function until(predicate: () => boolean) {
  const deadline = Date.now() + 2000;
  while (!predicate() && Date.now() < deadline) await Bun.sleep(5);
  expect(predicate()).toBe(true);
}

function front(nextPort: number, development = true, ready = true) {
  return serveFront({
    hostname: "127.0.0.1",
    port: 0,
    development,
    layout: { dist: "/absent", publicDir: "/absent" },
    local: async () => null,
    host: null,
    nextPort,
    ready: () => ready,
  });
}

test("native development relay preserves initial, text and binary frames, query and trusted headers", async () => {
  let received:
    | { path: string; query: string; address: string | null; origin: string | null }
    | undefined;
  let upstreamClosed = false;
  const upstream = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch(request, server) {
      const url = new URL(request.url);
      received = {
        path: url.pathname,
        query: url.search,
        address: request.headers.get("x-real-ip"),
        origin: request.headers.get("origin"),
      };
      if (server.upgrade(request)) return;
      return new Response(null, { status: 400 });
    },
    websocket: {
      open(ws) {
        ws.send("ready");
      },
      message(ws, frame) {
        ws.send(frame);
      },
      close() {
        upstreamClosed = true;
      },
    },
  });
  const port = upstream.port;
  if (!port) {
    await upstream.stop(true);
    throw new Error("Upstream TCP port unavailable");
  }
  const server = front(port);
  const socket = new NativeWebSocket(`ws://127.0.0.1:${server.port}/_next/hmr?id=qualification`, {
    headers: {
      origin: `http://127.0.0.1:${server.port}`,
      "x-real-ip": "203.0.113.1",
      "x-forwarded-for": "203.0.113.2",
    },
  });
  socket.binaryType = "arraybuffer";
  const frames: (string | ArrayBuffer)[] = [];
  socket.addEventListener("message", (event) => frames.push(event.data));
  try {
    await until(() => frames.length === 1);
    expect(frames.shift()).toBe("ready");
    expect(received).toEqual({
      path: "/_next/hmr",
      query: "?id=qualification",
      address: "127.0.0.1",
      origin: `http://127.0.0.1:${server.port}`,
    });
    socket.send("client-update");
    await until(() => frames.length === 1);
    expect(frames.shift()).toBe("client-update");
    socket.send(new Uint8Array([0, 127, 255]));
    await until(() => frames.length === 1);
    expect(Array.from(new Uint8Array(frames.shift() as ArrayBuffer))).toEqual([0, 127, 255]);
    socket.close();
    await until(() => upstreamClosed);
  } finally {
    socket.close();
    await server.stop(true);
    await upstream.stop(true);
  }
});

test("production and cross-origin requests cannot open a development relay", async () => {
  for (const development of [false, true]) {
    const server = front(freePort(), development);
    try {
      const response = await fetch(`http://127.0.0.1:${server.port}/_next/hmr`, {
        headers: {
          upgrade: "websocket",
          origin: development ? "https://untrusted.invalid" : `http://127.0.0.1:${server.port}`,
        },
      });
      expect(response.status).toBe(403);
    } finally {
      await server.stop(true);
    }
  }
});

test("starting and unavailable upstreams return retryable errors", async () => {
  for (const ready of [false, true]) {
    const server = front(freePort(), true, ready);
    try {
      const response = await fetch(`http://127.0.0.1:${server.port}/_next/hmr`, {
        headers: { upgrade: "websocket" },
      });
      expect(response.status).toBe(503);
      expect(response.headers.get("retry-after")).toBe("1");
    } finally {
      await server.stop(true);
    }
  }
});
