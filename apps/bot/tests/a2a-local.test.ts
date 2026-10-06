import "./setup";
import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { container } from "tsyringe";
import { A2A_URL_ENV } from "../src/api/a2a-proxy";
import { a2aAgentCard, a2aEventsStream, a2aJsonRpc, publicBotEvent } from "../src/api/server";
import { EventBusService } from "../src/services/EventBusService";

// Without APHRODY_A2A_URL the bot relays the card and JSON-RPC to the site hub and streams its
// own public events.
const hits: Array<{ method: string; path: string; auth: string | null }> = [];
let site: ReturnType<typeof Bun.serve>;
const saved = { url: Bun.env[A2A_URL_ENV], site: Bun.env.NEXT_PUBLIC_SITE_URL };

beforeAll(() => {
  site = Bun.serve({
    port: 0,
    async fetch(req) {
      const url = new URL(req.url);
      hits.push({ method: req.method, path: url.pathname, auth: req.headers.get("authorization") });
      if (req.method === "GET") return Response.json({ name: "shenron-dragonball" });
      const body = (await req.json()) as { id: number; method: string };
      return Response.json({ jsonrpc: "2.0", id: body.id, result: { method: body.method } });
    },
  });
  delete Bun.env[A2A_URL_ENV];
  Bun.env.NEXT_PUBLIC_SITE_URL = `http://127.0.0.1:${site.port}`;
});
afterAll(() => {
  site.stop(true);
  if (saved.url === undefined) delete Bun.env[A2A_URL_ENV];
  else Bun.env[A2A_URL_ENV] = saved.url;
  if (saved.site === undefined) delete Bun.env.NEXT_PUBLIC_SITE_URL;
  else Bun.env.NEXT_PUBLIC_SITE_URL = saved.site;
});

describe("bot A2A without upstream", () => {
  it("relays the card and JSON-RPC to the site hub with the caller's credentials", async () => {
    const card = await a2aAgentCard(new Request("http://localhost/.well-known/agent-card.json"));
    expect(await card.json()).toEqual({ name: "shenron-dragonball" });
    const res = await a2aJsonRpc(
      new Request("http://localhost/api/a2a/jsonrpc", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: "Bearer t-0123456789abcdef" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 4, method: "GetTask", params: { id: "x" } }),
      }),
    );
    expect(await res.json()).toEqual({ jsonrpc: "2.0", id: 4, result: { method: "GetTask" } });
    expect(hits.at(-1)).toEqual({
      method: "POST",
      path: "/api/a2a",
      auth: "Bearer t-0123456789abcdef",
    });
  });

  it("streams public bot events and hides the others", async () => {
    const controller = new AbortController();
    const res = await a2aEventsStream(
      new Request("http://localhost/api/a2a/events", { signal: controller.signal }),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/event-stream");
    const reader = res.body!.getReader();
    const bus = container.resolve(EventBusService);
    bus.emit("audit:new", { secret: true });
    bus.emit("user:level-up", { userId: "1", oldLevel: 4, newLevel: 5 });
    let text = "";
    while (!text.includes("level-up")) {
      const { value } = await reader.read();
      text += new TextDecoder().decode(value);
    }
    controller.abort();
    expect(text).toContain('"type":"ping"');
    expect(text).toContain('{"type":"level-up","data":{"level":5}');
    expect(text).not.toContain("secret");
    expect(publicBotEvent({ name: "setting:changed", payload: {}, ts: 0 })).toBeNull();
  });
});
