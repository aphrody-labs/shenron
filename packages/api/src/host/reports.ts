// SPDX-License-Identifier: Apache-2.0
import { z } from "zod";
import { envString, type EnvSource } from "@shenron/config/env";
import { createBunDb } from "@shenron/db/bun-sql";
import { siteReports, type SiteReportInsert } from "@shenron/db/schema";
import type { BetterAuthPort } from "../server";
import type { RateLimitPort } from "../http";
import { BodyLimitError, readLimitedJson } from "../server/read-json";

const reportBody = z.object({
  path: z
    .string()
    .max(2048)
    .refine((path) => path.startsWith("/") && !path.startsWith("//")),
  pageTitle: z.string().max(256).nullable(),
  category: z.enum(["bug", "contenu", "lien", "suggestion", "autre"]),
  message: z.string().trim().min(5).max(2000),
});

export interface ReportRepository {
  insert(report: SiteReportInsert): Promise<void>;
}

export interface ReportPolicy {
  origins: readonly string[];
  rateLimit: { limit: number; windowMs: number };
}

/** Public submissions use a linked session, never local-owner or automation headers. */
export function createReportHandler(
  auth: BetterAuthPort | null,
  repository: ReportRepository | null,
  limiter: RateLimitPort,
  policy: ReportPolicy,
) {
  const headers = { "Cache-Control": "private, no-store" };
  const json = (error: string, status: number, extra: Record<string, string> = {}) =>
    Response.json({ error }, { status, headers: { ...headers, ...extra } });
  return async (request: Request): Promise<Response> => {
    if (request.method !== "POST")
      return new Response(null, { status: 405, headers: { ...headers, Allow: "POST" } });
    const origin = request.headers.get("origin");
    if (origin && !policy.origins.includes(origin)) return json("origin_forbidden", 403);
    if (!auth?.session || !repository) return json("reports_unavailable", 503);
    try {
      const session = await auth.session(request.headers);
      if (!session?.discordId) return json("sign_in_required", 401);
      const contentType = request.headers.get("content-type")?.split(";")[0]?.trim();
      if (contentType !== "application/json") return json("invalid_request", 415);
      let parsed;
      try {
        parsed = reportBody.safeParse(await readLimitedJson(request, 16_384));
      } catch (error) {
        return json("invalid_request", error instanceof BodyLimitError ? 413 : 400);
      }
      if (!parsed.success) return json("invalid_request", 400);
      const rate = await limiter.hit(`reports:${session.userId}`, policy.rateLimit);
      if (!rate.allowed)
        return json("rate_limited", 429, { "Retry-After": String(rate.retryAfterSeconds) });
      await repository.insert({
        ...parsed.data,
        userId: session.userId,
        discordId: session.discordId,
        username: session.profile?.username ?? null,
        userAgent: request.headers.get("user-agent")?.slice(0, 512) ?? null,
      });
      return Response.json({ ok: true }, { status: 201, headers });
    } catch {
      // Preserve private database/authentication details and permit a later retry.
      return json("reports_unavailable", 503);
    }
  };
}

/** The pool belongs to the Bun host; Next never opens this database connection. */
export function createHostReports(
  env: EnvSource,
  auth: BetterAuthPort | null,
  limiter: RateLimitPort,
  policy: ReportPolicy,
) {
  const url = envString(env, "DATABASE_URL");
  if (!url) return null;
  const { db, client } = createBunDb({ url, max: 2, applicationName: "shenron-reports" });
  return {
    fetch: createReportHandler(
      auth,
      {
        insert: async (report) => {
          await db.insert(siteReports).values(report);
        },
      },
      limiter,
      policy,
    ),
    close: async () => {
      await client.close();
    },
  };
}
