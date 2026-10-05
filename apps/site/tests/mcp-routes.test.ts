// SPDX-License-Identifier: Apache-2.0
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { GET as card } from "../src/app/api/mcp/card/route";
import { OPTIONS, POST } from "../src/app/mcp/route";

const realFetch = globalThis.fetch;
const realUpstream = process.env.SHENRON_MCP_URL;

let calls: Array<{ url: string; headers: Headers }> = [];

beforeEach(() => {
  process.env.SHENRON_MCP_URL = "http://127.0.0.1:8790";
  calls = [];
});

afterEach(() => {
  globalThis.fetch = realFetch;
  if (realUpstream === undefined) delete process.env.SHENRON_MCP_URL;
  else process.env.SHENRON_MCP_URL = realUpstream;
});

function stubFetch(respond: (url: string) => Response): void {
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, headers: new Headers(init?.headers) });
    return respond(url);
  }) as typeof fetch;
}

describe("/mcp relay", () => {
  test("forwards the bearer token and the client address upstream", async () => {
    stubFetch(() => new Response("{}", { headers: { "content-type": "application/json" } }));
    await POST(
      new Request("https://dragonballfr.com/mcp", {
        method: "POST",
        headers: {
          authorization: "Bearer secret-token-0123456789",
          "x-forwarded-for": "203.0.113.9",
          "x-real-ip": "203.0.113.9",
          "content-type": "application/json",
          cookie: "session=must-not-leak",
        },
        body: "{}",
      }),
    );
    expect(calls).toHaveLength(1);
    const sent = calls[0]!.headers;
    expect(sent.get("authorization")).toBe("Bearer secret-token-0123456789");
    expect(sent.get("x-forwarded-for")).toBe("203.0.113.9");
    expect(sent.get("x-real-ip")).toBe("203.0.113.9");
    expect(sent.get("cookie")).toBeNull();
  });

  test("exposes the bearer challenge of an upstream 401", async () => {
    stubFetch(
      () =>
        new Response('{"error":"invalid bearer token"}', {
          status: 401,
          headers: { "content-type": "application/json", "www-authenticate": "Bearer realm=x" },
        }),
    );
    const response = await POST(
      new Request("https://dragonballfr.com/mcp", { method: "POST", body: "{}" }),
    );
    expect(response.status).toBe(401);
    expect(response.headers.get("www-authenticate")).toBe("Bearer realm=x");
    expect(response.headers.get("access-control-expose-headers")).toContain("www-authenticate");
  });

  test("CORS preflight allows the authorization header", () => {
    const response = OPTIONS();
    expect(response.headers.get("access-control-allow-headers")).toContain("authorization");
  });

  test("answers 503 when no upstream is configured", async () => {
    delete process.env.SHENRON_MCP_URL;
    const response = await POST(
      new Request("https://dragonballfr.com/mcp", { method: "POST", body: "{}" }),
    );
    expect(response.status).toBe(503);
  });
});

describe("/.well-known/mcp.json", () => {
  test("describes read and write access and lists both tiers", async () => {
    stubFetch(() =>
      Response.json({
        tools: ["dragonball.rag_search"],
        elevatedTools: ["dbfr_deposit", "dragonball.databook_update"],
      }),
    );
    const body = (await (await card()).json()) as Record<string, unknown>;
    expect(body.authentication).toEqual({
      read: "none",
      write: "bearer token or allow-listed IP",
    });
    expect(body.tools).toEqual(["dragonball.rag_search"]);
    expect(body.elevatedTools).toEqual(["dbfr_deposit", "dragonball.databook_update"]);
    expect(body.elevatedToolCount).toBe(2);
    expect(String(body.description)).toContain("any Dragon Ball question");
  });

  test("is hidden when the server is not deployed", async () => {
    delete process.env.SHENRON_MCP_URL;
    expect((await card()).status).toBe(404);
  });
});
