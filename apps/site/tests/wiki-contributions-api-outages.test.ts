import { beforeEach, describe, expect, mock, test } from "bun:test";
import { NextRequest } from "next/server";

let authFails = true;
let listFails = false;
let valueReadFails = false;
let rowIsMissing = false;
let rightsFail = false;
let createCalls = 0;

mock.module("server-only", () => ({}));
mock.module("@/lib/memory-rate-limit", () => ({
  createMemoryRateLimiter: () => ({ consume: async () => ({ limited: false, retryAfter: 0 }) }),
}));
mock.module("@/lib/session", () => ({
  getCurrentUser: async () => {
    if (authFails) throw new Error("auth store unavailable");
    return { user: { id: "user-1" } };
  },
  isCurrentUserAdmin: async () => false,
}));
mock.module("@/lib/wiki-contributions", () => ({
  ContributionError: class ContributionError extends Error {
    code = "test_error";
    status = 400;
  },
  createContribution: async () => {
    createCalls++;
    return null;
  },
  listContributions: async () => {
    if (listFails) throw new Error("database unavailable");
    return { rows: [], total: 0, limit: 20, offset: 0 };
  },
  targetIsValid: () => true,
  withdrawContribution: async () => undefined,
}));
mock.module("@/lib/contribution-rights", () => ({
  canContribute: async () => {
    if (rightsFail) throw new Error("rights store unavailable");
    return false;
  },
  scopeOf: () => "wiki",
}));
mock.module("@/lib/wiki-admin", () => ({
  getWikiRow: async () => {
    if (valueReadFails) throw new Error("database unavailable");
    return rowIsMissing ? null : { name: "Son Goku" };
  },
}));
mock.module("@/lib/databook-pages", () => ({
  estCiblePlanche: () => false,
  lireTranscription: async () => null,
  numeroDePlanche: () => null,
}));
mock.module("@/lib/stats-personnage", () => ({
  estCibleStats: () => false,
  formatStats: () => "",
}));

const contributions = await import("../src/app/api/wiki/contributions/route");
const value = await import("../src/app/api/wiki/contributions/value/route");
const req = (path: string) => new NextRequest(new URL(path, "http://localhost:3000"));

describe("API des contributions : indisponibilité des dépendances", () => {
  beforeEach(() => {
    authFails = true;
    listFails = false;
    valueReadFails = false;
    rowIsMissing = false;
    rightsFail = false;
    createCalls = 0;
  });

  test("l'indisponibilité de session répond 503 et reste non cachable", async () => {
    const list = await contributions.GET(req("/api/wiki/contributions"));
    const currentValue = await value.GET(
      req("/api/wiki/contributions/value?table=db_characters&rowId=1&column=name"),
    );

    expect(list.status).toBe(503);
    expect(list.headers.get("Cache-Control")).toBe("private, no-store");
    expect(((await list.json()) as { error: string }).error).toBe("auth_unavailable");
    expect(currentValue.status).toBe(503);
    expect(currentValue.headers.get("Cache-Control")).toBe("private, no-store");
    expect(((await currentValue.json()) as { error: string }).error).toBe("auth_unavailable");
  });

  test("la panne DB de la liste est une réponse JSON 503 non cachable", async () => {
    authFails = false;
    listFails = true;
    const response = await contributions.GET(req("/api/wiki/contributions"));

    expect(response.status).toBe(503);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(((await response.json()) as { error: string }).error).toBe("list_unavailable");
  });

  test("la panne DB de lecture ne se fait pas passer pour une fiche absente", async () => {
    authFails = false;
    valueReadFails = true;
    const response = await value.GET(
      req("/api/wiki/contributions/value?table=db_characters&rowId=1&column=name"),
    );

    expect(response.status).toBe(503);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(((await response.json()) as { error: string }).error).toBe("value_unavailable");
  });

  test("une véritable fiche absente reste un 404", async () => {
    authFails = false;
    rowIsMissing = true;
    const response = await value.GET(
      req("/api/wiki/contributions/value?table=db_characters&rowId=1&column=name"),
    );

    expect(response.status).toBe(404);
    expect(((await response.json()) as { error: string }).error).toBe("not_found");
  });

  test("la panne des droits de contribution répond 503 et n'écrit rien", async () => {
    authFails = false;
    rightsFail = true;
    const response = await contributions.POST(
      new NextRequest(new URL("/api/wiki/contributions", "http://localhost:3000"), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          table: "db_characters",
          rowId: "1",
          column: "name",
          valueAfter: "Son Goku",
        }),
      }),
    );

    expect(response.status).toBe(503);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(response.headers.get("Retry-After")).toBe("30");
    expect(((await response.json()) as { error: string }).error).toBe("rights_unavailable");
    expect(createCalls).toBe(0);
  });

  test("POST et DELETE ne confondent plus panne de session et absence de connexion", async () => {
    const post = await contributions.POST(
      new NextRequest(new URL("/api/wiki/contributions", "http://localhost:3000"), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      }),
    );
    const remove = await contributions.DELETE(req("/api/wiki/contributions?id=1"));

    for (const response of [post, remove]) {
      expect(response.status).toBe(503);
      expect(response.headers.get("Cache-Control")).toBe("private, no-store");
      expect(((await response.json()) as { error: string }).error).toBe("auth_unavailable");
    }
  });
});
