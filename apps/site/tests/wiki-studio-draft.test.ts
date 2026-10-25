// SPDX-License-Identifier: Apache-2.0
import { expect, test } from "bun:test";
import { prepareStudioSubmission } from "../src/lib/wiki-studio-draft";
import {
  wikiUpdateSnapshotHash,
  WikiUpdateRequestError,
} from "../src/lib/wiki-update-precondition";
import { browserWikiSnapshotHash, canonicalWikiSnapshot } from "../src/lib/wiki-snapshot";

test("browser CAS matches native canonical snapshots including nested evidence and dates", async () => {
  const row = {
    id: 2,
    date: new Date("2026-10-25T00:00:00.000Z"),
    evidence: { source: "Manga", pages: [2, 3] },
    visible: true,
    image: null,
  };
  expect(await browserWikiSnapshotHash(row)).toBe(wikiUpdateSnapshotHash(row));
  expect(await browserWikiSnapshotHash(JSON.parse(JSON.stringify(row)))).toBe(
    wikiUpdateSnapshotHash(row),
  );
  expect(() => canonicalWikiSnapshot({ missing: undefined })).toThrow(WikiUpdateRequestError);
});

test("submission freezes both typed values and the complete row before asynchronous hashing", async () => {
  const row = {
    id: 2,
    name: "Vegeta",
    description: "Before",
    image: null,
    evidence: { chapter: 377 },
  };
  const draft = { name: "Super Vegeta", description: "" };
  const pending = prepareStudioSubmission(draft, row, ["name", "description"], "edit");
  draft.name = "Another edit";
  row.evidence.chapter = 458;
  const submitted = await pending;
  expect(submitted.name).toBe("Super Vegeta");
  expect(submitted.description).toBe("");
  expect(submitted.expected).toEqual({
    id: 2,
    name: "Vegeta",
    description: "Before",
    image: null,
    evidence: { chapter: 377 },
  });
  expect(submitted.expectedSha256).toBe(
    wikiUpdateSnapshotHash(submitted.expected as Record<string, unknown>),
  );
});

test("create omits CAS and unloaded edit cannot submit empty values", async () => {
  expect(await prepareStudioSubmission({ name: "New" }, null, ["name"], "create")).toEqual({
    name: "New",
  });
  await expect(prepareStudioSubmission({ name: "" }, null, ["name"], "edit")).rejects.toThrow(
    "not loaded",
  );
});
