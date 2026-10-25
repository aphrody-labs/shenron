import { beforeEach, describe, expect, mock, test } from "bun:test";

let listOptions: Record<string, unknown> | null = null;
let result = {
  rows: [
    { id: 26, name: "Son Goku sur Namek", visible: true },
    { id: 27, name: "Son Goku Super Saiyan", visible: true },
  ],
  total: 30,
  limit: 25,
  offset: 25,
};

mock.module("@/lib/agent-api", () => ({
  agentError: (error: string, message?: string) =>
    Response.json({ ok: false, error, message }, { status: error === "bad_request" ? 400 : 500 }),
  agentOk: (data: unknown, status = 200) => Response.json({ ok: true, data }, { status }),
  readInt: (value: string | null, options: { min: number; max: number; fallback: number }) => {
    if (value == null || value.trim() === "") return options.fallback;
    const number = Number(value);
    return Number.isFinite(number)
      ? Math.min(options.max, Math.max(options.min, Math.trunc(number)))
      : options.fallback;
  },
  withAgent: async (
    _req: Request,
    _scope: string,
    handler: (context: unknown) => Promise<Response>,
  ) => handler({ agent: { keyId: "agent-1" }, setSummary: () => undefined }),
}));
mock.module("@/lib/wiki-admin", () => ({
  listWiki: async (_table: string, options: Record<string, unknown>) => {
    listOptions = options;
    return result;
  },
}));
mock.module("@/lib/wiki-contribution-contract", () => ({
  getAgentWikiContributionContract: () => [
    { table: "db_characters", primaryKey: "id", fields: [{ name: "name" }] },
  ],
}));

const { GET } = await import("../src/app/api/agent/v1/wiki/entities/route");

describe("GET /api/agent/v1/wiki/entities", () => {
  beforeEach(() => {
    listOptions = null;
    result = {
      rows: [
        { id: 26, name: "Son Goku sur Namek", visible: true },
        { id: 27, name: "Son Goku Super Saiyan", visible: true },
      ],
      total: 30,
      limit: 25,
      offset: 25,
    };
  });

  test("pagine les seules fiches visibles et conserve le total global filtré", async () => {
    const response = await GET(
      new Request(
        "https://dragonballfr.com/api/agent/v1/wiki/entities?table=db_characters&q=Goku&limit=25&offset=25",
      ),
    );
    const body = (await response.json()) as {
      data: {
        table: string;
        rows: Array<{ rowId: string; label: string }>;
        total: number;
        limit: number;
        offset: number;
        hasMore: boolean;
      };
    };

    expect(listOptions).toEqual({ limit: 25, offset: 25, q: "Goku", visibleOnly: true });
    expect(body.data).toEqual({
      table: "db_characters",
      rows: [
        { rowId: "26", label: "Son Goku sur Namek" },
        { rowId: "27", label: "Son Goku Super Saiyan" },
      ],
      total: 30,
      limit: 25,
      offset: 25,
      hasMore: true,
    });
  });

  test("rejette toujours une table absente du contrat", async () => {
    const response = await GET(
      new Request("https://dragonballfr.com/api/agent/v1/wiki/entities?table=db_users"),
    );

    expect(response.status).toBe(400);
    expect(listOptions).toBeNull();
  });

  test("applique les défauts de pagination documentés quand les paramètres manquent", async () => {
    result = { rows: [], total: 0, limit: 25, offset: 0 };
    const response = await GET(
      new Request("https://dragonballfr.com/api/agent/v1/wiki/entities?table=db_characters"),
    );
    const body = (await response.json()) as { data: { limit: number; offset: number } };

    expect(listOptions).toEqual({ limit: 25, offset: 0, q: undefined, visibleOnly: true });
    expect(body.data).toMatchObject({ limit: 25, offset: 0 });
  });
});
