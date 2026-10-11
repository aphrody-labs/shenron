// SPDX-License-Identifier: Apache-2.0

export const REPORT_RELAY_HEADER = "x-shenron-report-relay";

export function reportsUnavailable(): Response {
  return Response.json(
    { error: "reports_unavailable" },
    { status: 503, headers: { "Cache-Control": "private, no-store" } },
  );
}

/** Stream the request to Bun; retain caller cancellation and never follow redirects. */
export async function proxyReportToHost(
  request: Request,
  host: string,
  timeoutMs = 15_000,
): Promise<Response> {
  if (request.headers.has(REPORT_RELAY_HEADER)) return reportsUnavailable();
  const source = new URL(request.url);
  const headers = new Headers({ [REPORT_RELAY_HEADER]: "1" });
  for (const name of [
    "cookie",
    "authorization",
    "user-agent",
    "content-type",
    "origin",
    "referer",
  ]) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  headers.set("x-forwarded-host", source.host);
  headers.set("x-forwarded-proto", source.protocol.slice(0, -1));
  return fetch(new URL("/api/reports", host), {
    method: "POST",
    headers,
    body: request.body,
    redirect: "manual",
    signal: AbortSignal.any([request.signal, AbortSignal.timeout(timeoutMs)]),
  });
}
