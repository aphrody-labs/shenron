// SPDX-License-Identifier: Apache-2.0
import { beforeEach, expect, mock, test } from "bun:test";
import { wikiUpdateSnapshotHash } from "../src/lib/wiki-update-precondition";
import { type SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";

const original = { id: 9, name: "Namek", description: "Original passage", visible: true };
let events: string[] = [];
let frozen = false;
mock.module("server-only", () => ({}));
mock.module("@/lib/db", () => ({
  db: {
    transaction: async () => {
      throw new Error("Unexpected nested transaction");
    },
    execute: async () => {
      throw new Error("Unexpected global database operation");
    },
  },
}));
mock.module("@/lib/databooks-freeze", () => ({
  assertDatabooksWritable: () => {
    if (frozen) throw new Error("Databooks frozen");
  },
}));
const { getWikiRow, updateWiki } = await import("../src/lib/wiki-admin");
const { ecrireTranscription, lireTranscription } = await import("../src/lib/databook-pages");
type WriterTransaction = NonNullable<Parameters<typeof updateWiki>[3]>["transaction"];
const transaction = {
  execute: async () => {
    events.push("advisory");
    return [];
  },
  select: () => ({
    from: () => ({
      where: () => ({
        limit: () => ({
          for: async () => {
            events.push("row-lock");
            return [{ ...original }];
          },
        }),
      }),
    }),
  }),
  update: () => ({
    set: (values: Record<string, unknown>) => ({
      where: () => ({
        returning: async () => {
          events.push("write");
          return [{ ...original, ...values }];
        },
      }),
    }),
  }),
} as unknown as WriterTransaction;
beforeEach(() => {
  events = [];
  frozen = false;
});

test("transaction-scoped writer reuses its caller and preserves advisory-before-row ordering", async () => {
  const saved = await updateWiki(
    "db_planets",
    "9",
    { description: "Corrected" },
    {
      transaction,
      expected: original,
      expectedSha256: wikiUpdateSnapshotHash(original),
    },
  );
  expect(saved.description).toBe("Corrected");
  expect(events).toEqual(["advisory", "row-lock", "write"]);
});

test("locked snapshot uses the caller transaction and standalone locks are rejected", async () => {
  expect(await getWikiRow("db_planets", "9", { transaction, lock: true })).toEqual(original);
  expect(events).toEqual(["advisory", "row-lock"]);
  await expect(getWikiRow("db_planets", "9", { lock: true })).rejects.toThrow(
    "require a transaction",
  );
});

test("media snapshot acquires the catalog lock before its entity row to match media writers", async () => {
  const locks: string[] = [];
  const mediaTransaction = {
    ...transaction!,
    execute: async (query: SQL) => {
      locks.push(String(new PgDialect().sqlToQuery(query).params[0]));
      events.push("advisory");
      return [];
    },
  } as unknown as WriterTransaction;
  await getWikiRow("media_works", "9", { transaction: mediaTransaction, lock: true });
  expect(locks).toEqual(["shenron:catalog:media_works", "shenron:wiki:media_works:9"]);
  expect(events).toEqual(["advisory", "advisory", "row-lock"]);
});

test("databook reads and surgical writes stay on the caller transaction and respect freezes", async () => {
  let calls = 0;
  const client = {
    execute: async () => {
      calls++;
      return calls % 2 === 1 ? [{ idx: 3 }] : [{ texte: "Original", id: 1 }];
    },
  };
  expect(await lireTranscription("1", 4, client as never)).toBe("Original");
  expect(await ecrireTranscription("1", 4, "Correction", client as never)).toBe(true);
  expect(calls).toBe(4);
  frozen = true;
  await expect(ecrireTranscription("1", 4, "Forbidden", client as never)).rejects.toThrow("frozen");
  expect(calls).toBe(4);
});
