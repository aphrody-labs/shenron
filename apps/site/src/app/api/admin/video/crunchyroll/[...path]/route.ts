// SPDX-License-Identifier: Apache-2.0
import { env } from "@/lib/env";
import { sessionAuth, hostAuthUrl } from "@/lib/host-auth";
import { isCurrentUserAdmin } from "@/lib/session";
import { createCrunchyrollAdminBridge } from "@/lib/crunchyroll-admin";
import {
  linkedCrunchyrollAccessToken,
  connectCrunchyrollAccount,
} from "@/lib/crunchyroll-oauth-host";

export const dynamic = "force-dynamic";
const bridge = createCrunchyrollAdminBridge({
  authorize: async (request) =>
    Boolean(await sessionAuth.api.getSession({ headers: request.headers })) &&
    (await isCurrentUserAdmin()),
  linkedAccessToken: async (request) => {
    const host = hostAuthUrl();
    return host ? linkedCrunchyrollAccessToken(request, host) : null;
  },
  configuration: () => ({
    accessToken: env.BUN_VIDEO_CRUNCHYROLL_ACCESS_TOKEN,
    basicAuthorization: env.BUN_VIDEO_CRUNCHYROLL_BASIC_AUTHORIZATION,
    accountId: env.BUN_VIDEO_CRUNCHYROLL_ACCOUNT_ID,
    email: env.CRUNCHYROLL_EMAIL,
    password: env.CRUNCHYROLL_PASSWORD,
  }),
});
export async function GET(request: Request, context: { params: Promise<{ path: string[] }> }) {
  return bridge(request, (await context.params).path);
}
export async function POST(request: Request, context: { params: Promise<{ path: string[] }> }) {
  const reply = (body: unknown, status: number) =>
    Response.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
  if (
    !(await sessionAuth.api.getSession({ headers: request.headers })) ||
    !(await isCurrentUserAdmin())
  )
    return reply({ error: "authentication_required" }, 401);
  if ((await context.params).path.join("/") !== "connect")
    return reply({ error: "not_found" }, 404);
  const host = hostAuthUrl();
  if (!host) return reply({ error: "auth_unavailable" }, 503);
  try {
    const response = await connectCrunchyrollAccount(request, host);
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  } catch {
    return reply({ error: "provider_oauth_unavailable" }, 503);
  }
}
