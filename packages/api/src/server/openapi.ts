// SPDX-License-Identifier: Apache-2.0
/**
 * OpenAPI 3.1 document of the native Shenron API, generated from the endpoint catalogue with
 * zod's own JSON Schema converter (`z.toJSONSchema`): no Hono, no generator dependency.
 * Schemas carrying `.meta({ id })` become named components. Runtime class: `pure`.
 */
import { z } from "zod";
import { ENDPOINTS, type EndpointSpec } from "../contract/endpoints";
import { ErrorEnvelope } from "../contract/error";

type Json = Record<string, unknown>;

const DOCUMENT_INFO = {
  title: "Shenron API",
  version: "2.0.0",
  description:
    "Single API of Shenron (site, bot, desktop, MCP): public wiki and RAG, unified chat " +
    "(SSE, WebSocket, resumable streams), conversation sync, VFS and OCR (docs/architecture/STACK.md §3.6).",
} as const;

/** Tag of an operation: the group segment of `/api/public/<group>` and `/api/v1/<group>`, else `meta`. */
function tagOf(path: string): string {
  return /^\/api\/(?:public|v1)\/([a-z]+)(?:\/|$)/.exec(path)?.[1] ?? "meta";
}

function convert(schema: z.ZodType, io: "input" | "output", components: Json): Json {
  const out = z.toJSONSchema(schema, {
    target: "draft-2020-12",
    unrepresentable: "any",
    io,
  }) as Json;
  const defs = (out.$defs ?? {}) as Record<string, Json>;
  delete out.$defs;
  delete out.$schema;
  const rewrite = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(rewrite);
    if (value && typeof value === "object") {
      const entries = Object.entries(value as Json).map(([key, inner]) => [
        key,
        key === "$ref" && typeof inner === "string"
          ? inner.replace("#/$defs/", "#/components/schemas/")
          : rewrite(inner),
      ]);
      return Object.fromEntries(entries);
    }
    return value;
  };
  for (const [id, def] of Object.entries(defs)) components[id] ??= rewrite(def);
  return rewrite(out) as Json;
}

function parameters(spec: EndpointSpec, components: Json): Json[] {
  const out: Json[] = [];
  const add = (schema: z.ZodType | undefined, where: "path" | "query") => {
    if (!schema) return;
    const json = convert(schema, "input", components);
    const resolved =
      typeof json.$ref === "string" ? (components[json.$ref.split("/").pop()!] as Json) : json;
    const properties = (resolved?.properties ?? {}) as Record<string, Json>;
    const required = new Set((resolved?.required ?? []) as string[]);
    for (const [name, property] of Object.entries(properties)) {
      out.push({
        name,
        in: where,
        required: where === "path" || required.has(name),
        schema: property,
      });
    }
  };
  add(spec.params, "path");
  add(spec.query, "query");
  return out;
}

/** OpenAPI 3.1 document of every endpoint served natively by `@shenron/api/server`. */
export function buildOpenApiDocument(): Json {
  const components: Json = {};
  const error = { "application/json": { schema: convert(ErrorEnvelope, "output", components) } };
  const paths: Record<string, Json> = {};
  for (const spec of ENDPOINTS.filter((e) => e.native)) {
    const responses: Json = {
      400: { description: "Invalid request", content: error },
      404: { description: "Not found", content: error },
      429: { description: "Rate limited", content: error },
      500: { description: "Internal error", content: error },
      503: { description: "Data store unavailable", content: error },
    };
    if (spec.auth === "owner")
      responses[401] = { description: "Authentication required", content: error };
    if (spec.auth === "admin") responses[403] = { description: "Forbidden", content: error };
    const ok: Json = { description: spec.websocket ? "Switching protocols (WebSocket)" : "OK" };
    if (spec.binary)
      ok.content = { "application/octet-stream": { schema: { type: "string", format: "binary" } } };
    else if (!spec.websocket) {
      ok.content = { "application/json": { schema: convert(spec.response, "output", components) } };
      if (spec.stream === "sse") {
        (ok.content as Json)["text/event-stream"] = {
          schema: {
            type: "string",
            description: "SSE frames: meta, sources, tool, backend, delta, done, error",
          },
        };
      }
    }
    responses[spec.websocket ? 101 : 200] = ok;
    const operation: Json = { operationId: spec.id, tags: [tagOf(spec.path)], responses };
    const params = parameters(spec, components);
    if (params.length) operation.parameters = params;
    if (spec.body) {
      operation.requestBody = {
        required: true,
        content: { "application/json": { schema: convert(spec.body, "input", components) } },
      };
    }
    if (spec.auth !== "public") operation.security = [{ bearer: [] }];
    paths[spec.path] = { ...paths[spec.path], [spec.method]: operation };
  }
  return {
    openapi: "3.1.0",
    info: DOCUMENT_INFO,
    paths,
    components: {
      schemas: Object.fromEntries(
        Object.entries(components).toSorted(([a], [b]) => a.localeCompare(b)),
      ),
      securitySchemes: { bearer: { type: "http", scheme: "bearer" } },
    },
  };
}
