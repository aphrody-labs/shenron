// SPDX-License-Identifier: Apache-2.0
/**
 * Relays a request to the Bun host with the reader's credentials. Storage and reader identity
 * belong to the host; the site only forwards headers it needs and never reads a session itself.
 */
import { resolveHostUrl } from "@aphrody/shenron-config/public-urls";

const FORWARDED = ["cookie", "authorization", "user-agent", "origin", "content-type"] as const;
export const PRIVATE_JSON_HEADERS = {
  "cache-control": "private, no-store",
  "content-type": "application/json",
} as const;

export type HostResult<T> =
  | { ok: true; status: number; data: T }
  | { ok: false; status: number; error: string };

export async function callHost<T>(
  request: Request,
  path: string,
  init: { method: "GET" | "POST"; body?: BodyInit | null } = { method: "GET" },
): Promise<HostResult<T>> {
  const host = resolveHostUrl(process.env);
  if (!host) return { ok: false, status: 503, error: "Host unavailable" };
  const headers = new Headers();
  for (const name of FORWARDED) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  try {
    const upstream = await fetch(new URL(path, host), {
      method: init.method,
      headers,
      body: init.method === "POST" ? init.body : undefined,
      cache: "no-store",
      signal: AbortSignal.timeout(12_000),
    });
    if (!upstream.headers.get("content-type")?.includes("application/json")) {
      await upstream.body?.cancel();
      return { ok: false, status: 502, error: "Invalid host response" };
    }
    const data = (await upstream.json()) as T;
    if (!upstream.ok) {
      const error = (data as { error?: unknown } | null)?.error;
      return {
        ok: false,
        status: upstream.status,
        error: typeof error === "string" ? error : "Host error",
      };
    }
    return { ok: true, status: upstream.status, data };
  } catch {
    return { ok: false, status: 502, error: "Host unavailable" };
  }
}
