// SPDX-License-Identifier: Apache-2.0
/** Transport only: model, tools, Responses state and compaction belong to the native provider. */
import { timingSafeEqual } from "node:crypto";
import { AI_ENV, readAiEnv } from "@shenron/pipeline/ai/config";

import { local } from "./koharu";
import type { LocalApi } from "./local-api";

const METHODS = new Map([
  ["/v1/models", "GET"],
  ["/v1/chat/completions", "POST"],
  ["/v1/responses", "POST"],
  ["/v1/responses/compact", "POST"],
]);

function error(message: string, status: number, type: string): Response {
  return Response.json(
    { error: { message, type, param: null, code: null } },
    { status, headers: { "cache-control": "no-store" } },
  );
}

function bearerMatches(request: Request, token: string | undefined): boolean {
  if (!token) return false;
  const supplied = request.headers.get("authorization");
  if (!supplied?.startsWith("Bearer ")) return false;
  const actual = Buffer.from(supplied.slice(7));
  const expected = Buffer.from(token);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

/** Remove connection-specific headers, including extensions named by Connection. */
function transportHeaders(source: Headers): Headers {
  const headers = new Headers(source);
  for (const name of (headers.get("connection") ?? "").split(",")) {
    if (name.trim()) headers.delete(name.trim());
  }
  for (const name of [
    "connection",
    "keep-alive",
    "transfer-encoding",
    "upgrade",
    "proxy-connection",
    "proxy-authenticate",
    "proxy-authorization",
    "te",
    "trailer",
  ])
    headers.delete(name);
  return headers;
}

/**
 * The explicitly selected OpenAI provider, or the existing Aphrody local provider.
 * A remote caller must present the Shenron gateway token; that token never reaches the model.
 * A backend without Responses/compact keeps its real error response, rather than a fake summary.
 */
export function openAiApi(
  env: Readonly<Record<string, string | undefined>>,
  managedUrl: () => string | undefined = () => undefined,
  http: typeof fetch = fetch,
): LocalApi {
  return async (request, url, _ready, peer = null) => {
    const method = METHODS.get(url.pathname);
    if (!method) return null;
    if (!local(request, url, peer) && !bearerMatches(request, env.SHENRON_OPENAI_TOKEN))
      return error("OpenAI gateway access denied", 403, "authentication_error");
    if (request.method !== method) {
      const response = error(`${method} required`, 405, "invalid_request_error");
      response.headers.set("allow", method);
      return response;
    }
    if (
      method === "POST" &&
      request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase() !==
        "application/json"
    )
      return error("application/json required", 415, "invalid_request_error");

    const configured =
      env.SHENRON_OPENAI_BASE_URL?.trim() ||
      env.APHRODY_AI_CHAT_BASE_URL?.trim() ||
      env.APHRODY_SHENRON_LLM_BASE_URL?.trim() ||
      env.APHRODY_LOCAL_MODEL_URL?.trim() ||
      managedUrl();
    if (!configured) return error("OpenAI provider is not configured", 503, "server_error");
    let target: URL;
    try {
      const base = new URL(configured);
      if (
        !["http:", "https:"].includes(base.protocol) ||
        base.username ||
        base.password ||
        base.search ||
        base.hash
      )
        return error("Invalid OpenAI provider configuration", 503, "server_error");
      // Provider URLs include /v1; Aphrody's managed router advertises its origin.
      const path = base.pathname.replace(/\/+$/, "");
      base.pathname = `${path.endsWith("/v1") ? path : `${path}/v1`}${url.pathname.slice(3)}`;
      base.search = url.search;
      target = base;
      if (target.origin === url.origin)
        return error("OpenAI provider points to this gateway", 503, "server_error");
    } catch {
      return error("Invalid OpenAI provider configuration", 503, "server_error");
    }

    const headers = new Headers();
    for (const name of [
      "accept",
      "content-type",
      "openai-beta",
      "openai-organization",
      "openai-project",
      "x-request-id",
    ]) {
      const value = request.headers.get(name);
      if (value) headers.set(name, value);
    }
    const key = readAiEnv(env, AI_ENV.chatApiKey)?.value;
    if (key) headers.set("authorization", `Bearer ${key}`);
    try {
      const upstream = await http(target, {
        method,
        headers,
        ...(method === "POST" ? { body: request.body } : {}),
        signal: request.signal,
        redirect: "manual",
        decompress: false,
      });
      const responseHeaders = transportHeaders(upstream.headers);
      responseHeaders.delete("set-cookie");
      responseHeaders.set("cache-control", "no-store");
      return new Response(upstream.body, {
        status: upstream.status,
        statusText: upstream.statusText,
        headers: responseHeaders,
      });
    } catch {
      if (request.signal.aborted) return new Response(null, { status: 499 });
      // Never expose provider URLs, credentials or native fetch errors to a remote client.
      return error("OpenAI provider unavailable", 502, "server_error");
    }
  };
}
