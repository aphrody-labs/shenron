// SPDX-License-Identifier: Apache-2.0
import { relayPublicCpk } from "../_relay";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ path: string[] }> };

async function handle(request: Request, context: Context): Promise<Response> {
  const { path } = await context.params;
  return relayPublicCpk(request, path);
}

export { handle as GET, handle as HEAD };
