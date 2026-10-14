// SPDX-License-Identifier: Apache-2.0
import { proxyAuthToHost } from "./host-auth";

/** Read only the current session's linked account; the provider token remains server-side. */
export async function linkedCrunchyrollAccessToken(
  request: Request,
  host: string,
): Promise<string | null> {
  const relay = (path: string, body?: unknown) =>
    proxyAuthToHost(
      new Request(new URL(`/api/auth/${path}`, request.url), {
        method: body ? "POST" : "GET",
        headers: new Headers([
          ...[...request.headers].filter(([name]) =>
            ["cookie", "authorization", "user-agent"].includes(name),
          ),
          ["origin", new URL(request.url).origin],
          ["content-type", "application/json"],
        ]),
        ...(body ? { body: JSON.stringify(body) } : {}),
        signal: request.signal,
      }),
      host,
    );
  try {
    const accountsResponse = await relay("list-accounts");
    if (!accountsResponse.ok) return null;
    const accounts: unknown = await accountsResponse.json();
    if (!Array.isArray(accounts)) return null;
    const account = accounts.find(
      (entry) => entry?.providerId === "crunchyroll" && typeof entry.id === "string",
    );
    if (!account) return null;
    const response = await relay("get-access-token", { accountId: account.id });
    if (!response.ok) return null;
    const value: unknown = await response.json();
    const token = (value as { accessToken?: unknown } | null)?.accessToken;
    return typeof token === "string" &&
      token.length > 0 &&
      token.length <= 16384 &&
      !/[\r\n\0]/.test(token)
      ? token
      : null;
  } catch {
    return null;
  }
}

/** Better Auth owns the state/PKCE cookies and exchanges; callback remains on this origin. */
export async function connectCrunchyrollAccount(request: Request, host: string): Promise<Response> {
  const origin = new URL(request.url).origin;
  if (request.headers.get("origin") !== origin)
    return Response.json({ error: "invalid_origin" }, { status: 403 });
  const headers = new Headers(request.headers);
  headers.set("content-type", "application/json");
  return proxyAuthToHost(
    new Request(new URL("/api/auth/link-social", origin), {
      method: "POST",
      headers,
      body: JSON.stringify({
        provider: "crunchyroll",
        callbackURL: new URL("/admin", origin).href,
      }),
      signal: request.signal,
    }),
    host,
  );
}
