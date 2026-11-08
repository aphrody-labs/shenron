/** Favorites storage and reader identity belong exclusively to the Bun host. */
import { resolveHostUrl } from "@aphrody/shenron-config/public-urls";
import { endpoints } from "@aphrody/shenron-api/contract";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function forward(request: Request, method: "GET" | "POST") {
  const host = resolveHostUrl(process.env);
  const responseHeaders = {
    "cache-control": "private, no-store",
    "content-type": "application/json",
  };
  if (!host)
    return Response.json(
      { error: "Favorites host unavailable" },
      { status: 503, headers: responseHeaders },
    );
  const headers = new Headers();
  for (const name of ["cookie", "authorization", "user-agent", "origin", "content-type"]) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  try {
    const init: RequestInit & { duplex: "half" } = {
      method,
      headers,
      body: method === "POST" ? request.body : undefined,
      duplex: "half",
      cache: "no-store",
      signal: AbortSignal.timeout(12_000),
    };
    const upstream = await fetch(new URL(endpoints.favorites.path, host), init);
    if (!upstream.headers.get("content-type")?.includes("application/json")) {
      await upstream.body?.cancel();
      return Response.json(
        { error: "Invalid favorites service response" },
        { status: 502, headers: responseHeaders },
      );
    }
    return new Response(upstream.body, { status: upstream.status, headers: responseHeaders });
  } catch {
    return Response.json(
      { error: "Favorites service unavailable" },
      { status: 502, headers: responseHeaders },
    );
  }
}

export const GET = (request: Request) => forward(request, "GET");
export const PUT = (request: Request) => forward(request, "POST");
