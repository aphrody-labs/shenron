// SPDX-License-Identifier: Apache-2.0
import { envString, type EnvSource } from "@aphrody/shenron-config/env";
import {
  DESKTOP_LINK,
  desktopCallbackUrl,
  desktopLinkPort,
  homeLanguage,
} from "@aphrody/shenron-db/agent-homes/types";
import type { BetterAuthPort } from "../server";
import { signDesktopLink, verifyDesktopLink } from "../desktop-link";
import { BodyLimitError, readLimitedJson } from "../server/read-json";

export function createDesktopLinkHandler(env: EnvSource, auth: BetterAuthPort | null) {
  const secret = envString(env, "BETTER_AUTH_SECRET") ?? envString(env, "SESSION_SECRET");
  const headers = { "Cache-Control": "private, no-store" };
  return async (request: Request): Promise<Response> => {
    if (new URL(request.url).pathname === DESKTOP_LINK.verifyPath) {
      if (request.method !== "POST")
        return new Response(null, { status: 405, headers: { ...headers, Allow: "POST" } });
      if (!secret || secret.length < 32)
        return Response.json({ error: "auth_unavailable" }, { status: 503, headers });
      let body: { code?: unknown; state?: unknown } | null;
      try {
        body = (await readLimitedJson(request, 8192)) as typeof body;
      } catch (error) {
        return Response.json(
          { error: "invalid_code" },
          { status: error instanceof BodyLimitError ? 413 : 400, headers },
        );
      }
      const code = typeof body?.code === "string" && body.code.length <= 4096 ? body.code : "";
      const state =
        typeof body?.state === "string" && DESKTOP_LINK.state.test(body.state) ? body.state : "";
      const identity = code && state ? verifyDesktopLink(secret, code, state) : null;
      return identity
        ? Response.json(identity, { headers })
        : Response.json({ error: "invalid_code" }, { status: 400, headers });
    }
    if (request.method !== "GET")
      return new Response(null, { status: 405, headers: { ...headers, Allow: "GET" } });
    const url = new URL(request.url);
    const state = url.searchParams.get("state") ?? "";
    const port = desktopLinkPort(url.searchParams.get("port"));
    if (!DESKTOP_LINK.state.test(state) || port === null)
      return Response.json({ error: "invalid_request" }, { status: 400, headers });
    if (!auth?.session || !secret || secret.length < 32)
      return Response.json({ error: "auth_unavailable" }, { status: 503, headers });
    let session;
    try {
      session = await auth.session(request.headers);
    } catch {
      return Response.json({ error: "auth_unavailable" }, { status: 503, headers });
    }
    if (!session?.discordId) {
      const back = `${DESKTOP_LINK.sitePath}?state=${state}&port=${port}`;
      return new Response(null, {
        status: 302,
        headers: { ...headers, location: `/signin?callbackURL=${encodeURIComponent(back)}` },
      });
    }
    const locale = /(?:^|;\s*)NEXT_LOCALE=([^;]+)/.exec(request.headers.get("cookie") ?? "")?.[1];
    const code = signDesktopLink(
      secret,
      {
        discordId: session.discordId,
        name: session.profile?.username ?? null,
        avatarUrl: session.profile?.avatar ?? null,
        language: homeLanguage(locale),
      },
      state,
    );
    return new Response(null, {
      status: 302,
      headers: { ...headers, location: desktopCallbackUrl(port, state, code) },
    });
  };
}
