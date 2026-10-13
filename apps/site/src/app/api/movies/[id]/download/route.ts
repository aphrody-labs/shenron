// SPDX-License-Identifier: Apache-2.0
/** No film currently carries an explicit grant for publishing downloadable media. */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request): Promise<Response> {
  return new Response(null, { status: 404, headers: { "Cache-Control": "no-store" } });
}
