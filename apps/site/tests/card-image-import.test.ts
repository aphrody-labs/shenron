// SPDX-License-Identifier: Apache-2.0
import { afterAll, beforeEach, expect, mock, test } from "bun:test";
import { PgDialect } from "drizzle-orm/pg-core";
import sharp from "sharp";
import { cardCatalogCards, wikiRevisions } from "../src/db/schema";
import { wikiUpdateSnapshotHash } from "../src/lib/wiki-update-precondition";
import type {
  CardImageImportItem,
  CardImageImportRequest,
  CardImageRestoreRequest,
} from "../src/lib/card-image-contract";
type Row = Record<string, unknown>;
const bytes = new Uint8Array(
  await sharp({ create: { width: 172, height: 250, channels: 3, background: "white" } })
    .png()
    .toBuffer(),
);
const sha = new Bun.CryptoHasher("sha256").update(bytes).digest("hex");
const image = (number: string): CardImageImportItem => ({
  setId: "set-ja",
  cardNumber: number,
  language: "ja",
  region: "JP",
  frontImageUrl: `https://cdn.dragonballfr.com/publications/carddass-reviewed/objects/${sha}.png`,
  frontImageWidth: 172,
  frontImageHeight: 250,
  frontImageSourceUrl: `https://www.carddass.com/dbh/cardlist/${number}.png`,
  frontImageRights: "Owner-authorized official catalogue thumbnail",
  sha256: sha,
});
const original = (number: string): Row => ({
  id: `card-${number}`,
  setId: "set-ja",
  slug: `card-${number}`,
  cardNumber: number,
  language: "ja",
  region: "JP",
  name: `Card ${number}`,
  rarity: "R",
  status: "published",
  description: "Preserve this description",
  sourceLabel: "Official catalogue",
  sourceUrl: "https://www.carddass.com/dbh/cardlist/",
  sourceAccessedAt: "2026-11-03",
  frontImageUrl: null,
  frontImageWidth: null,
  frontImageHeight: null,
  frontImageSourceUrl: null,
  frontImageRights: null,
  backImageUrl: "https://cdn.dragonballfr.com/back.png",
  updatedAt: new Date("2026-11-02T00:00:00Z"),
});
let cards: Row[];
let revisions: Row[];
let failJournal: boolean;
let raceBeforeTransaction: boolean;
let locks: string[];
let writes: number;
let fetches: number;
let tail = Promise.resolve();
const dialect = new PgDialect();
mock.module("server-only", () => ({}));
const transport = {
  select: () => {
    let params: unknown[] = [];
    let table: unknown;
    const find = () =>
      (table === wikiRevisions
        ? revisions.filter((row) => row.id === params[0])
        : params.length === 1
          ? cards.filter((row) => row.id === params[0])
          : cards.filter((row) =>
              [row.setId, row.cardNumber, row.language, row.region].every(
                (value, index) => value === params[index],
              ),
            )
      ).map((row) => structuredClone(row));
    const chain = {
      from: (value: unknown) => {
        table = value;
        return chain;
      },
      where: (query: Parameters<PgDialect["sqlToQuery"]>[0]) => {
        params = dialect.sqlToQuery(query).params;
        return chain;
      },
      limit: () => chain,
      for: async () => {
        locks.push(String(params[1] ?? find()[0]?.cardNumber));
        return find();
      },
      // oxlint-disable-next-line unicorn/no-thenable -- Drizzle queries are PromiseLike.
      then: <T>(resolve: (rows: Row[]) => T) => Promise.resolve(find()).then(resolve),
    };
    return chain;
  },
  update: () => ({
    set: (fields: Row) => ({
      where: (query: Parameters<PgDialect["sqlToQuery"]>[0]) => ({
        returning: async () => {
          const id = dialect.sqlToQuery(query).params[0];
          const index = cards.findIndex((row) => row.id === id);
          if (index < 0) return [];
          writes++;
          cards[index] = { ...cards[index], ...structuredClone(fields) };
          return [structuredClone(cards[index])];
        },
      }),
    }),
  }),
  insert: () => ({
    values: (value: Row) => {
      if (failJournal && revisions.length >= 1) throw new Error("Journal unavailable");
      const id = `revision-${revisions.length + 1}`;
      revisions.push({ ...structuredClone(value), id });
      return { returning: async () => [{ id }] };
    },
  }),
};
const database = {
  ...transport,
  transaction: async <T>(work: (tx: typeof transport) => Promise<T>): Promise<T> => {
    let release!: () => void;
    const previous = tail;
    tail = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    if (raceBeforeTransaction) {
      cards[0]!.rarity = "A later official correction";
      raceBeforeTransaction = false;
    }
    const savedCards = structuredClone(cards);
    const savedRevisions = structuredClone(revisions);
    try {
      return await work(transport);
    } catch (error) {
      cards = savedCards;
      revisions = savedRevisions;
      throw error;
    } finally {
      release();
    }
  },
};
mock.module("@/lib/db", () => ({ db: database, schema: { cardCatalogCards } }));
const { importCardImages } = await import("../src/lib/card-image-import");
const { restoreCardImages } = await import("../src/lib/card-image-restore");
const oldFetch = globalThis.fetch;
beforeEach(() => {
  cards = [original("A-001"), original("A-002")];
  revisions = [];
  failJournal = false;
  raceBeforeTransaction = false;
  locks = [];
  writes = 0;
  fetches = 0;
  tail = Promise.resolve();
  globalThis.fetch = Object.assign(
    async (_input: string | URL | Request, init?: RequestInit) => {
      fetches++;
      expect(init?.redirect).toBe("error");
      expect(init?.headers).toBeUndefined();
      return new Response(bytes, { headers: { "content-type": "image/png" } });
    },
    { preconnect: oldFetch.preconnect },
  ) as typeof fetch;
});

function restoration(plan: Awaited<ReturnType<typeof restoreCardImages>>): CardImageRestoreRequest {
  if (plan.intent !== "restore-preview") throw new Error("Expected historical preview");
  return {
    intent: "restore-commit",
    lang: "fr",
    planSha256: plan.planSha256,
    items: plan.items.map((item) => item.item),
  };
}

test("image-only history restores original nulls without fetching them and strictly journals the real delta", async () => {
  await importCardImages(commit(await preview()), null);
  const importedRevision = String(revisions[0]!.id);
  cards[0]!.description = "A later unrelated description";
  const beforeFetches = fetches;
  const plan = await restoreCardImages(
    { intent: "restore-preview", lang: "fr", items: [{ revisionId: importedRevision }] },
    null,
  );
  const result = await restoreCardImages(restoration(plan), {
    id: null,
    name: "Historical reviewer",
  });
  expect(result).toMatchObject({ intent: "restore-commit", restored: 1 });
  expect(fetches).toBe(beforeFetches);
  expect(cards[0]).toMatchObject({
    frontImageUrl: null,
    frontImageWidth: null,
    frontImageHeight: null,
    frontImageSourceUrl: null,
    frontImageRights: null,
    description: "A later unrelated description",
    status: "published",
  });
  expect(revisions[1]).toMatchObject({
    action: "revert",
    editorName: "Historical reviewer",
    before: { frontImageUrl: image("A-001").frontImageUrl },
    after: { frontImageUrl: null },
  });
  const redo = await restoreCardImages(
    { intent: "restore-preview", lang: "fr", items: [{ revisionId: String(revisions[1]!.id) }] },
    null,
  );
  await restoreCardImages(restoration(redo), null);
  expect(cards[0]!.frontImageUrl).toBe(image("A-001").frontImageUrl);
});

test("historical UUID images from a real legacy card restore exact nullable evidence without relaxing ordinary imports", async () => {
  const legacyUrl =
    "https://bot.dragonballfr.com/assets/wiki/cards/7ca42e86-a1dc-4bbc-899f-dde0879e5b10.jpg";
  const legacyBytes = new Uint8Array(
    await sharp({ create: { width: 279, height: 190, channels: 3, background: "white" } })
      .jpeg()
      .toBuffer(),
  );
  const legacy = {
    frontImageUrl: legacyUrl,
    frontImageWidth: 279,
    frontImageHeight: 190,
    frontImageSourceUrl: "https://dragonballfr.com/wiki/databooks/13",
    frontImageRights:
      "Owner authorization confirmed in this session on 2026-11-02; crop from Dragon Ball Extra Daizenshuu: Carddass Perfect File Part 1, p. 16 (DBFR scan 7).",
  };
  cards[0] = { ...cards[0], ...legacy };
  const successfulFetch = globalThis.fetch;
  globalThis.fetch = Object.assign(
    async (url: string | URL | Request, init?: RequestInit) =>
      String(url) === legacyUrl ? new Response(legacyBytes) : successfulFetch(url, init),
    { preconnect: oldFetch.preconnect },
  ) as typeof fetch;
  await importCardImages(commit(await preview()), null);
  const plan = await restoreCardImages(
    { intent: "restore-preview", lang: "fr", items: [{ revisionId: String(revisions[0]!.id) }] },
    null,
  );
  await restoreCardImages(restoration(plan), null);
  expect(cards[0]).toMatchObject(legacy);
  cards[0] = {
    ...cards[0],
    frontImageWidth: null,
    frontImageHeight: null,
    frontImageSourceUrl: null,
    frontImageRights: null,
  };
  await importCardImages(commit(await preview()), null);
  const nullable = await restoreCardImages(
    {
      intent: "restore-preview",
      lang: "fr",
      items: [{ revisionId: String(revisions.at(-1)!.id) }],
    },
    null,
  );
  await restoreCardImages(restoration(nullable), null);
  expect(cards[0]).toMatchObject({
    frontImageUrl: legacyUrl,
    frontImageWidth: null,
    frontImageHeight: null,
    frontImageSourceUrl: null,
    frontImageRights: null,
  });
  await expect(preview([{ ...image("A-001"), frontImageUrl: legacyUrl }])).rejects.toThrow();
});

test("historical image writes roll back on journal failure and reject changed image or metadata preconditions", async () => {
  await importCardImages(commit(await preview()), null);
  const request: CardImageRestoreRequest = {
    intent: "restore-preview",
    lang: "fr",
    items: [{ revisionId: String(revisions[0]!.id) }],
  };
  const plan = restoration(await restoreCardImages(request, null));
  failJournal = true;
  await expect(restoreCardImages(plan, null)).rejects.toThrow(
    "Wiki revision could not be recorded",
  );
  expect(cards[0]!.frontImageUrl).toBe(image("A-001").frontImageUrl);
  expect(revisions).toHaveLength(1);
  failJournal = false;
  cards[0]!.rarity = "Newer variant correction";
  await expect(restoreCardImages(plan, null)).rejects.toMatchObject({ code: "preview_changed" });
  cards[0]!.frontImageUrl = "https://cdn.dragonballfr.com/newer.png";
  await expect(restoreCardImages(request, null)).rejects.toMatchObject({ code: "preview_changed" });
  expect(revisions).toHaveLength(1);
});

test("persisted history cannot trigger a foreign fetch or restore another entity", async () => {
  await importCardImages(commit(await preview()), null);
  (revisions[0]!.before as Row).frontImageUrl = "https://127.0.0.1/private.png";
  const beforeFetches = fetches;
  await expect(
    restoreCardImages(
      { intent: "restore-preview", lang: "fr", items: [{ revisionId: String(revisions[0]!.id) }] },
      null,
    ),
  ).rejects.toMatchObject({ code: "image_integrity_mismatch" });
  expect(fetches).toBe(beforeFetches);
  revisions[0]!.tableName = "OtherTable";
  await expect(
    restoreCardImages(
      { intent: "restore-preview", lang: "fr", items: [{ revisionId: String(revisions[0]!.id) }] },
      null,
    ),
  ).rejects.toMatchObject({ code: "preview_changed" });
});
afterAll(() => {
  globalThis.fetch = oldFetch;
});
async function preview(items = [image("A-001")]) {
  return importCardImages({ intent: "preview", lang: "fr", items }, null);
}
function commit(plan: Awaited<ReturnType<typeof importCardImages>>): CardImageImportRequest {
  if (plan.intent !== "preview") throw new Error("Expected preview");
  return {
    intent: "commit",
    lang: "fr",
    planSha256: plan.planSha256,
    items: plan.items.map((row) => row.item),
  };
}

test("preview exposes exact image before/after and commit only updates image fields with a strict journal", async () => {
  const before = structuredClone(cards[0]);
  const plan = await preview();
  expect(writes).toBe(0);
  expect(revisions).toHaveLength(0);
  if (plan.intent !== "preview") throw new Error("Expected preview");
  expect(plan.items[0]?.item.expectedSha256).toBe(wikiUpdateSnapshotHash(before!));
  expect(plan.items[0]?.before.frontImageUrl).toBeNull();
  expect(plan.items[0]?.after.frontImageUrl).toBe(image("A-001").frontImageUrl);
  const result = await importCardImages(commit(plan), { id: null, name: "Automation reviewer" });
  expect(result).toMatchObject({ intent: "commit", updated: 1, skipped: 0 });
  expect(cards[0]).toMatchObject({
    name: before!.name,
    status: "published",
    description: before!.description,
    rarity: "R",
    backImageUrl: before!.backImageUrl,
    frontImageUrl: image("A-001").frontImageUrl,
  });
  expect(revisions[0]).toMatchObject({
    tableName: "CardCatalogCard",
    rowId: "card-A-001",
    action: "update",
    editorName: "Automation reviewer",
    before: { frontImageUrl: null },
    after: { frontImageUrl: image("A-001").frontImageUrl },
  });
});

test("all cards are locked in deterministic identity order and a journal failure rolls back the entire batch", async () => {
  const plan = await preview([image("A-002"), image("A-001")]);
  failJournal = true;
  await expect(importCardImages(commit(plan), null)).rejects.toThrow(
    "Wiki revision could not be recorded",
  );
  expect(locks).toEqual(["A-001", "A-002"]);
  expect(writes).toBe(2);
  expect(cards.every((card) => card.frontImageUrl === null)).toBe(true);
  expect(revisions).toHaveLength(0);
});

test("full row CAS protects later rarity/variant corrections and concurrent commits publish once", async () => {
  const plan = await preview();
  raceBeforeTransaction = true;
  await expect(importCardImages(commit(plan), null)).rejects.toMatchObject({
    code: "preview_changed",
    status: 409,
  });
  expect(cards[0]!.rarity).toBe("A later official correction");
  expect(writes).toBe(0);
  expect(revisions).toHaveLength(0);
  const fresh = commit(await preview());
  const results = await Promise.allSettled([
    importCardImages(fresh, null),
    importCardImages(fresh, null),
  ]);
  expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
  expect(revisions).toHaveLength(1);
});

test("wrong image bytes or dimensions never reach the database writer and a fresh identical plan is a no-op", async () => {
  const successfulFetch = globalThis.fetch;
  await expect(preview([{ ...image("A-001"), frontImageWidth: 171 }])).rejects.toMatchObject({
    code: "image_integrity_mismatch",
  });
  globalThis.fetch = Object.assign(async () => new Response("corrupt pixels"), {
    preconnect: oldFetch.preconnect,
  }) as typeof fetch;
  await expect(preview()).rejects.toMatchObject({ code: "image_integrity_mismatch" });
  expect(writes).toBe(0);
  globalThis.fetch = successfulFetch;
  await importCardImages(commit(await preview()), null);
  const result = await importCardImages(commit(await preview()), null);
  expect(result).toMatchObject({ intent: "commit", updated: 0, skipped: 1 });
  expect(revisions).toHaveLength(1);
});
