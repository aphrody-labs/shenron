#!/usr/bin/env bun
// SPDX-License-Identifier: Apache-2.0
//
// api-fixtures.ts — golden HTTP cases of the TypeScript to Rust migration (data/api/fixtures/*.json).
//
//   bun packages/api/scripts/api-fixtures.ts           # record status and body from createShenronApi
//   bun packages/api/scripts/api-fixtures.ts --check   # exit 1 when the TypeScript host drifts
//
// A case names its contract operation and a request; the recorded answer is what the Rust router
// (crates/shenron-api, tests/parity.rs, in aphrody-labs/wiki) must return. Add a case with any status/body, then record.
// `"match": "envelope"` keeps only `error` and `code` (the zod message is not part of the contract).

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Glob } from "bun";
import { createMemoryRateLimiter, createPublicCache, noopInvalidation } from "../src/http";
import { createShenronApi } from "../src/server";

export const FIXTURES_DIR = join(import.meta.dir, "..", "..", "..", "data", "api", "fixtures");

/** Response headers compared by the Rust parity test. */
const RECORDED_HEADERS = ["cache-control"] as const;

interface Case {
  name: string;
  operation: string;
  method?: string;
  path: string;
  headers?: Record<string, string>;
  status: number;
  /** Recorded response headers the Rust router must send too (cache policy). */
  responseHeaders?: Record<string, string>;
  body: unknown;
  match?: "envelope";
}

interface Fixture {
  $comment?: string;
  cases: Case[];
}

function api() {
  return createShenronApi(
    {
      wiki: {
        categories: async () => [],
        list: async () => ({ items: [], total: 0 }),
        get: async () => null,
      },
      rateLimit: createMemoryRateLimiter(),
      publicCache: createPublicCache(),
      invalidation: noopInvalidation,
      cors: { allowedOrigins: [] },
      clientIp: () => "127.0.0.1",
      isDirectLoopback: () => true,
    },
    { service: "shenron-site" },
  );
}

async function answer(host: ReturnType<typeof api>, c: Case) {
  const init: RequestInit = { method: (c.method ?? "get").toUpperCase() };
  if (c.headers) init.headers = c.headers;
  const response = await host.request(c.path, init);
  const text = await response.text();
  let body: unknown = null;
  try {
    body = JSON.parse(text);
  } catch {}
  if (c.match === "envelope" && body && typeof body === "object") {
    const { error, code } = body as { error?: unknown; code?: unknown };
    body = { error, ...(code === undefined ? {} : { code }) };
  }
  const responseHeaders: Record<string, string> = {};
  for (const name of RECORDED_HEADERS) {
    const value = response.headers.get(name);
    if (value !== null) responseHeaders[name] = value;
  }
  return { status: response.status, responseHeaders, body };
}

/** Re-record every fixture; returns the cases whose stored answer differs from the host. */
export async function record(write: boolean): Promise<string[]> {
  const host = api();
  const drift: string[] = [];
  for (const name of new Glob("*.json").scanSync(FIXTURES_DIR)) {
    const file = join(FIXTURES_DIR, name);
    const fixture = JSON.parse(readFileSync(file, "utf8")) as Fixture;
    for (const c of fixture.cases) {
      const got = await answer(host, c);
      if (
        got.status !== c.status ||
        !Bun.deepEquals(got.body, c.body, true) ||
        !Bun.deepEquals(got.responseHeaders, c.responseHeaders ?? {}, true)
      )
        drift.push(`${name} :: ${c.name} (${c.path}): ${c.status} -> ${got.status}`);
      c.status = got.status;
      c.responseHeaders = got.responseHeaders;
      c.body = got.body;
    }
    if (write) writeFileSync(file, `${JSON.stringify(fixture, null, 2)}\n`);
  }
  return drift;
}

if (import.meta.main) {
  const check = Bun.argv.includes("--check");
  const drift = await record(!check);
  if (check && drift.length) {
    console.error(
      `${drift.length} golden case(s) drift from the TypeScript host:\n${drift.join("\n")}`,
    );
    console.error("rerun: bun packages/api/scripts/api-fixtures.ts");
    process.exit(1);
  }
  console.log(
    check ? "api fixtures: up to date" : `api fixtures: recorded (${drift.length} changed)`,
  );
}
