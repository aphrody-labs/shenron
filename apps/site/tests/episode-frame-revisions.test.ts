// SPDX-License-Identifier: Apache-2.0
import { beforeEach, expect, mock, test } from "bun:test";
import { NextRequest } from "next/server";
import { PgDialect } from "drizzle-orm/pg-core";
import {
  wikiUpdateSnapshotHash,
  WikiUpdatePreconditionError,
} from "../src/lib/wiki-update-precondition";
type Row = Record<string, unknown>;
const frame = (time: number) => ({
  source: "bun-video",
  sourceId: `bun-video:${"a".repeat(64)}:${time}`,
  sourceUrl: `https://cdn.dragonballfr.com/media/episodes/876/${"a".repeat(64)}/source.mp4`,
  episodeNumber: 2,
  imagePath: `https://dragonballfr.com/assets/wiki/episode-876/${time}.png`,
  timecodeSec: time,
  width: 1920,
  height: 1080,
  characterNames: [],
  tags: [],
  caption: null,
  isNotable: false,
  sortOrder: 0,
});
const original: Row = {
  id: 876,
  title: "Episode",
  series: "DBS_BEERUS",
  numberInSeries: 2,
  synopsis: "Preserved",
  frames: [
    {
      ...frame(48.5),
      sourceId: "bun-video:GE00389314JAJP:48.5",
      sourceUrl:
        "https://www.crunchyroll.com/fr/watch/GE00389314JAJP/the-god-of-destruction-heads-to-the-planet-of-the-kai",
      imagePath: "https://cdn.dragonballfr.com/media/episodes/876/GE00389314JAJP/frame_00.webp",
    },
  ],
};
let episode: Row;
let revisions: Row[];
let race = false;
const dialect = new PgDialect();
mock.module("server-only", () => ({}));
mock.module("@/lib/session", () => ({
  isCurrentUserAdmin: async () => true,
  getCurrentUser: async () => null,
  revisionActorOf: () => ({ id: null, name: "Fixture reviewer" }),
}));
mock.module("@/lib/wiki-revalidate", () => ({
  revalidateWikiEntity: () => {},
  revalidateSectionParent: async () => {},
}));
const transport = {
  execute: async () => [],
  select: () => {
    let table: unknown;
    let params: unknown[] = [];
    const rows = () =>
      table === revisionTable
        ? revisions
            .filter((revision) => revision.id === params[0])
            .map((revision) => structuredClone(revision))
        : [structuredClone(episode)];
    const chain = {
      from: (value: unknown) => {
        table = value;
        return chain;
      },
      where: (condition: Parameters<PgDialect["sqlToQuery"]>[0]) => {
        params = dialect.sqlToQuery(condition).params;
        return chain;
      },
      limit: () => chain,
      for: async () => {
        if (race) {
          episode.frames = [frame(999)];
          race = false;
        }
        return rows();
      },
      // oxlint-disable-next-line unicorn/no-thenable -- Drizzle selects are PromiseLike.
      then: <T>(resolve: (value: Row[]) => T) => Promise.resolve(rows()).then(resolve),
    };
    return chain;
  },
  update: () => ({
    set: (values: Row) => ({
      where: () => ({
        returning: async () => {
          episode = { ...episode, ...structuredClone(values) };
          return [structuredClone(episode)];
        },
      }),
    }),
  }),
  insert: () => ({
    values: (values: Row) => {
      const id = `revision-${revisions.length + 1}`;
      revisions.push({ ...structuredClone(values), id });
      return { returning: async () => [{ id }] };
    },
  }),
};
mock.module("@/lib/db", () => ({
  db: {
    ...transport,
    transaction: async <T>(work: (tx: typeof transport) => Promise<T>) => work(transport),
  },
}));
const { wikiRevisions: revisionTable } = await import("../src/db/schema");
const { PATCH } = await import("../src/app/api/wiki-admin/[...path]/route");
const { revertRevision } = await import("../src/lib/wiki-revisions");
const { updateWiki } = await import("../src/lib/wiki-admin");
beforeEach(() => {
  episode = structuredClone(original);
  revisions = [];
  race = false;
});
async function patch() {
  const expected = structuredClone(episode);
  return PATCH(
    new NextRequest("http://fixture/api/wiki-admin/db_episodes/876", {
      method: "PATCH",
      body: JSON.stringify({
        frames: [frame(49)],
        expected,
        expectedSha256: wikiUpdateSnapshotHash(expected),
      }),
    }),
    { params: Promise.resolve({ path: ["db_episodes", "876"] }) },
  );
}

test("real episode API snapshots exact frame arrays and reverts without overwriting later metadata", async () => {
  expect((await patch()).status).toBe(200);
  expect(revisions).toHaveLength(1);
  expect(revisions[0]!.before).toMatchObject({ frames: original.frames });
  expect(revisions[0]!.after).toMatchObject({ frames: [frame(49)] });
  episode.title = "Later title";
  episode.synopsis = "Later synopsis";
  await revertRevision(String(revisions[0]!.id), null);
  expect(episode.frames).toEqual(original.frames);
  expect(episode.title).toBe("Later title");
  expect(episode.synopsis).toBe("Later synopsis");
  expect(revisions[1]!.action).toBe("revert");
  expect(revisions[1]!.after).toMatchObject({ frames: original.frames, title: "Later title" });
  await revertRevision(String(revisions[1]!.id), null);
  expect(episode.frames).toEqual([frame(49)]);
});

test("historical restores require an exact persisted frame snapshot and cannot relax ordinary updates", async () => {
  const expected = structuredClone(episode);
  const options = { expected, expectedSha256: wikiUpdateSnapshotHash(expected) };
  await expect(
    updateWiki("db_episodes", "876", { frames: original.frames }, options),
  ).rejects.toThrow("Invalid editorial metadata");
  await expect(
    updateWiki(
      "db_episodes",
      "876",
      { frames: original.frames },
      { ...options, restoreEpisodeRevisionId: "missing", revisionAction: "revert" },
    ),
  ).rejects.toThrow("Historical episode frames differ");
  expect((await patch()).status).toBe(200);
  await expect(
    updateWiki(
      "db_episodes",
      "876",
      { frames: [frame(100)] },
      {
        expected: structuredClone(episode),
        expectedSha256: wikiUpdateSnapshotHash(episode),
        restoreEpisodeRevisionId: String(revisions[0]!.id),
        revisionAction: "revert",
      },
    ),
  ).rejects.toThrow("Historical episode frames differ");
});

test("partial historical snapshots cannot restore fields without an after-state", async () => {
  expect((await patch()).status).toBe(200);
  const revision = revisions[0]!;
  delete (revision.after as Row).synopsis;
  episode.synopsis = "A newer unrelated synopsis";
  await revertRevision(String(revision.id), null);
  expect(episode.frames).toEqual(original.frames);
  expect(episode.synopsis).toBe("A newer unrelated synopsis");
});

test("frame revert refuses newer gallery edits and a race after its administrative read", async () => {
  expect((await patch()).status).toBe(200);
  episode.frames = [frame(100)];
  await expect(revertRevision(String(revisions[0]!.id), null)).rejects.toBeInstanceOf(
    WikiUpdatePreconditionError,
  );
  expect(episode.frames).toEqual([frame(100)]);
  expect(revisions).toHaveLength(1);
  episode.frames = [frame(49)];
  race = true;
  await expect(revertRevision(String(revisions[0]!.id), null)).rejects.toBeInstanceOf(
    WikiUpdatePreconditionError,
  );
  expect(episode.frames).toEqual([frame(999)]);
  expect(revisions).toHaveLength(1);
});
