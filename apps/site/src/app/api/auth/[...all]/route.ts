import { auth } from "@/lib/auth";
import { toNextJsHandler } from "better-auth/next-js";
import { hostAuthUrl, proxyAuthToHost } from "@/lib/host-auth";

// Next 16 canary + Better Auth : on force runtime nodejs (pas edge) car
// Better Auth utilise des Node APIs (crypto, drizzle/postgres-js).
// dynamic = "force-dynamic" évite Next de cacher les responses /api/auth/*
// (sinon Vercel pourrait servir un 200 cached → session jamais visible).
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

const local = toNextJsHandler(auth);

// `SHENRON_HOST_URL` posée : l'hôte Bun sert l'authentification (relais, cookies même origine).
export const GET = (request: Request) => {
  const host = hostAuthUrl();
  return host ? proxyAuthToHost(request, host) : local.GET(request);
};
export const POST = (request: Request) => {
  const host = hostAuthUrl();
  return host ? proxyAuthToHost(request, host) : local.POST(request);
};
