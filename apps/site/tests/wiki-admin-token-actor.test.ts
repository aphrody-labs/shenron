/**
 * Attribution des écritures de `/api/wiki-admin` dans `wiki_revisions`.
 *
 * Une requête par jeton est rattachée au compte `OWNER_ID` (ligne `users`
 * requise par les écritures user-keyed), mais la révision doit porter une
 * identité d'automatisation : sinon le journal confond un script et le
 * propriétaire. La suite traverse le vrai `getCurrentUser` et la vraie route ;
 * seuls la base, Better Auth, le CRUD wiki et le journal sont simulés.
 */
import { afterAll, beforeEach, describe, expect, mock, test } from "bun:test";
import { NextRequest } from "next/server";

const OWNER_ROW = {
  id: "user-owner",
  discordId: "owner-discord",
  username: "Propriétaire",
  avatar: null,
  roleAdmin: true,
  createdAt: new Date("2026-01-01T00:00:00Z"),
};
const ADMIN_TOKEN = "jeton-admin-de-test-0123456789";
const COOKIE_SIGNE = "cookie-signe-de-test";

let headers = new Headers();
let discordSession: { user: { id: string; name: string; image: null } } | null = null;
const revisions: Array<{ action: string; actor: unknown }> = [];

mock.module("server-only", () => ({}));
mock.module("@aphrody/shenron-auth/next", () => ({ requestHeaders: async () => headers }));
const previousHost = process.env.SHENRON_HOST_URL;
const authHost = Bun.serve({
  hostname: "127.0.0.1",
  port: 0,
  fetch: () =>
    Response.json(
      discordSession
        ? {
            sessionUserId: discordSession.user.id,
            discordId: OWNER_ROW.discordId,
            user: OWNER_ROW,
          }
        : null,
    ),
});
process.env.SHENRON_HOST_URL = `http://127.0.0.1:${authHost.port}`;
afterAll(async () => {
  await authHost.stop(true);
  if (previousHost === undefined) delete process.env.SHENRON_HOST_URL;
  else process.env.SHENRON_HOST_URL = previousHost;
});
mock.module("@/lib/env", () => ({ env: { OWNER_ID: "owner-discord", OAUTH_ALLOWED_USERS: [] } }));
mock.module("@/lib/admin-token", () => ({
  ADMIN_COOKIE: "dbfr_admin",
  adminTokenEnabled: () => true,
  verifyAdminCookie: (v: string | null | undefined) => v === COOKIE_SIGNE,
  verifyAdminTokenOrBearer: (v: string | null | undefined) => v === ADMIN_TOKEN,
}));
mock.module("@/lib/agent-keys", () => ({
  authenticateAgent: async () => ({
    keyId: "cle-42",
    name: "Relecteur",
    scopes: ["moderate"],
    rateLimitPerHour: 60,
  }),
}));
mock.module("@aphrody/shenron-db/repos/accounts", () => ({
  createDiscordAccountLookup: () => ({ discordIdForUser: async () => "owner-discord" }),
}));
mock.module("@/lib/db", () => {
  const chain = {
    from: () => chain,
    where: () => chain,
    limit: async () => [OWNER_ROW],
  };
  return { db: { select: () => chain } };
});
mock.module("@/lib/wiki-admin", () => ({
  isWikiTable: () => true,
  hasVisibility: () => true,
  getWikiRow: async (_table: string, id: string) => ({ id, name: "Cell", visible: true }),
  setWikiVisibility: async () => {},
  setAllWikiVisibility: async () => ({ updated: 0, previous: [] }),
  insertWiki: async () => ({ id: 1 }),
  updateWiki: async () => ({ id: 1 }),
  deleteWiki: async () => {},
  listWiki: async () => ({ rows: [], total: 0 }),
  listWikiByParent: async () => ({ rows: [], total: 0 }),
  listWikiOptions: async () => [],
  listWikiRelations: async () => [],
  listWikiSectionsForEntity: async () => [],
  listWikiVisibility: async () => [],
}));
mock.module("@/lib/wiki-revisions", () => ({
  recordRevision: async (input: { action: string; actor?: unknown }) => {
    revisions.push({ action: input.action, actor: input.actor ?? null });
    return "rev-1";
  },
  recordBulkVisibilityRevision: async () => {},
}));
mock.module("@/lib/wiki-revalidate", () => ({
  revalidateWikiEntity: () => {},
  revalidateSectionParent: async () => {},
}));

const { POST } = await import("../src/app/api/wiki-admin/[...path]/route");

async function masquer(init: HeadersInit): Promise<unknown> {
  headers = new Headers(init);
  const req = new NextRequest("http://test/api/wiki-admin/db_characters?as=visibility", {
    method: "POST",
    headers,
    body: JSON.stringify({ id: 9, visible: false }),
  });
  const res = await POST(req, { params: Promise.resolve({ path: ["db_characters"] }) });
  expect(res.status).toBe(200);
  expect(revisions).toHaveLength(1);
  return revisions[0]!.actor;
}

beforeEach(() => {
  revisions.length = 0;
  discordSession = null;
});

describe("auteur des révisions wiki-admin", () => {
  test("x-admin-token : identité « Jeton API (automatisation) », pas le compte OWNER_ID", async () => {
    const actor = await masquer({ "x-admin-token": ADMIN_TOKEN });
    expect(actor).toEqual({ id: "api-token", name: "Jeton API (automatisation)" });
  });

  test("Authorization: Bearer : même identité d'automatisation", async () => {
    const actor = await masquer({ authorization: `Bearer ${ADMIN_TOKEN}` });
    expect(actor).toEqual({ id: "api-token", name: "Jeton API (automatisation)" });
  });

  test("cookie signé du jeton : identité distincte du propriétaire", async () => {
    const actor = await masquer({ cookie: `dbfr_admin=${COOKIE_SIGNE}` });
    expect(actor).toEqual({ id: "admin-token-cookie", name: "Jeton admin (session navigateur)" });
  });

  test("clé d'agent : la révision nomme la clé", async () => {
    const actor = await masquer({ authorization: "Bearer dbfr_agent_cle_de_test" });
    expect(actor).toEqual({ id: "agent-key:cle-42", name: "Relecteur (clé d'agent)" });
  });

  test("session Discord du propriétaire : son compte, comme avant", async () => {
    discordSession = { user: { id: "ba-owner", name: "Propriétaire", image: null } };
    const actor = await masquer({});
    expect(actor).toEqual({ id: "user-owner", name: "Propriétaire" });
  });
});
