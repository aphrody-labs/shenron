// SPDX-License-Identifier: Apache-2.0
import { sessionAuth } from "@/lib/host-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

/** Same-origin OAuth relay. Bun owns sessions, cookies and database transactions. */
export const GET = (request: Request) => sessionAuth.handler(request);
export const POST = (request: Request) => sessionAuth.handler(request);
