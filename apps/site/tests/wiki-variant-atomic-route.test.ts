// SPDX-License-Identifier: Apache-2.0
import { beforeEach, describe, expect, mock, test } from "bun:test";
import { getTableName, type SQL } from "drizzle-orm";
import { PgDialect, type AnyPgTable } from "drizzle-orm/pg-core";
import { NextRequest } from "next/server";
import { wikiUpdateSnapshotHash } from "../src/lib/wiki-update-precondition";

mock.module("server-only", () => ({}));
type Row = Record<string, unknown>;
let live: Row;
let transactionRow: Row;
let journal: Row[] = [];
let pendingJournal: Row[] = [];
let active = false;
let failJournal = false;
let updatesAttempted = 0;
let outsideJournalWrites = 0;
let invalidations = 0;
let onLock: (() => void) | null = null;
const dialect = new PgDialect();
const actor = { id: "authorized-editor", name: "Authorized editor" };
function select() {
  let table = "";
  let selectedId: unknown;
  const result = Promise.resolve().then(() =>
    table === "wiki_revisions"
      ? journal.filter((row) => row.id === selectedId)
      : [structuredClone(active ? transactionRow : live)],
  );
  const builder = Object.assign(result, {
    from: (value: AnyPgTable) => {
      table = getTableName(value);
      return builder;
    },
    where: (condition: SQL) => {
      selectedId = dialect.sqlToQuery(condition).params[0];
      return builder;
    },
    limit: () => builder,
    for: () => {
      onLock?.();
      return builder;
    },
  });
  return builder;
}
const client = {
  select,
  execute: async () => [],
  update: () => ({
    set: (values: Row) => ({
      where: () => ({
        returning: async () => {
          if (!active) throw new Error("Variant update escaped its transaction");
          updatesAttempted++;
          transactionRow = { ...transactionRow, ...values };
          return [structuredClone(transactionRow)];
        },
      }),
    }),
  }),
  insert: () => ({
    values: (value: Row) => ({
      returning: async () => {
        if (failJournal)
          throw Object.assign(new Error("fixture journal failure"), { code: "XX000" });
        const row = structuredClone({
          ...value,
          id: `revision-${journal.length + pendingJournal.length + 1}`,
        });
        if (active) pendingJournal.push(row);
        else {
          outsideJournalWrites++;
          journal.push(row);
        }
        return [{ id: row.id }];
      },
    }),
  }),
};
mock.module("@/lib/db", () => ({
  db: {
    ...client,
    transaction: async (callback: (tx: typeof client) => Promise<unknown>) => {
      transactionRow = structuredClone(live);
      pendingJournal = [];
      active = true;
      try {
        const result = await callback(client);
        live = structuredClone(transactionRow);
        journal.push(...pendingJournal);
        return result;
      } finally {
        pendingJournal = [];
        active = false;
      }
    },
  },
}));
mock.module("@/lib/session", () => ({
  getCurrentUser: async () => ({ user: { id: actor.id, roleAdmin: true } }),
  isCurrentUserAdmin: async () => true,
  revisionActorOf: () => actor,
}));
mock.module("@/lib/wiki-revalidate", () => ({
  revalidateWikiEntity: () => {
    expect(active).toBe(false);
    invalidations++;
  },
  revalidateSectionParent: async () => {},
}));
mock.module("@/lib/databook-pages", () => ({
  ecrireTranscription: async () => {},
  ecrireTraduction: async () => {},
}));
const { PATCH } = await import("../src/app/api/wiki-admin/[...path]/route");
const { revertRevision } = await import("../src/lib/wiki-revisions");
const image = "./assets/wiki/generated-portraits/2235.png";
const measurements = {
  methode: "ocr-manga",
  tomes: [22],
  planches: 4,
  graphies: ["tenshinhan"],
  mesureAt: 1787661211645,
};
const artwork = {
  kind: "generated",
  image,
  referenceUrl: "https://dragonballfr.com/wiki/manga/1441?page=65",
  referenceImageUrl: "https://cdn.dragonballfr.com/assets/manga/DB/regular/vol22/065.webp",
  referenceTitle: "Dragon Ball, chapter 261",
  referenceSha256: "a".repeat(64),
  outputSha256: "b".repeat(64),
  generatedAt: "2026-10-25T13:00:00Z",
  generator: "image_gen",
};
const request = (body: Row) =>
  PATCH(
    new NextRequest("http://localhost:3000/api/wiki-admin/db_character_variants/2235", {
      method: "PATCH",
      body: JSON.stringify(body),
      headers: { "content-type": "application/json" },
    }),
    { params: Promise.resolve({ path: ["db_character_variants", "2235"] }) },
  );
const publication = () => ({
  image,
  evidence: { ...measurements, imageArtwork: artwork },
  summary: "Reviewed publication",
  expected: structuredClone(live),
  expectedSha256: wikiUpdateSnapshotHash(live),
});
beforeEach(() => {
  live = {
    id: 2235,
    characterId: 12,
    sagaId: 9,
    slug: "tenshinhan-namek",
    label: "Namek",
    image: null,
    evidence: structuredClone(measurements),
    summary: "Before",
    visible: true,
  };
  journal = [];
  pendingJournal = [];
  active = false;
  failJournal = false;
  updatesAttempted = 0;
  outsideJournalWrites = 0;
  invalidations = 0;
  onLock = null;
});

describe("real variant PATCH route with atomic owner journaling", () => {
  test("commits image, evidence and exactly one actor-attributed revision together", async () => {
    const response = await request(publication());
    expect(response.status).toBe(200);
    expect(journal).toHaveLength(1);
    expect(journal[0]).toMatchObject({
      tableName: "db_character_variants",
      rowId: "2235",
      action: "update",
      editorId: actor.id,
      editorName: actor.name,
      before: { image: null, summary: "Before", evidence: measurements },
      after: {
        image,
        summary: "Reviewed publication",
        evidence: { ...measurements, imageArtwork: artwork },
      },
    });
    expect(outsideJournalWrites).toBe(0);
    expect(invalidations).toBe(1);
  });
  test("a journal failure rolls back image, evidence and text before responding", async () => {
    const before = structuredClone(live);
    failJournal = true;
    const response = await request(publication());
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ error: "wiki_admin_unavailable" });
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(updatesAttempted).toBe(1);
    expect(live).toEqual(before);
    expect(journal).toEqual([]);
    expect(invalidations).toBe(0);
  });
  test("legacy PATCH snapshots the actual locked before row rather than an earlier route read", async () => {
    onLock = () => {
      transactionRow = {
        ...transactionRow,
        summary: "Concurrent committed value",
        evidence: { ...measurements, planches: 5 },
      };
    };
    const response = await request({ summary: "Reviewed legacy update" });
    expect(response.status).toBe(200);
    expect(journal[0]!.before).toMatchObject({
      summary: "Concurrent committed value",
      evidence: { ...measurements, planches: 5 },
    });
    expect(journal[0]!.after).toMatchObject({
      summary: "Reviewed legacy update",
      evidence: { ...measurements, planches: 5 },
    });
    expect(outsideJournalWrites).toBe(0);
  });
  test("a changed locked CAS row creates neither a write nor a revision", async () => {
    const body = publication();
    onLock = () => {
      transactionRow = { ...transactionRow, summary: "Concurrent edit" };
    };
    const response = await request(body);
    expect(response.status).toBe(409);
    expect(updatesAttempted).toBe(0);
    expect(journal).toEqual([]);
    expect(invalidations).toBe(0);
  });
  test("a revert journal failure rolls back the restoration and retains the original revision", async () => {
    expect((await request(publication())).status).toBe(200);
    const published = structuredClone(live);
    failJournal = true;
    await expect(revertRevision(String(journal[0]!.id), actor)).rejects.toThrow(
      "Wiki revision could not be recorded",
    );
    expect(live).toEqual(published);
    expect(journal).toHaveLength(1);
    expect(outsideJournalWrites).toBe(0);
  });
  test("a successful revert creates one transactional revert revision without an external duplicate", async () => {
    expect((await request(publication())).status).toBe(200);
    await revertRevision(String(journal[0]!.id), actor);
    expect(live.image).toBeNull();
    expect(live.evidence).toEqual(measurements);
    expect(journal).toHaveLength(2);
    expect(journal[1]).toMatchObject({
      action: "revert",
      editorId: actor.id,
      before: { image },
      after: { image: null, evidence: measurements },
    });
    expect(outsideJournalWrites).toBe(0);
  });
  for (const action of ["create", "visibility"] as const) {
    test(`a ${action} revert uses the strict transactional visibility writer`, async () => {
      expect((await request(publication())).status).toBe(200);
      journal[0] = {
        ...journal[0]!,
        action,
        before: action === "create" ? null : { visible: false },
      };
      const published = structuredClone(live);
      failJournal = true;
      await expect(revertRevision(String(journal[0]!.id), actor)).rejects.toThrow(
        "Wiki revision could not be recorded",
      );
      expect(live).toEqual(published);
      expect(journal).toHaveLength(1);
      failJournal = false;
      await revertRevision(String(journal[0]!.id), actor);
      expect(live.visible).toBe(false);
      expect(journal).toHaveLength(2);
      expect(journal[1]).toMatchObject({ action: "revert", after: { visible: false } });
      expect(outsideJournalWrites).toBe(0);
    });
  }
});
