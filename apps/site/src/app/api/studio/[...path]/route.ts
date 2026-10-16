// SPDX-License-Identifier: Apache-2.0
import { env } from "@/lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function handle(request: Request) {
  const host = env.SHENRON_HOST_URL;
  if (!host || request.headers.has("x-shenron-studio-relay"))
    return Response.json(
      { available: false },
      { status: 503, headers: { "cache-control": "no-store" } },
    );
  const url = new URL(request.url);
  const target = new URL(url.pathname + url.search, host);
  const headers = new Headers();
  for (const name of [
    "cookie",
    "authorization",
    "origin",
    "sec-fetch-site",
    "content-type",
    "content-length",
    "x-koharu-session",
  ]) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  headers.set("x-shenron-studio-relay", "1");
  return fetch(target, {
    method: request.method,
    headers,
    body: request.method === "POST" ? request.body : undefined,
    redirect: "manual",
    signal: request.signal,
  });
}

export const GET = handle;
export const POST = handle;
