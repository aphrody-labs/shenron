// SPDX-License-Identifier: Apache-2.0
import { sessionAuth } from "@/lib/host-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

/** OAuth and MCP metadata are served by the same Better Auth host as token endpoints. */
export const GET = (request: Request) => sessionAuth.handler(request);
export const HEAD = (request: Request) => sessionAuth.handler(request);
export const OPTIONS = (request: Request) => sessionAuth.handler(request);
