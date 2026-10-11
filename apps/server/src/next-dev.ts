// SPDX-License-Identifier: Apache-2.0
import type { ServerWebSocket, WebSocketHandler } from "bun";
import type { ChatSocketData } from "@aphrody/shenron-api/server";

const CONNECT_TIMEOUT_MS = 5000;
const BUFFER_LIMIT = 16 * 1024 * 1024;
// Bun's native options overload is hidden when a consumer supplies DOM ambient types.
const NativeWebSocket = WebSocket as typeof WebSocket & {
  new (url: string, options: Bun.WebSocketOptions): WebSocket;
};

export interface NextDevSocketData {
  kind: "next-dev";
  upstream: WebSocket;
  downstream?: ServerWebSocket<FrontSocketData>;
  pending: (string | ArrayBuffer)[];
  pendingBytes: number;
}

export type FrontSocketData = ChatSocketData | NextDevSocketData;

function isDevSocket(
  ws: ServerWebSocket<FrontSocketData>,
): ws is ServerWebSocket<NextDevSocketData> {
  return "kind" in ws.data && ws.data.kind === "next-dev";
}

/** Open only the loopback Next server chosen by the owner of the front server. */
export async function connectNextDev(url: string, headers: Headers): Promise<NextDevSocketData> {
  for (const name of [
    "sec-websocket-key",
    "sec-websocket-version",
    "sec-websocket-extensions",
    "sec-websocket-protocol",
  ])
    headers.delete(name);
  const upstream = new NativeWebSocket(url, { headers: Object.fromEntries(headers) });
  upstream.binaryType = "arraybuffer";
  const relay: NextDevSocketData = { kind: "next-dev", upstream, pending: [], pendingBytes: 0 };
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error("Next development socket timed out"));
      upstream.close();
    }, CONNECT_TIMEOUT_MS);
    upstream.addEventListener(
      "open",
      () => {
        clearTimeout(timer);
        resolve();
      },
      { once: true },
    );
    upstream.addEventListener(
      "error",
      () => {
        clearTimeout(timer);
        reject(new Error("Next development socket unavailable"));
        relay.downstream?.close(1011, "Development socket unavailable");
        upstream.close();
      },
      { once: true },
    );
    upstream.addEventListener(
      "close",
      (event) => {
        clearTimeout(timer);
        reject(new Error("Next development socket closed"));
        relay.pending.length = 0;
        relay.pendingBytes = 0;
        const code =
          event.code === 1000 || (event.code >= 3000 && event.code <= 4999) ? event.code : 1011;
        relay.downstream?.close(code, "Development socket closed");
      },
      { once: true },
    );
    upstream.addEventListener("message", (event: MessageEvent<string | ArrayBuffer>) => {
      const bytes =
        typeof event.data === "string" ? Buffer.byteLength(event.data) : event.data.byteLength;
      if (relay.downstream) {
        if (relay.downstream.getBufferedAmount() + bytes > BUFFER_LIMIT) {
          relay.downstream.close(1013, "Development socket buffer full");
          upstream.close();
        } else relay.downstream.send(event.data);
      } else if (relay.pendingBytes + bytes > BUFFER_LIMIT) {
        upstream.close();
      } else {
        relay.pending.push(event.data);
        relay.pendingBytes += bytes;
      }
    });
  });
  return relay;
}

/** Data is assigned only by the server upgrade; clients cannot select a handler. */
export function frontWebSockets(
  chat: WebSocketHandler<ChatSocketData>,
): WebSocketHandler<FrontSocketData> {
  const chatSocket = (ws: ServerWebSocket<FrontSocketData>) =>
    ws as ServerWebSocket<ChatSocketData>;
  return {
    ...chat,
    open(ws) {
      if (!isDevSocket(ws)) return chat.open?.(chatSocket(ws));
      ws.data.downstream = ws;
      if (ws.data.upstream.readyState !== WebSocket.OPEN) {
        ws.close(1011, "Development socket unavailable");
        return;
      }
      for (const frame of ws.data.pending) ws.send(frame);
      ws.data.pending.length = 0;
      ws.data.pendingBytes = 0;
    },
    message(ws, message) {
      if (!isDevSocket(ws)) return chat.message(chatSocket(ws), message);
      if (ws.data.upstream.readyState !== WebSocket.OPEN)
        return ws.close(1011, "Development socket unavailable");
      if (ws.data.upstream.bufferedAmount + Buffer.byteLength(message) > BUFFER_LIMIT) {
        ws.close(1013, "Development socket buffer full");
        ws.data.upstream.close();
      } else ws.data.upstream.send(message);
    },
    close(ws, code, reason) {
      if (!isDevSocket(ws)) return chat.close?.(chatSocket(ws), code, reason);
      ws.data.downstream = undefined;
      ws.data.pending.length = 0;
      ws.data.pendingBytes = 0;
      ws.data.upstream.close();
    },
    drain(ws) {
      if (!isDevSocket(ws)) return chat.drain?.(chatSocket(ws));
    },
    ping(ws, data) {
      if (!isDevSocket(ws)) return chat.ping?.(chatSocket(ws), data);
    },
    pong(ws, data) {
      if (!isDevSocket(ws)) return chat.pong?.(chatSocket(ws), data);
    },
  };
}
