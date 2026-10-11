import "server-only";
import { resolveRedisUrl } from "@aphrody/shenron-config/services";
import { createPostsMirror, type PostsRedisClient } from "./posts-redis-shared";
let client: (PostsRedisClient & { onclose: ((error: Error) => void) | null }) | null = null;
let connecting: Promise<PostsRedisClient> | null = null;
async function connect(): Promise<PostsRedisClient> {
  if (client) return client;
  if (connecting) return connecting;
  connecting = (async () => {
    const { RedisClient } = await import("bun");
    const url = new URL(resolveRedisUrl(process.env));
    url.pathname = "/4";
    const redis = new RedisClient(url.toString(), {
      autoReconnect: true,
      maxRetries: 1,
      enableOfflineQueue: false,
    });
    // oxlint-disable-next-line unicorn/prefer-add-event-listener -- Bun Redis exposes this callback API.
    redis.onclose = () => {
      if (client === redis) client = null;
    };
    client = redis;
    return redis;
  })();
  try {
    return await connecting;
  } finally {
    connecting = null;
  }
}

const mirror = createPostsMirror(connect);
export const indexPost = mirror.index;
export const forgetPost = mirror.remove;
export const readIndexedPost = mirror.read;
export const readIndexedPosts = mirror.list;
