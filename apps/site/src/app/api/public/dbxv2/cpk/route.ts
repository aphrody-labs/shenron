// SPDX-License-Identifier: Apache-2.0
import { relayPublicCpk } from "./_relay";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function handle(request: Request): Promise<Response> {
  return relayPublicCpk(request, []);
}

export { handle as GET, handle as HEAD };
