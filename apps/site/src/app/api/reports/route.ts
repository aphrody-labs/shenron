// SPDX-License-Identifier: Apache-2.0
import { hostAuthUrl } from "@/lib/host-auth";
import { proxyReportToHost, reportsUnavailable } from "@/lib/report-proxy";

export const dynamic = "force-dynamic";

/** The site relays submissions; authentication, validation and persistence belong to Bun. */
export async function POST(request: Request): Promise<Response> {
  const host = hostAuthUrl();
  if (!host) return reportsUnavailable();
  try {
    return await proxyReportToHost(request, host);
  } catch {
    return reportsUnavailable();
  }
}
