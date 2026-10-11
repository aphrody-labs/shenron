export const POSTS_INDEX_KEY = "dbfr:posts:all";
export const POSTS_CACHE_TTL_SECONDS = 86_400;
export const postCacheKey = (id: string): string => `dbfr:post:${id}`;

export interface IndexablePost {
  id: string;
  slug: string;
  title: string;
  excerpt: string | null;
  contentHtml: string | null;
  cover: string | null;
  coverAlt: string | null;
  tags: string[];
  canonicalUrl: string | null;
  published: boolean;
  status: string;
  publishedAt: Date | string | null;
  updatedAt: Date | string;
}
export interface PublicPostSnapshot {
  id: string;
  slug: string;
  title: string;
  excerpt: string | null;
  contentHtml: string | null;
  cover: string | null;
  coverAlt: string | null;
  tags: string[];
  canonicalUrl: string | null;
  sourceUrls: string[];
  publishedAt: string;
  updatedAt: string;
  cachedAt: string;
}
export type PostCacheResult = { ok: boolean; action: "indexed" | "removed" | "failed" };
export interface PostsRedisClient {
  send(command: string, args: string[]): Promise<unknown>;
}

function iso(value: Date | string | null): string | null {
  if (value === null) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}
function publicUrl(value: string): string | null {
  try {
    const url = new URL(value.replaceAll("&amp;", "&"));
    return /^(https?:)$/.test(url.protocol) && !url.username && !url.password
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}

/** Only already-public fields enter the mirror; author and agent identities never do. */
export function publicPostSnapshot(
  post: IndexablePost,
  now = new Date(),
): PublicPostSnapshot | null {
  const publishedAt = iso(post.publishedAt);
  const updatedAt = iso(post.updatedAt);
  if (
    !post.published ||
    post.status !== "published" ||
    !publishedAt ||
    !updatedAt ||
    new Date(publishedAt).getTime() > now.getTime()
  )
    return null;
  const links = [...(post.contentHtml ?? "").matchAll(/\bhref=["']([^"']+)["']/g)]
    .map((match) => publicUrl(match[1]!))
    .filter((url): url is string => url !== null);
  const canonicalUrl = post.canonicalUrl ? publicUrl(post.canonicalUrl) : null;
  return {
    id: post.id,
    slug: post.slug,
    title: post.title,
    excerpt: post.excerpt,
    contentHtml: post.contentHtml,
    cover: post.cover,
    coverAlt: post.coverAlt,
    tags: [...post.tags],
    canonicalUrl,
    sourceUrls: [...new Set(canonicalUrl ? [canonicalUrl, ...links] : links)],
    publishedAt,
    updatedAt,
    cachedAt: now.toISOString(),
  };
}

/** Redis is reconstructible; failures are reported without undoing PostgreSQL writes. */
export function createPostsMirror(
  getClient: () => Promise<PostsRedisClient>,
  now = () => new Date(),
) {
  async function remove(id: string): Promise<PostCacheResult> {
    try {
      const redis = await getClient();
      await redis.send("DEL", [postCacheKey(id)]);
      await redis.send("SREM", [POSTS_INDEX_KEY, id]);
      return { ok: true, action: "removed" };
    } catch {
      return { ok: false, action: "failed" };
    }
  }
  async function index(post: IndexablePost): Promise<PostCacheResult> {
    try {
      const snapshot = publicPostSnapshot(post, now());
      if (!snapshot) return remove(post.id);
      const redis = await getClient();
      await redis.send("SET", [
        postCacheKey(post.id),
        JSON.stringify(snapshot),
        "EX",
        String(POSTS_CACHE_TTL_SECONDS),
      ]);
      await redis.send("SADD", [POSTS_INDEX_KEY, post.id]);
      await redis.send("EXPIRE", [POSTS_INDEX_KEY, String(POSTS_CACHE_TTL_SECONDS)]);
      return { ok: true, action: "indexed" };
    } catch {
      return { ok: false, action: "failed" };
    }
  }
  async function read(id: string): Promise<PublicPostSnapshot | null> {
    try {
      const redis = await getClient();
      const raw = await redis.send("GET", [postCacheKey(id)]);
      if (typeof raw !== "string") {
        await redis.send("SREM", [POSTS_INDEX_KEY, id]);
        return null;
      }
      const snapshot = JSON.parse(raw) as PublicPostSnapshot;
      if (
        snapshot.id !== id ||
        !iso(snapshot.publishedAt) ||
        !iso(snapshot.cachedAt) ||
        new Date(snapshot.publishedAt).getTime() > now().getTime() ||
        now().getTime() - new Date(snapshot.cachedAt).getTime() >= POSTS_CACHE_TTL_SECONDS * 1000
      ) {
        await remove(id);
        return null;
      }
      return snapshot;
    } catch {
      return null;
    }
  }
  async function list(): Promise<PublicPostSnapshot[] | null> {
    try {
      const redis = await getClient();
      const ids = await redis.send("SMEMBERS", [POSTS_INDEX_KEY]);
      if (!Array.isArray(ids) || !ids.every((id) => typeof id === "string")) return null;
      const posts: PublicPostSnapshot[] = [];
      for (const id of ids) {
        const snapshot = await read(id);
        if (snapshot) posts.push(snapshot);
      }
      return posts;
    } catch {
      return null;
    }
  }
  return { index, remove, read, list };
}
