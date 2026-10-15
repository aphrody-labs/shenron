// SPDX-License-Identifier: Apache-2.0
import { beforeEach, expect, mock, test } from "bun:test";
import { NextRequest } from "next/server";
import { PgDialect } from "drizzle-orm/pg-core";
import {
  wikiUpdateSnapshotHash,
  WikiUpdatePreconditionError,
} from "../src/lib/wiki-update-precondition";

type Row = Record<string, unknown>;
const original = {
  id: 11,
  title: "Fixture databook",
  category: "Databook",
  kind: "databook",
  visible: true,
  pages: [
    {
      number: 28,
      image: "scan28.jpg",
      text: { kind: "text", text: "旧日本語" },
      text_fr: { kind: "markdown", markdown: "Ancien **français**" },
      verifiee: false,
      text_fr_by: "reviewer",
      text_fr_at: 123,
    },
    {
      number: 29,
      image: "scan29.jpg",
      text: { kind: "markdown", markdown: "日本語二" },
      text_fr: "Texte intact",
      verifiee: true,
    },
    { number: 30, image: "scan30.jpg", text: "Untouched scan", metadata: { source: "original" } },
  ],
};
let book: Row = structuredClone(original);
let revisions: Row[] = [];
let raceOnLockedRead = false;
let legacyWrites = 0;
let legacyCalls: unknown[][] = [];
let transactions = 0;
const dialect = new PgDialect();
mock.module("server-only", () => ({}));
mock.module("@/lib/session", () => ({
  isCurrentUserAdmin: async () => true,
  getCurrentUser: async () => null,
  revisionActorOf: () => ({ id: "fixture", name: "Reviewer" }),
}));
mock.module("@/lib/databooks-freeze", () => ({
  databooksFreeze: () => null,
  assertDatabooksWritable: () => {},
  DatabooksFrozenError: class extends Error {},
}));
mock.module("@/lib/wiki-revalidate", () => ({
  revalidateWikiEntity: () => {},
  revalidateSectionParent: async () => {},
}));
mock.module("@/lib/databook-pages", () => ({
  ecrireTranscription: async (...args: unknown[]) => {
    legacyWrites++;
    legacyCalls.push(args);
    return true;
  },
  ecrireTraduction: async (...args: unknown[]) => {
    legacyWrites++;
    legacyCalls.push(args);
    return true;
  },
}));
// Only the Drizzle transport is replaced. CMS parsing, CRUD/CAS, journal and revert are real.
const databaseTransport = {
  execute: async () => [],
  select: () => {
    let table: unknown;
    let params: unknown[] = [];
    const rows = () =>
      table === revisionTable
        ? revisions.filter((r) => r.id === params[0]).map((r) => structuredClone(r))
        : [structuredClone(book)];
    const chain = {
      from: (t: unknown) => {
        table = t;
        return chain;
      },
      where: (condition: Parameters<PgDialect["sqlToQuery"]>[0]) => {
        params = dialect.sqlToQuery(condition).params;
        return chain;
      },
      limit: () => chain,
      for: async () => {
        if (raceOnLockedRead) {
          book.title = "Concurrent title";
          raceOnLockedRead = false;
        }
        return rows();
      },
      // oxlint-disable-next-line unicorn/no-thenable -- Drizzle query builders are PromiseLike.
      then: <T>(resolve: (value: Row[]) => T) => Promise.resolve(rows()).then(resolve),
    };
    return chain;
  },
  update: () => ({
    set: (values: Row) => ({
      where: () => ({
        returning: async () => {
          book = { ...book, ...structuredClone(values) };
          return [structuredClone(book)];
        },
      }),
    }),
  }),
  insert: () => ({
    values: (values: Row) => {
      const id = `revision-${revisions.length + 1}`;
      revisions.push({ ...structuredClone(values), id, createdAt: new Date() });
      return { returning: async () => [{ id }] };
    },
  }),
};
const database = {
  ...databaseTransport,
  transaction: async <T>(fn: (tx: typeof databaseTransport) => Promise<T>): Promise<T> => {
    transactions++;
    return fn(databaseTransport);
  },
};
mock.module("@/lib/db", () => ({ db: database }));
const { wikiRevisions: revisionTable } = await import("../src/db/schema");
const { PATCH } = await import("../src/app/api/wiki-admin/[...path]/route");
const { recordRevision, revertRevision } = await import("../src/lib/wiki-revisions");

beforeEach(() => {
  book = structuredClone(original);
  revisions = [];
  legacyWrites = 0;
  legacyCalls = [];
  transactions = 0;
  raceOnLockedRead = false;
});
async function patch(expected: Row, pages: unknown[]) {
  return PATCH(
    new NextRequest("http://fixture/api/wiki-admin/db_databooks/11", {
      method: "PATCH",
      body: JSON.stringify({ pages, expected, expectedSha256: wikiUpdateSnapshotHash(expected) }),
    }),
    { params: Promise.resolve({ path: ["db_databooks", "11"] }) },
  );
}
function correctedPages() {
  const pages = structuredClone(original.pages) as Row[];
  pages[0] = {
    ...pages[0],
    text: { kind: "text", text: "訂正日本語" },
    text_fr: { kind: "markdown", markdown: "Français **corrigé**" },
    verifiee: true,
    text_fr_by: "human",
    text_fr_at: 456,
  };
  pages[1] = { ...pages[1], text: { kind: "markdown", markdown: "訂正二" } };
  return pages;
}

test("real CMS CAS journals only changed scans and reverts exact JA/FR wrappers and flags", async () => {
  const before = structuredClone(book);
  const response = await patch(before, correctedPages());
  expect(response.status).toBe(200);
  expect(transactions).toBe(1);
  expect(revisions).toHaveLength(1);
  const revision = revisions[0]!;
  const previous = revision.before as Row;
  const next = revision.after as Row;
  expect(previous).not.toHaveProperty("pages");
  expect(Object.keys(previous).filter((k) => k.startsWith("pages#"))).toEqual([
    "pages#28",
    "pages#29",
  ]);
  expect((previous["pages#28"] as Row).value).toEqual(original.pages[0]);
  expect((next["pages#28"] as Row).value).toEqual(correctedPages()[0]);
  // Later edits outside the reverted field set must survive.
  const currentPages = book.pages as Row[];
  currentPages[2]!.text = "Later unrelated page";
  currentPages[0]!.note = "Later same-page metadata";
  book.title = "Later unrelated title";
  const reverted = await revertRevision(String(revision.id), { id: "fixture", name: "Reviewer" });
  expect(reverted.mode).toBe("restore");
  expect((book.pages as Row[])[0]).toEqual({
    ...original.pages[0],
    note: "Later same-page metadata",
  });
  expect((book.pages as Row[])[1]).toEqual(original.pages[1]);
  expect((book.pages as Row[])[2]!.text).toBe("Later unrelated page");
  expect(book.title).toBe("Later unrelated title");
  expect(legacyWrites).toBe(0);
  expect(transactions).toBe(2);
  expect(revisions).toHaveLength(2);
  expect(revisions[1]!.action).toBe("revert");
  // The new reversal is itself reversible, with the original wrappers still intact.
  await revertRevision(String(revisions[1]!.id), null);
  expect((book.pages as Row[])[0]).toEqual({
    ...correctedPages()[0],
    note: "Later same-page metadata",
  });
  expect((book.pages as Row[])[2]!.text).toBe("Later unrelated page");
});

test("stale CMS snapshot rejects pages and creates no misleading revision", async () => {
  const before = structuredClone(book);
  raceOnLockedRead = true;
  const response = await patch(before, correctedPages());
  expect(response.status).toBe(409);
  expect(book.pages).toEqual(original.pages);
  expect(revisions).toHaveLength(0);
});

test("revert refuses a newer edit to a targeted JA field without changing any page", async () => {
  expect((await patch(structuredClone(book), correctedPages())).status).toBe(200);
  (book.pages as Row[])[0]!.text = { kind: "text", text: "Another reviewed correction" };
  const current = structuredClone(book);
  await expect(revertRevision(String(revisions[0]!.id), null)).rejects.toBeInstanceOf(
    WikiUpdatePreconditionError,
  );
  expect(book).toEqual(current);
  expect(revisions).toHaveLength(1);
});

test("removed translation fields and explicit JSON null are restored without coercion", async () => {
  const pages = structuredClone(original.pages) as Row[];
  delete pages[0]!.text_fr;
  delete pages[0]!.text_fr_by;
  delete pages[0]!.text_fr_at;
  pages[0]!.verifiee = null;
  pages[1]!.text_fr = { kind: "text", text: "Nouvelle traduction" };
  pages[1]!.text_fr_at = 999;
  expect((await patch(structuredClone(book), pages)).status).toBe(200);
  expect((book.pages as Row[])[0]).not.toHaveProperty("text_fr");
  await revertRevision(String(revisions[0]!.id), null);
  expect(book.pages).toEqual(original.pages);
  expect((book.pages as Row[])[1]).not.toHaveProperty("text_fr_at");
});

test("revert uses the owner CAS if another edit arrives after the initial read", async () => {
  expect((await patch(structuredClone(book), correctedPages())).status).toBe(200);
  raceOnLockedRead = true;
  await expect(revertRevision(String(revisions[0]!.id), null)).rejects.toBeInstanceOf(
    WikiUpdatePreconditionError,
  );
  expect(book.pages).toEqual(correctedPages());
  expect(book.title).toBe("Concurrent title");
  expect(revisions).toHaveLength(1);
});

test("legacy transcription and translation targets keep their existing restoration contract", async () => {
  const id = await recordRevision({
    table: "db_databooks",
    id: "11",
    action: "update",
    before: { "pages#28": "旧日本語", "traduction#28": null },
    after: { "pages#28": "訂正", "traduction#28": "Français" },
  });
  expect(revisions[0]!.before).toEqual({ "pages#28": "旧日本語", "traduction#28": null });
  await revertRevision(id!, null);
  expect(legacyCalls).toEqual([
    ["11", 28, "旧日本語"],
    ["11", 28, null],
  ]);
});

test("revert rejects reordered scans with equal corrected text and replacement assets", async () => {
  const pages = structuredClone(original.pages) as Row[];
  pages[0]!.text = "Same corrected text";
  pages[1]!.text = "Same corrected text";
  expect((await patch(structuredClone(book), pages)).status).toBe(200);
  const corrected = structuredClone(book);
  const reordered = book.pages as Row[];
  [reordered[0], reordered[1]] = [reordered[1]!, reordered[0]!];
  const concurrentOrder = structuredClone(book);
  await expect(revertRevision(String(revisions[0]!.id), null)).rejects.toBeInstanceOf(
    WikiUpdatePreconditionError,
  );
  expect(book).toEqual(concurrentOrder);
  expect(revisions).toHaveLength(1);
  book = structuredClone(corrected);
  (book.pages as Row[])[0]!.image = "replacement-scan.jpg";
  const replacement = structuredClone(book);
  await expect(revertRevision(String(revisions[0]!.id), null)).rejects.toBeInstanceOf(
    WikiUpdatePreconditionError,
  );
  expect(book).toEqual(replacement);
  expect(revisions).toHaveLength(1);
});
