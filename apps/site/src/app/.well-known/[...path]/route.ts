// SPDX-License-Identifier: Apache-2.0
import { isBetterAuthPath } from "@aphrody/shenron-api/server";
import { sessionAuth } from "@/lib/host-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

/**
 * OAuth and MCP metadata are served by the same Better Auth host as token endpoints. Only
 * the aliases that host declares are relayed: any other `/.well-known/*` path is unknown
 * here and answers 404 instead of an authentication outage.
 */
const relay = (request: Request) =>
  isBetterAuthPath(new URL(request.url).pathname)
    ? sessionAuth.handler(request)
    : new Response(null, { status: 404 });

export const GET = relay;
export const HEAD = relay;
export const OPTIONS = relay;
