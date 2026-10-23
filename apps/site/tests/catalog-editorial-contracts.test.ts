// SPDX-License-Identifier: Apache-2.0
import { beforeEach, describe, expect, mock, test } from "bun:test";
import { NextRequest } from "next/server";
import { validateCatalogEditorialBody } from "../src/lib/catalog-editorial-contracts";
import {
  CatalogMediaConflictError,
  isCatalogRevisionJson,
} from "../src/lib/catalog-media-contracts";
import { WIKI_TABLE_SPECS } from "../src/lib/wiki-tables";
import { z } from "zod";
import { DatabooksFrozenError } from "@aphrody/shenron-db/guards";
import {
  WikiUpdatePreconditionError,
  wikiUpdateSnapshotHash,
} from "../src/lib/wiki-update-precondition";

let admin = true;
let frozen = true;
let writeError: Error | null = null;
const writes: Array<{ table: string; body: Record<string, unknown> }> = [];
const revisions: unknown[] = [];
const preconditions: unknown[] = [];
mock.module("@/lib/session", () => ({
  isCurrentUserAdmin: async () => admin,
  getCurrentUser: async () => null,
  revisionActorOf: () => null,
}));
mock.module("@/lib/databooks-freeze", () => ({
  DatabooksFrozenError,
  databooksFreeze: () => (frozen ? { reason: "test-freeze", path: null } : null),
}));
mock.module("@/lib/wiki-admin", () => ({
  isWikiTable: (table: string) =>
    [
      "db_episodes",
      "db_movies",
      "db_databooks",
      "media_works",
      "media_editions",
      "media_volumes",
    ].includes(table),
  hasVisibility: () => true,
  getWikiRow: async () => ({ id: 1 }),
  insertWiki: async (table: string, body: Record<string, unknown>) => {
    if (writeError) throw writeError;
    writes.push({ table, body });
    return { id: 1, ...body };
  },
  updateWiki: async (
    table: string,
    _id: string,
    body: Record<string, unknown>,
    options?: unknown,
  ) => {
    if (writeError) throw writeError;
    writes.push({ table, body });
    preconditions.push(options);
    return { id: 1, ...body };
  },
  deleteWiki: async () => {},
  listWiki: async () => ({ rows: [], total: 0 }),
  listWikiByParent: async () => ({ rows: [], total: 0 }),
  listWikiOptions: async () => [],
  listWikiRelations: async () => [],
  listWikiSectionsForEntity: async () => [],
  listWikiVisibility: async () => [],
  setAllWikiVisibility: async () => ({ updated: 0, previous: [] }),
  setWikiVisibility: async () => {},
}));
mock.module("@/lib/wiki-revisions", () => ({
  recordRevision: async (revision: unknown) => revisions.push(revision),
  recordBulkVisibilityRevision: async () => {},
}));
mock.module("@/lib/wiki-revalidate", () => ({
  revalidateWikiEntity: () => {},
  revalidateSectionParent: async () => {},
}));
const { POST, PATCH } = await import("../src/app/api/wiki-admin/[...path]/route");

async function write(table: string, body: unknown, method: "POST" | "PATCH" = "PATCH") {
  const path = method === "POST" ? [table] : [table, "1"];
  const request = new NextRequest(`https://example.test/api/wiki-admin/${path.join("/")}`, {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return (method === "POST" ? POST : PATCH)(request, { params: Promise.resolve({ path }) });
}

beforeEach(() => {
  admin = true;
  frozen = true;
  writeError = null;
  writes.length = 0;
  revisions.length = 0;
  preconditions.length = 0;
});

const nativeFrame = {
  source: "bun-video",
  sourceId: `bun-video:${"a".repeat(64)}:11`,
  sourceUrl: "https://media.example.test/episode.mp4",
  episodeNumber: null,
  imagePath: "https://cdn.example.test/episode-875/frame-11.png",
  timecodeSec: 11,
  width: 1920,
  height: 1080,
  characterNames: [],
  tags: [],
  caption: null,
  isNotable: false,
  sortOrder: 0,
};

describe("catalogue editorial writes", () => {
  test("qualified native PNG frames and full preconditions reach the canonical writer separately", async () => {
    const expected = { id: 1, frames: null, durationSec: 1397 };
    const expectedSha256 = wikiUpdateSnapshotHash(expected);
    const response = await write("db_episodes", {
      frames: JSON.stringify([nativeFrame]),
      durationSec: 1397,
      expected,
      expectedSha256,
    });
    expect(response.status).toBe(200);
    expect(writes[0]!.body).toEqual({ frames: [nativeFrame], durationSec: 1397 });
    expect(preconditions[0]).toEqual({ expected, expectedSha256 });
    expect(writes[0]!.body).not.toHaveProperty("expected");
    expect(revisions).toHaveLength(1);
  });
  test("unprotected frame updates never reach CRUD", async () => {
    expect((await write("db_episodes", { frames: [nativeFrame] })).status).toBe(400);
    expect(writes).toHaveLength(0);
    expect(revisions).toHaveLength(0);
  });
  test("a concurrent episode update returns 409 without a success revision or protected values", async () => {
    writeError = new WikiUpdatePreconditionError();
    const expected = { id: 1, frames: null };
    const response = await write("db_episodes", {
      frames: [],
      expected,
      expectedSha256: wikiUpdateSnapshotHash(expected),
    });
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: "wiki_update_precondition_changed" });
    expect(writes).toHaveLength(0);
    expect(revisions).toHaveLength(0);
  });
  test("native frame provenance and format are strict; the legacy frame shape remains accepted", () => {
    expect(validateCatalogEditorialBody("db_episodes", { frames: [nativeFrame] }).ok).toBe(true);
    expect(
      validateCatalogEditorialBody("db_episodes", {
        frames: [
          {
            ...nativeFrame,
            source: "ffmpeg",
            sourceId: "ffmpeg:dbs:001:11",
            imagePath: "./assets/ext/db_episodes_frames/875/11.jpg",
          },
        ],
      }).ok,
    ).toBe(true);
    for (const invalid of [
      { ...nativeFrame, source: "invented" },
      { ...nativeFrame, sourceId: `bun-video:${"a".repeat(64)}:12` },
      { ...nativeFrame, sourceId: "bun-video:unqualified:11" },
      { ...nativeFrame, imagePath: "https://cdn.example.test/frame.jpg" },
      { ...nativeFrame, imagePath: "https://bucket.r2.dev/frame.png" },
      { ...nativeFrame, imagePath: "https://cdn.example.test/frame.png?token=protected" },
      { ...nativeFrame, sourceUrl: "C:/private/capture.mp4" },
      { ...nativeFrame, width: null },
      { ...nativeFrame, timecodeSec: Number.NaN },
      { ...nativeFrame, privateHeaders: { authorization: "protected" } },
    ])
      expect(validateCatalogEditorialBody("db_episodes", { frames: [invalid] }).ok).toBe(false);
    for (const body of [
      { frames: "{invalid" },
      { durationSec: 1397.688 },
      { durationSec: -1 },
      { hasVostfr: true },
    ])
      expect(validateCatalogEditorialBody("db_episodes", body).ok).toBe(false);
  });
  for (const method of ["POST", "PATCH"] as const) {
    test(`${method} rejects frozen databook pages before CRUD or revision`, async () => {
      const response = await write("db_databooks", { pages: null, title: "Book" }, method);
      expect(response.status).toBe(423);
      expect(writes).toHaveLength(0);
      expect(revisions).toHaveLength(0);
    });
    test(`${method} preserves bibliography updates during a text freeze`, async () => {
      const response = await write(
        "db_databooks",
        { titleJa: "原題", sourceUrl: "https://example.test/book" },
        method,
      );
      expect(response.status).toBe(200);
      expect(writes).toHaveLength(1);
      expect(revisions).toHaveLength(1);
    });
    test(`${method} rejects malformed structured episode metadata without erasing it`, async () => {
      const response = await write("db_episodes", { subtitles: "{bad json" }, method);
      expect(response.status).toBe(400);
      expect(writes).toHaveLength(0);
      expect(revisions).toHaveLength(0);
    });
  }
  test("unfrozen pages remain writable", async () => {
    frozen = false;
    expect((await write("db_databooks", { pages: [] })).status).toBe(200);
    expect(writes).toHaveLength(1);
  });
  test("a freeze activated after the route check still returns 423 from the owner writer", async () => {
    frozen = false;
    writeError = new DatabooksFrozenError({ frozen: true, reason: "new-freeze", path: null });
    const response = await write("db_databooks", { pages: [] });
    expect(response.status).toBe(423);
    expect(await response.json()).toEqual({ error: "DATABOOKS_FROZEN", reason: "new-freeze" });
    expect(writes).toHaveLength(0);
    expect(revisions).toHaveLength(0);
  });
  test("auth refusal precedes the editorial writer", async () => {
    admin = false;
    expect((await write("db_episodes", { title: "Episode" })).status).toBe(403);
    expect(writes).toHaveLength(0);
  });
  test("valid source and track JSON reach the CRUD without scalar conversion", async () => {
    const subtitles = [{ lang: "ja", label: "Japanese", src: "/assets/subtitles/episode.vtt" }];
    const response = await write("db_episodes", {
      officialSourceUrl: "https://example.test/episode",
      subtitles: JSON.stringify(subtitles),
      players: [
        {
          name: "Official",
          provider: "official",
          embedUrl: "https://example.test/embed",
          lang: "vostfr",
        },
      ],
      availability: [
        {
          provider: "official",
          label: "Official",
          url: "https://example.test/watch",
          embedUrl: null,
          langs: ["vostfr"],
          available: true,
          checkedAt: 1_700_000_000,
        },
      ],
    });
    expect(response.status).toBe(200);
    expect(writes[0]!.body.subtitles).toEqual(subtitles);
    expect(revisions).toHaveLength(1);
  });
  test("rejects unsafe URLs and malformed availability", () => {
    for (const body of [
      { officialSourceUrl: "not a url" },
      { officialSourceUrl: "javascript:alert(1)" },
      { officialSourceUrl: "https://user:password@example.test" },
      { subtitles: [{ lang: "fr", label: "French", src: "/assets/subtitles/../private.vtt" }] },
      { players: [{ name: "Player", provider: "official", embedUrl: "javascript:alert(1)" }] },
      {
        availability: [
          {
            provider: "official",
            label: "Official",
            url: "https://example.test",
            embedUrl: null,
            langs: ["en"],
            available: "true",
            checkedAt: -1,
          },
        ],
      },
    ])
      expect(validateCatalogEditorialBody("db_episodes", body).ok).toBe(false);
  });
  test("movie subtitle JSON is mutable, validated and recorded as a structured revision", async () => {
    expect(WIKI_TABLE_SPECS.db_movies!.mutableColumns).toContain("subtitles");
    const subtitles = [{ lang: "ja", label: "Japanese · DVD", src: "/assets/subtitles/movie.vtt" }];
    const response = await write("db_movies", {
      subtitles: JSON.stringify(subtitles),
      title: "Movie",
    });
    expect(response.status).toBe(200);
    expect(writes).toEqual([{ table: "db_movies", body: { subtitles, title: "Movie" } }]);
    expect(revisions).toHaveLength(1);
    expect(isCatalogRevisionJson("db_movies", "subtitles")).toBe(true);
    expect(isCatalogRevisionJson("db_movies", "players")).toBe(false);
  });
  test("malformed movie tracks never reach the editorial writer", async () => {
    for (const subtitles of [
      "{bad json",
      [{ lang: "ja", label: "Japanese", src: "/assets/subtitles/../private.vtt" }],
      [{ lang: "ja", label: "Japanese", src: "https://user:secret@example.test/ja.vtt" }],
    ]) {
      expect((await write("db_movies", { subtitles })).status).toBe(400);
    }
    expect(writes).toHaveLength(0);
    expect(revisions).toHaveLength(0);
  });
  test("rejects scalar bodies without reaching CRUD", async () => {
    for (const body of [null, [], "title", 12]) {
      expect((await write("db_episodes", body)).status).toBe(400);
    }
    expect(writes).toHaveLength(0);
  });
  test("explicit metadata clearing remains distinguishable from malformed JSON", async () => {
    const response = await write("db_episodes", {
      officialSourceUrl: null,
      subtitles: null,
      players: [],
      availability: [],
    });
    expect(response.status).toBe(200);
    expect(writes[0]!.body).toEqual({
      officialSourceUrl: null,
      subtitles: null,
      players: [],
      availability: [],
    });
  });
  test("bibliographic conflict returns existing ids without a success revision", async () => {
    writeError = new CatalogMediaConflictError([7, 12]);
    const response = await write(
      "media_editions",
      {
        workId: 1,
        edition: "tankobon",
        label: "English",
        language: "en",
        isbn: "9781421520599",
      },
      "POST",
    );
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: "catalog_media_conflict",
      existingIds: [7, 12],
    });
    expect(writes).toHaveLength(0);
    expect(revisions).toHaveLength(0);
  });
  test("media insert requires a complete record while patch preserves omitted fields", async () => {
    expect((await write("media_works", { title: "Updated title" }, "POST")).status).toBe(400);
    expect(writes).toHaveLength(0);
    expect((await write("media_works", { title: "Updated title" }, "PATCH")).status).toBe(200);
    expect(writes[0]!.body).toEqual({ title: "Updated title" });
  });
  test("media edition defaults apply only to insert", async () => {
    expect(
      (await write("media_editions", { workId: 1, edition: "tankobon", label: "Original" }, "POST"))
        .status,
    ).toBe(200);
    expect(writes[0]!.body).toEqual({
      workId: 1,
      edition: "tankobon",
      label: "Original",
      language: "ja",
      pageColor: "unknown",
      scanPolicy: "self_hosted",
    });
    expect((await write("media_editions", { label: "Corrected" }, "PATCH")).status).toBe(200);
    expect(writes[1]!.body).toEqual({ label: "Corrected" });
  });
  test("repository validation failures map to 400 without recording success", async () => {
    const invalid = z.object({ workId: z.number() }).safeParse({ workId: "bad" });
    if (invalid.success) throw new Error("Invalid fixture unexpectedly passed");
    writeError = invalid.error;
    const response = await write("media_works", { title: "Updated title" });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "invalid_catalog_metadata",
      fields: ["workId"],
    });
    expect(writes).toHaveLength(0);
    expect(revisions).toHaveLength(0);
  });
});
