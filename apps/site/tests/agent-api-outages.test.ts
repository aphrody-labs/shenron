import { beforeEach, describe, expect, mock, test } from "bun:test";

let authenticationFails = false;
let quotaFails = false;
let recordCalls = 0;
const agent = { keyId: "agent-1", name: "Test", scopes: ["read"], rateLimitPerHour: 20 };

mock.module("server-only", () => ({}));
mock.module("@aphrody/shenron-auth/agent-keys", () => ({
  decideWriteQuota: () => ({ allowed: true }),
  hasScope: (scopes: string[], scope: string) => scopes.includes(scope),
  isQuotaExemptMethod: (method: string) => method === "GET" || method === "HEAD",
}));
mock.module("@/lib/agent-keys", () => ({
  agentCallsLastHour: async () => {
    if (quotaFails) throw new Error("database unavailable");
    return 0;
  },
  authenticateAgent: async () => {
    if (authenticationFails) throw new Error("database unavailable");
    return agent;
  },
  recordAgentCall: async () => {
    recordCalls += 1;
  },
}));

const { withAgent } = await import("../src/lib/agent-api");

describe("API agents — indisponibilité des dépendances de garde", () => {
  beforeEach(() => {
    authenticationFails = false;
    quotaFails = false;
    recordCalls = 0;
  });

  test("une panne de recherche de clé donne 503 au lieu d'un 401 anonyme", async () => {
    authenticationFails = true;
    let handlerCalls = 0;
    const response = await withAgent(
      new Request("https://dragonballfr.com/api/agent/v1/wiki/entities"),
      "read",
      async () => {
        handlerCalls += 1;
        return Response.json({ ok: true });
      },
    );

    expect(response.status).toBe(503);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(response.headers.get("Retry-After")).toBe("30");
    expect(await response.json()).toMatchObject({ ok: false, error: "service_unavailable" });
    expect(handlerCalls).toBe(0);
    expect(recordCalls).toBe(0);
  });

  test("une panne du compteur de quota empêche l'écriture sans rejeter la route", async () => {
    quotaFails = true;
    let handlerCalls = 0;
    const response = await withAgent(
      new Request("https://dragonballfr.com/api/agent/v1/wiki/contributions", { method: "POST" }),
      "read",
      async () => {
        handlerCalls += 1;
        return Response.json({ ok: true });
      },
    );

    expect(response.status).toBe(503);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(response.headers.get("Retry-After")).toBe("30");
    expect(await response.json()).toMatchObject({ ok: false, error: "service_unavailable" });
    expect(handlerCalls).toBe(0);
    expect(recordCalls).toBe(0);
  });
});
