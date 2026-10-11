import { afterEach, describe, expect, mock, spyOn, test } from "bun:test";
import type { IndexablePost, PostsRedisClient } from "../src/lib/posts-redis-shared";

mock.module("server-only", () => ({}));
const owner = await import("../src/lib/posts-redis-shared");
const {
  createPostsMirror,
  publicPostSnapshot,
  POSTS_INDEX_KEY,
  postCacheKey,
  POSTS_CACHE_TTL_SECONDS,
} = owner;
const at = new Date("2026-10-11T13:00:00Z");
const post: IndexablePost = {
  id: "post-1",
  slug: "official-news",
  title: "Official news",
  excerpt: "Public excerpt",
  contentHtml:
    '<p><a href="https://dragonball-super.com/">Primary</a><a href="javascript:alert(1)">Invalid</a></p>',
  cover: "https://example.org/cover.jpg",
  coverAlt: "Official artwork",
  tags: ["Anime"],
  canonicalUrl: null,
  published: true,
  status: "published",
  publishedAt: "2026-10-11T12:00:00Z",
  updatedAt: "2026-10-11T12:30:00Z",
};

function fixture() {
  const values = new Map<string, string>();
  const members = new Set<string>();
  const commands: Array<{ command: string; args: string[] }> = [];
  const client: PostsRedisClient = {
    async send(command, args) {
      commands.push({ command, args });
      switch (command) {
        case "SET":
          values.set(args[0]!, args[1]!);
          return "OK";
        case "GET":
          return values.get(args[0]!) ?? null;
        case "DEL":
          values.delete(args[0]!);
          return 1;
        case "SADD":
          members.add(args[1]!);
          return 1;
        case "SREM":
          members.delete(args[1]!);
          return 1;
        case "SMEMBERS":
          return [...members];
        case "EXPIRE":
          return 1;
        default:
          throw new Error("Unexpected Redis command");
      }
    },
  };
  return {
    values,
    members,
    commands,
    mirror: createPostsMirror(
      async () => client,
      () => at,
    ),
  };
}

describe("public article Redis mirror", () => {
  test("indexes only public fields, official links and bounded TTL", async () => {
    const f = fixture();
    const input = {
      ...post,
      authorId: "private-user",
      agentName: "private-agent",
      credential: "private-credential",
    };
    expect(await f.mirror.index(input)).toEqual({ ok: true, action: "indexed" });
    const snapshot = await f.mirror.read(post.id);
    expect(snapshot?.sourceUrls).toEqual(["https://dragonball-super.com/"]);
    expect(JSON.stringify(snapshot)).not.toContain("private-");
    expect(snapshot?.contentHtml).toBe(post.contentHtml);
    expect(f.commands.find((c) => c.command === "SET")?.args.slice(2)).toEqual([
      "EX",
      String(POSTS_CACHE_TTL_SECONDS),
    ]);
    expect(f.commands.find((c) => c.command === "EXPIRE")?.args).toEqual([
      POSTS_INDEX_KEY,
      "86400",
    ]);
    expect(f.members.has(post.id)).toBe(true);
  });

  test.each([
    { published: false },
    { status: "draft" },
    { status: "scheduled" },
    { publishedAt: "2026-10-12T12:00:00Z" },
    { publishedAt: null },
    { publishedAt: "invalid" },
  ])("removes excluded records and set membership: %j", async (overrides) => {
    const f = fixture();
    await f.mirror.index(post);
    expect(await f.mirror.index({ ...post, ...overrides })).toEqual({
      ok: true,
      action: "removed",
    });
    expect(f.values.has(postCacheKey(post.id))).toBe(false);
    expect(f.members.has(post.id)).toBe(false);
  });

  test("slug changes replace a stable ID key without leaving a former slug key", async () => {
    const f = fixture();
    await f.mirror.index(post);
    await f.mirror.index({ ...post, slug: "renamed-news" });
    expect([...f.values.keys()]).toEqual([postCacheKey(post.id)]);
    expect((await f.mirror.read(post.id))?.slug).toBe("renamed-news");
  });

  test("expired payloads and missing keys are filtered and removed from the set", async () => {
    const f = fixture();
    await f.mirror.index(post);
    f.members.add("missing");
    const expired = { ...publicPostSnapshot(post, at)!, cachedAt: "2026-10-10T13:00:00Z" };
    f.values.set(postCacheKey(post.id), JSON.stringify(expired));
    expect(await f.mirror.list()).toEqual([]);
    expect(f.members.size).toBe(0);
    expect(f.values.size).toBe(0);
  });

  test("cache failures are honest results and readers return unavailable", async () => {
    const mirror = createPostsMirror(
      async () => {
        throw new Error("Unavailable");
      },
      () => at,
    );
    expect(await mirror.index(post)).toEqual({ ok: false, action: "failed" });
    expect(await mirror.remove(post.id)).toEqual({ ok: false, action: "failed" });
    expect(await mirror.read(post.id)).toBeNull();
    expect(await mirror.list()).toBeNull();
  });
});

let failPostgres = false;
let failAuth = false;
let deleted = false;
const indexed = mock(async () => ({ ok: false, action: "failed" as const }));
const forgotten = mock(async () => ({ ok: false, action: "failed" as const }));
mock.module("@/lib/posts-redis", () => ({ ...owner, indexPost: indexed, forgetPost: forgotten }));
mock.module("@/lib/session", () => ({
  requireAdmin: async () => {
    if (failAuth) throw new Error("Forbidden");
    return { user: { id: "staff" } };
  },
}));
mock.module("next/navigation", () => ({
  redirect: () => {
    throw new Error("Redirect");
  },
}));
mock.module("@/lib/posts", () => ({
  renderPostDoc: () => ({ text: "Published text", html: "<p>Published text</p>" }),
  autoExcerpt: () => "Published text",
  computeReadingStats: () => ({ readingMinutes: 1, wordCount: 2 }),
}));
mock.module("next/cache", () => ({ revalidatePath: mock(() => {}) }));
mock.module("@/lib/db", () => ({
  db: {
    query: { posts: { findFirst: async () => ({ slug: post.slug }) } },
    delete: () => ({
      where: async () => {
        if (failPostgres) throw new Error("PostgreSQL rejected");
        deleted = true;
      },
    }),
    select: () => ({ from: () => ({ where: async () => [] }) }),
    insert: () => ({
      values: () => ({
        returning: async () => {
          if (failPostgres) throw new Error("PostgreSQL rejected");
          return [{ id: "created-public-id" }];
        },
      }),
    }),
  },
}));
const { savePostRecord } = await import("../src/lib/cms-posts");
const { deletePost } = await import("../src/app/admin/posts/_actions");
afterEach(() => {
  failPostgres = false;
  failAuth = false;
  deleted = false;
  indexed.mockClear();
  forgotten.mockClear();
  mock.restore();
});

test("admin deletion keeps authentication and PostgreSQL before cache invalidation", async () => {
  const input = new FormData();
  input.set("id", post.id);
  failAuth = true;
  await expect(deletePost(input)).rejects.toThrow("Forbidden");
  expect(deleted).toBe(false);
  expect(forgotten).not.toHaveBeenCalled();
  failAuth = false;
  failPostgres = true;
  await expect(deletePost(input)).rejects.toThrow("PostgreSQL rejected");
  expect(deleted).toBe(false);
  expect(forgotten).not.toHaveBeenCalled();
});

test("cache removal failure keeps a successful admin deletion and redirect", async () => {
  const warn = spyOn(console, "warn").mockImplementation(() => {});
  const input = new FormData();
  input.set("id", post.id);
  await expect(deletePost(input)).rejects.toThrow("Redirect");
  expect(deleted).toBe(true);
  expect(forgotten).toHaveBeenCalledWith(post.id);
  expect(warn).toHaveBeenCalledWith(
    JSON.stringify({ event: "posts_cache", cached: false, action: "failed" }),
  );
});

test("PostgreSQL failure never writes Redis", async () => {
  failPostgres = true;
  await expect(
    savePostRecord(
      {
        title: "Official announcement",
        slug: "official-announcement",
        doc: {},
        status: "published",
      },
      { userId: "staff", canPublish: true },
    ),
  ).rejects.toThrow("PostgreSQL rejected");
  expect(indexed).not.toHaveBeenCalled();
});

test("Redis failure preserves PostgreSQL success and logs a sanitized receipt", async () => {
  const warn = spyOn(console, "warn").mockImplementation(() => {});
  const result = await savePostRecord(
    { title: "Official announcement", slug: "official-announcement", doc: {}, status: "published" },
    { userId: "staff", canPublish: true },
  );
  expect(result).toEqual({ ok: true, id: "created-public-id", slug: "official-announcement" });
  expect(indexed).toHaveBeenCalledTimes(1);
  expect(warn).toHaveBeenCalledWith(
    JSON.stringify({ event: "posts_cache", cached: false, action: "failed" }),
  );
});
