// SPDX-License-Identifier: Apache-2.0
import { beforeEach, expect, mock, test } from "bun:test";
import { NextRequest } from "next/server";

mock.module("server-only", () => ({}));
let admin = true;
let authFails = false;
let conflict = false;
let applied = false;
const calls: Record<string, unknown>[] = [];
const invalidations: string[] = [];
mock.module("@/lib/session", () => ({
  getCurrentUser: async () => {
    if (authFails) throw new Error("session unavailable");
    return { user: { id: "editor", roleAdmin: admin } };
  },
  revisionActorOf: () => ({ id: "editor", name: "Editor" }),
}));
class Conflict extends Error {
  plan = { blockers: ["stale snapshot"] };
}
mock.module("@/lib/wiki-character-consolidation", () => ({
  CharacterConsolidationConflict: Conflict,
  consolidateWikiCharacters: async (input: Record<string, unknown>) => {
    calls.push(input);
    if (conflict) throw new Conflict("character_consolidation_conflict");
    return { applied, plan: { changes: [{ table: "db_character_arcs" }] } };
  },
}));
mock.module("@/lib/wiki-revalidate", () => ({
  revalidateWikiEntity: (table: string) => invalidations.push(table),
}));
const { POST } = await import("../src/app/api/wiki-admin/characters/consolidate/route");
const send = (body: unknown) =>
  POST(
    new NextRequest("http://localhost:3000/api/wiki-admin/characters/consolidate", {
      method: "POST",
      body: JSON.stringify(body),
      headers: { "content-type": "application/json" },
    }),
  );
beforeEach(() => {
  admin = true;
  authFails = false;
  conflict = false;
  applied = false;
  calls.length = 0;
  invalidations.length = 0;
});

test("rejects non-admin callers before reading or modifying editorial rows", async () => {
  admin = false;
  expect((await send({ winnerId: 83, duplicateId: 514 })).status).toBe(403);
  expect(calls).toEqual([]);
});
test("default request simulates and uses the authenticated actor", async () => {
  const response = await send({ winnerId: 83, duplicateId: 514 });
  expect(response.status).toBe(200);
  expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  expect(calls[0]).toMatchObject({ dryRun: true, actor: { id: "editor" } });
  expect(invalidations).toEqual([]);
});
test("apply requires a reviewed complete plan hash and rejects unsupported request fields", async () => {
  for (const body of [
    { winnerId: 83, duplicateId: 514, dryRun: false },
    { winnerId: 83, duplicateId: 83 },
    { winnerId: 83, duplicateId: 514, force: true },
  ])
    expect((await send(body)).status).toBe(400);
  expect(calls).toEqual([]);
});
test("a stale or conflicting plan responds 409 without cache invalidation", async () => {
  conflict = true;
  const response = await send({
    winnerId: 83,
    duplicateId: 514,
    dryRun: false,
    expectedPlanSha256: "a".repeat(64),
  });
  expect(response.status).toBe(409);
  expect((await response.json()).plan.blockers).toEqual(["stale snapshot"]);
  expect(invalidations).toEqual([]);
});
test("successful apply invalidates affected catalogues only after commit", async () => {
  applied = true;
  expect(
    (
      await send({
        winnerId: 83,
        duplicateId: 514,
        dryRun: false,
        expectedPlanSha256: "a".repeat(64),
      })
    ).status,
  ).toBe(200);
  expect(invalidations).toContain("db_characters");
  expect(invalidations).toContain("db_character_variants");
  expect(invalidations).toContain("db_character_arcs");
});
test("an authentication outage cannot downgrade to an anonymous operation", async () => {
  authFails = true;
  expect((await send({ winnerId: 83, duplicateId: 514 })).status).toBe(503);
  expect(calls).toEqual([]);
});
