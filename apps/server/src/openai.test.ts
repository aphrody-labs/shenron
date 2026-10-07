// SPDX-License-Identifier: Apache-2.0
import { afterEach, describe, expect, test } from "bun:test";
import type { ServerPaths } from "./config";
import { localApi } from "./local-api";
import { openAiApi } from "./openai";
import { serveFront } from "./front";

const servers: { stop(closeActiveConnections?: boolean): void | Promise<void> }[] = [];
afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => server.stop(true)));
});

function provider(handler: (request: Request) => Response | Promise<Response>): string {
  const server = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: handler });
  servers.push(server);
  return `http://127.0.0.1:${server.port}`;
}

async function call(
  api: ReturnType<typeof openAiApi>,
  path: string,
  options: RequestInit = {},
  peer = "127.0.0.1",
): Promise<Response> {
  const request = new Request(`http://localhost:18080${path}`, options);
  const response = await api(request, new URL(request.url), false, peer);
  if (!response) throw new Error("route was not claimed");
  return response;
}

const post = (body: unknown): RequestInit => ({
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});

describe("native OpenAI provider transport", () => {
  test("the Bun front serves Responses over HTTP without starting Next or loading native libraries", async () => {
    const input = { model: "shenron-chat-v2", input: "龍", store: false };
    const base = provider(async (request) => {
      expect(await request.json()).toEqual(input);
      return Response.json({
        id: "resp-native",
        output: [{ type: "message", content: [{ type: "output_text", text: "龍" }] }],
      });
    });
    const server = serveFront({
      hostname: "127.0.0.1",
      port: 0,
      nextPort: 0,
      host: null,
      ready: () => false,
      layout: { dist: "/unused", publicDir: "/unused" },
      local: localApi({} as ServerPaths, () => ({ groups: {} as never }), {
        SHENRON_OPENAI_BASE_URL: base,
      }),
    });
    servers.push(server);
    const response = await fetch(`http://127.0.0.1:${server.port}/v1/responses`, post(input));
    expect(response.status).toBe(200);
    const body = (await response.json()) as { id: string };
    expect(body.id).toBe("resp-native");
  });
  test("external chat provider is served by the actual local API before the site is ready", async () => {
    const base = provider((request) => {
      expect(new URL(request.url).pathname).toBe("/v1/models");
      return Response.json({ object: "list", data: [{ id: "shenron-chat-v2" }] });
    });
    const api = localApi({} as ServerPaths, () => ({ groups: {} as never }), {
      APHRODY_AI_CHAT_BASE_URL: `${base}/v1/`,
    });
    const response = await call(api, "/v1/models");
    expect(response.status).toBe(200);
    const body = (await response.json()) as { data: { id: string }[] };
    expect(body.data[0]?.id).toBe("shenron-chat-v2");
  });

  test("Responses tools, reasoning, context management and opaque compaction remain intact", async () => {
    const body = {
      model: "shenron-chat-v2",
      input: [{ type: "compaction", encrypted_content: "opaque" }],
      tools: [{ type: "function", name: "wiki_search", parameters: {} }],
      reasoning: { effort: "high" },
      context_management: [{ type: "compaction", compact_threshold: 6000 }],
    };
    const output = { object: "response.compaction", output: body.input };
    const base = provider(async (request) => {
      expect(new URL(request.url).pathname).toBe("/v1/responses/compact");
      expect(new URL(request.url).search).toBe("?trace=one");
      expect(await request.json()).toEqual(body);
      return Response.json(output, { headers: { "x-request-id": "native-123" } });
    });
    const response = await call(
      openAiApi({ SHENRON_OPENAI_BASE_URL: base }),
      "/v1/responses/compact?trace=one",
      post(body),
    );
    expect(await response.json()).toEqual(output);
    expect(response.headers.get("x-request-id")).toBe("native-123");
  });

  test("streaming events arrive before upstream completion without reserialization", async () => {
    let release!: () => void;
    const released = new Promise<void>((resolve) => {
      release = resolve;
    });
    const encoder = new TextEncoder();
    const first =
      'event: response.output_text.delta\ndata: {"type":"response.output_text.delta","delta":"龍"}\n\n';
    const last = 'event: response.completed\ndata: {"type":"response.completed"}\n\n';
    const base = provider(
      () =>
        new Response(
          new ReadableStream({
            async start(controller) {
              controller.enqueue(encoder.encode(first));
              await released;
              controller.enqueue(encoder.encode(last));
              controller.close();
            },
          }),
          { headers: { "content-type": "text/event-stream" } },
        ),
    );
    const response = await call(
      openAiApi({ SHENRON_OPENAI_BASE_URL: `${base}/v1` }),
      "/v1/responses",
      post({ stream: true }),
    );
    const reader = response.body!.getReader();
    try {
      expect(new TextDecoder().decode((await reader.read()).value)).toBe(first);
      release();
      expect(new TextDecoder().decode((await reader.read()).value)).toBe(last);
      expect((await reader.read()).done).toBe(true);
    } finally {
      release();
      reader.releaseLock();
    }
  });

  test("remote clients require the gateway token and never forward it or cookies", async () => {
    let requests = 0;
    const base = provider((request) => {
      requests++;
      expect(request.headers.get("authorization")).toBe("Bearer provider-key");
      expect(request.headers.get("cookie")).toBeNull();
      return Response.json({ data: [] }, { headers: { "set-cookie": "private=value" } });
    });
    const api = openAiApi({
      SHENRON_OPENAI_BASE_URL: base,
      SHENRON_OPENAI_TOKEN: "gateway-key",
      SHENRON_OPENAI_API_KEY: "provider-key",
    });
    expect((await call(api, "/v1/models", {}, "203.0.113.2")).status).toBe(403);
    expect(requests).toBe(0);
    const response = await call(
      api,
      "/v1/models",
      { headers: { authorization: "Bearer gateway-key", cookie: "session=private" } },
      "203.0.113.2",
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toBeNull();
    expect(requests).toBe(1);
  });

  test("cross-origin local browser requests and forged address headers are denied", async () => {
    const api = openAiApi({ SHENRON_OPENAI_BASE_URL: "http://127.0.0.1:8799" });
    expect(
      (await call(api, "/v1/models", { headers: { origin: "https://attacker.invalid" } })).status,
    ).toBe(403);
    expect(
      (await call(api, "/v1/models", { headers: { "x-real-ip": "127.0.0.1" } }, "203.0.113.1"))
        .status,
    ).toBe(403);
  });

  test("upstream compact errors and rate limits are preserved", async () => {
    const base = provider(() =>
      Response.json(
        { error: { message: "compaction unsupported", type: "invalid_request_error" } },
        { status: 429, headers: { "retry-after": "10" } },
      ),
    );
    const response = await call(
      openAiApi({}, () => base),
      "/v1/responses/compact",
      post({}),
    );
    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("10");
    const body = (await response.json()) as { error: { message: string } };
    expect(body.error.message).toBe("compaction unsupported");
  });

  test("unconfigured, invalid and recursive providers fail without a Next fallback", async () => {
    for (const base of [
      undefined,
      "invalid",
      "file:///private",
      "https://user:private@example.com/v1",
      "http://localhost:18080/v1",
    ]) {
      const response = await call(openAiApi({ SHENRON_OPENAI_BASE_URL: base }), "/v1/models");
      expect(response.status).toBe(503);
    }
  });

  test("wrong methods and non-JSON bodies are rejected before contacting upstream", async () => {
    const api = openAiApi({});
    const response = await call(api, "/v1/models", { method: "POST" });
    expect(response.status).toBe(405);
    expect(response.headers.get("allow")).toBe("GET");
    expect((await call(api, "/v1/responses", { method: "POST", body: "{}" })).status).toBe(415);
  });

  test("client cancellation aborts the upstream request and hides provider errors", async () => {
    const controller = new AbortController();
    let seenSignal: AbortSignal | null | undefined;
    const http = Object.assign(
      async (_url: string | URL | Request, options?: RequestInit): Promise<Response> => {
        seenSignal = options?.signal;
        controller.abort();
        throw new Error("private provider credential");
      },
      { preconnect: fetch.preconnect },
    );
    const response = await call(
      openAiApi({ SHENRON_OPENAI_BASE_URL: "http://127.0.0.1:8799" }, undefined, http),
      "/v1/responses",
      { ...post({}), signal: controller.signal },
    );
    expect(seenSignal?.aborted).toBe(true);
    expect(response.status).toBe(499);
    expect(await response.text()).toBe("");
  });
});
