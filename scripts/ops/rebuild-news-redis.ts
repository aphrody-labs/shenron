// SPDX-License-Identifier: Apache-2.0
/** Reconstruct the public article mirror from read-only PostgreSQL rows. */
import { SQL, RedisClient } from "bun";
import { resolveRedisUrl } from "@aphrody/shenron-config/services";
import {
  createPostsMirror,
  postCacheKey,
  POSTS_CACHE_TTL_SECONDS,
  POSTS_INDEX_KEY,
  publicPostSnapshot,
  type IndexablePost,
} from "../../apps/site/src/lib/posts-redis-shared";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("Protected DATABASE_URL is required");
const apply = process.argv.includes("--apply");
const sql = new SQL(databaseUrl, { max: 1 });
let redis: RedisClient | null = null;
try {
  const rows = await sql<IndexablePost[]>`
    SELECT id, slug, title, excerpt, "contentHtml", cover, "coverAlt", tags,
           "canonicalUrl", published, status, "publishedAt", "updatedAt"
    FROM public."Post" ORDER BY id`;
  const at = new Date();
  const publicRows = rows.filter((row) => publicPostSnapshot(row, at) !== null);
  if (!apply) {
    console.log(
      JSON.stringify({
        apply: false,
        total: rows.length,
        public: publicRows.length,
        excluded: rows.length - publicRows.length,
      }),
    );
  } else {
    const url = new URL(resolveRedisUrl(process.env));
    url.pathname = "/4";
    redis = new RedisClient(url.toString(), {
      autoReconnect: true,
      maxRetries: 1,
      enableOfflineQueue: false,
    });
    try {
      await redis.connect();
    } catch {
      throw new Error("Public article cache is unavailable");
    }
    const mirror = createPostsMirror(
      async () => redis!,
      () => at,
    );
    const previous = await mirror.list();
    if (previous === null) throw new Error("Public article cache is unavailable");
    const expectedIds = new Set(publicRows.map((row) => row.id));
    for (const snapshot of previous) {
      if (!expectedIds.has(snapshot.id) && !(await mirror.remove(snapshot.id)).ok)
        throw new Error("Public article cache removal failed");
    }
    for (const row of rows) {
      if (!(await mirror.index(row)).ok)
        throw new Error("Public article cache reconstruction failed");
    }
    const actual = await mirror.list();
    if (!actual || actual.length !== publicRows.length)
      throw new Error("Public article cache count mismatch");
    const snapshots = [];
    for (const row of publicRows) {
      const snapshot = await mirror.read(row.id);
      if (JSON.stringify(snapshot) !== JSON.stringify(publicPostSnapshot(row, at)))
        throw new Error("Public article cache payload mismatch");
      const ttl = await redis.send("TTL", [postCacheKey(row.id)]);
      if (typeof ttl !== "number" || ttl <= 0 || ttl > POSTS_CACHE_TTL_SECONDS)
        throw new Error("Public article cache expiry mismatch");
      snapshots.push({
        id: row.id,
        slug: row.slug,
        exact: true,
        ttl,
        sha256: new Bun.CryptoHasher("sha256").update(JSON.stringify(snapshot)).digest("hex"),
      });
    }
    const indexTtl = await redis.send("TTL", [POSTS_INDEX_KEY]);
    if (typeof indexTtl !== "number" || indexTtl <= 0 || indexTtl > POSTS_CACHE_TTL_SECONDS)
      throw new Error("Public article cache index expiry mismatch");
    console.log(
      JSON.stringify({
        apply: true,
        verified: true,
        total: rows.length,
        public: publicRows.length,
        excluded: rows.length - publicRows.length,
        database: 4,
        indexTtl,
        snapshots,
      }),
    );
  }
} finally {
  redis?.close();
  await sql.close();
}
