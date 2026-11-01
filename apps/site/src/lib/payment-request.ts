// SPDX-License-Identifier: Apache-2.0

/** Require browser payment mutations to originate from this site's JSON client. */
export function isSameOriginPaymentRequest(request: Request): boolean {
  const origin = request.headers.get("origin");
  const contentType = request.headers.get("content-type") ?? "";
  return (
    origin === new URL(request.url).origin &&
    contentType.toLowerCase().startsWith("application/json")
  );
}
