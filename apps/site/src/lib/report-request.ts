// SPDX-License-Identifier: Apache-2.0

/** Bound an interactive report submission and preserve its caller's cancellation. */
export function sendReport(
  payload: { path: string; pageTitle: string | null; category: string; message: string },
  signal: AbortSignal,
  options: { url?: string; timeoutMs?: number } = {},
): Promise<Response> {
  return fetch(options.url ?? "/api/reports", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify(payload),
    signal: AbortSignal.any([signal, AbortSignal.timeout(options.timeoutMs ?? 10_000)]),
  });
}
