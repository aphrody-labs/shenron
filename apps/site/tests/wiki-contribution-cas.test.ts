// SPDX-License-Identifier: Apache-2.0
import { beforeEach, expect, mock, test } from "bun:test";
import {
  WikiUpdatePreconditionError,
  wikiUpdateSnapshotHash,
} from "../src/lib/wiki-update-precondition";

const original = { id: 9, name: "Namek", description: "Original passage", visible: true };
const originalProposal = {
  id: "proposal-1",
  status: "pending",
  tableName: "db_planets",
  rowId: "9",
  columnName: "description",
  valueBefore: original.description,
  valueAfter: "Corrected passage",
  authorId: "writer",
  authorName: "Contributor",
  createdAt: new Date(),
  reviewedAt: null,
};
let committed = {
  entity: { ...original },
  proposal: { ...originalProposal },
  revisions: [] as string[],
};
type State = typeof committed;
type Transaction = { state: State; select: () => unknown; update: () => unknown };
let queue = Promise.resolve();
let writtenOptions: Record<string, unknown> | null = null;
let writes = 0;
let conflict = false;
let revisionFailure = false;
let decisionLocks = 0;
let targetLocks = 0;
let transactionCount = 0;
mock.module("server-only", () => ({}));
mock.module("@/lib/db", () => ({
  db: {
    transaction: async (work: (tx: Transaction) => Promise<unknown>) => {
      const previous = queue;
      let unlock = () => {};
      queue = new Promise<void>((resolve) => {
        unlock = resolve;
      });
      await previous;
      const state = structuredClone(committed);
      const tx: Transaction = {
        state,
        select: () => ({
          from: () => ({
            where: () => ({
              limit: () => ({
                for: async (mode: string) => {
                  expect(mode).toBe("update");
                  decisionLocks++;
                  return [state.proposal];
                },
              }),
            }),
          }),
        }),
        update: () => ({
          set: (values: Record<string, unknown>) => ({
            where: () => {
              Object.assign(state.proposal, values);
              return Object.assign(Promise.resolve([state.proposal]), {
                returning: async () => [state.proposal],
              });
            },
          }),
        }),
      };
      transactionCount++;
      try {
        const outcome = await work(tx);
        committed = state;
        return outcome;
      } finally {
        unlock();
      }
    },
  },
}));
mock.module("@/lib/wiki-admin", () => ({
  getWikiRow: async (
    _table: string,
    _id: string,
    options: { transaction?: Transaction; lock?: boolean } = {},
  ) => {
    if (options.lock) {
      expect(options.transaction).toBeDefined();
      targetLocks++;
    }
    return { ...(options.transaction?.state.entity ?? committed.entity) };
  },
  updateWiki: async (
    _table: string,
    _id: string,
    data: Record<string, unknown>,
    options: Record<string, unknown>,
  ) => {
    writtenOptions = options;
    if (conflict) throw new WikiUpdatePreconditionError();
    const tx = options.transaction as Transaction;
    expect(tx).toBeDefined();
    writes++;
    Object.assign(tx.state.entity, data);
    return { ...tx.state.entity };
  },
}));
mock.module("@/lib/wiki-revisions", () => ({
  recordRevisionStrict: async (input: unknown, tx: Transaction) => {
    expect(tx).toBeDefined();
    expect(input).toMatchObject({ actor: { id: "writer", name: "Contributor" } });
    if (revisionFailure) throw new Error("Revision store failed");
    tx.state.revisions.push("revision-1");
    return "revision-1";
  },
}));
mock.module("@/lib/wiki-revalidate", () => ({
  revalidateWikiEntity: () => {},
  revalidateSectionParent: async () => {},
}));
mock.module("@/lib/databook-pages", () => ({
  estCiblePlanche: () => false,
  numeroDePlanche: () => null,
  lireTranscription: async () => null,
  ecrireTranscription: async () => false,
}));
mock.module("@/lib/stats-personnage", () => ({
  estCibleStats: () => false,
  formatStats: () => "",
  parseStats: () => ({}),
  fusionnerStats: () => ({}),
}));
const { acceptContribution } = await import("../src/lib/wiki-contributions");
beforeEach(() => {
  committed = { entity: { ...original }, proposal: { ...originalProposal }, revisions: [] };
  writes = 0;
  conflict = false;
  revisionFailure = false;
  writtenOptions = null;
  decisionLocks = 0;
  targetLocks = 0;
  transactionCount = 0;
});

test("acceptance locks proposal and entity and commits text, attribution and status together", async () => {
  const accepted = await acceptContribution("proposal-1", { id: "reviewer", name: "Reviewer" });
  expect(writtenOptions).toMatchObject({
    expected: original,
    expectedSha256: wikiUpdateSnapshotHash(original),
    actor: { id: "writer", name: "Contributor" },
  });
  expect(decisionLocks).toBe(1);
  expect(targetLocks).toBe(1);
  expect(transactionCount).toBe(1);
  expect(accepted.status).toBe("accepted");
  expect(accepted.revisionId).toBe("revision-1");
  expect(committed.entity.description).toBe("Corrected passage");
  expect(committed.revisions).toEqual(["revision-1"]);
});

test("a failed revision rolls back the editorial change and keeps the proposal pending", async () => {
  revisionFailure = true;
  await expect(acceptContribution("proposal-1", null)).rejects.toThrow("Revision store failed");
  expect(writes).toBe(1);
  expect(committed.entity.description).toBe(original.description);
  expect(committed.proposal.status).toBe("pending");
  expect(committed.revisions).toEqual([]);
});

test("writer CAS conflict cannot leave a publication or a revision", async () => {
  conflict = true;
  await expect(acceptContribution("proposal-1", null)).rejects.toMatchObject({
    code: "superseded",
    status: 409,
  });
  expect(writes).toBe(0);
  expect(committed.entity).toEqual(original);
  expect(committed.revisions).toEqual([]);
});

test("stale proposal commits its superseded state without writing the target", async () => {
  committed.entity.description = "Another editor's correction";
  await expect(acceptContribution("proposal-1", null)).rejects.toMatchObject({
    code: "superseded",
    status: 409,
  });
  expect(committed.proposal.status).toBe("superseded");
  expect(committed.entity.description).toBe("Another editor's correction");
  expect(writes).toBe(0);
});

test("two serialized moderators cannot publish the same proposal twice", async () => {
  const outcomes = await Promise.allSettled([
    acceptContribution("proposal-1", null),
    acceptContribution("proposal-1", null),
  ]);
  expect(outcomes.filter((result) => result.status === "fulfilled")).toHaveLength(1);
  const rejected = outcomes.find((result) => result.status === "rejected") as PromiseRejectedResult;
  expect(rejected.reason).toMatchObject({ code: "already_reviewed", status: 409 });
  expect(writes).toBe(1);
  expect(committed.revisions).toHaveLength(1);
});
