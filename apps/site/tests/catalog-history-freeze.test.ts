// SPDX-License-Identifier: Apache-2.0
import { beforeEach, describe, expect, mock, test } from "bun:test";
import { NextRequest } from "next/server";
import { DatabooksFrozenError } from "@aphrody/shenron-db/guards";

let admin = true;
let revertError: Error | null = null;
let revertCalls = 0;
let revalidations = 0;
let rowReads = 0;
mock.module("@/lib/session", () => ({
  isCurrentUserAdmin: async () => admin,
  getCurrentUser: async () => null,
}));
mock.module("@/lib/databooks-freeze", () => ({ DatabooksFrozenError }));
mock.module("@/lib/wiki-admin", () => ({
  getWikiRow: async () => {
    rowReads += 1;
    return { id: 1 };
  },
}));
mock.module("@/lib/wiki-revisions", () => ({
  listRevisions: async () => ({ rows: [], total: 0 }),
  revertRevision: async () => {
    revertCalls += 1;
    if (revertError) throw revertError;
    return { table: "db_databooks", rowId: "1", mode: "restore", row: { id: 1 } };
  },
}));
mock.module("@/lib/wiki-revalidate", () => ({
  revalidateWikiEntity: () => {
    revalidations += 1;
  },
}));
const { POST } = await import("../src/app/api/wiki-history/route");

function revert() {
  return POST(
    new NextRequest("https://example.test/api/wiki-history", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: "revision-1" }),
    }),
  );
}

beforeEach(() => {
  admin = true;
  revertError = null;
  revertCalls = 0;
  revalidations = 0;
  rowReads = 0;
});

describe("history revert freeze", () => {
  test("frozen text restoration returns 423 without cache revalidation", async () => {
    revertError = new DatabooksFrozenError({ frozen: true, reason: "test-freeze", path: null });
    const response = await revert();
    expect(response.status).toBe(423);
    expect(await response.json()).toEqual({ error: "DATABOOKS_FROZEN", reason: "test-freeze" });
    expect(revertCalls).toBe(1);
    expect(revalidations).toBe(0);
    expect(rowReads).toBe(0);
  });
  test("database failures retain the generic 500 response", async () => {
    revertError = Object.assign(new Error("database internals"), { code: "23505" });
    const response = await revert();
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "Écriture refusée par la base." });
    expect(revalidations).toBe(0);
    expect(rowReads).toBe(0);
  });
  test("an unauthenticated revert is rejected before the writer", async () => {
    admin = false;
    expect((await revert()).status).toBe(403);
    expect(revertCalls).toBe(0);
    expect(revalidations).toBe(0);
  });
  test("a successful revert still revalidates its entity", async () => {
    expect((await revert()).status).toBe(200);
    expect(revalidations).toBe(1);
  });
});
