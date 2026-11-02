// SPDX-License-Identifier: Apache-2.0
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { mkdir, rename, readdir } from "node:fs/promises";
import { isShenronEpisodeVideoURL } from "./episode-video-source";

type Player = { embedUrl: string };
type Metadata = {
  durationSeconds: number;
  fps: number;
  frameCount: number;
  width: number;
  height: number;
};
type Kind = "frame" | "gif";
type GifSettings = { duration: number; fps: number; width: number };
// The workspace's published Bun declarations predate the native Video surface.
interface NativeVideo {
  metadata(): Promise<{
    duration: number | null;
    fpsNumerator: number;
    fpsDenominator: number;
    frameCount: number;
    width: number;
    height: number;
  }>;
  frame(seconds: number): NativeVideo;
  resize(width: number, height: number): NativeVideo;
  webp(options: { quality: number }): NativeVideo;
  bytes(): Promise<Uint8Array>;
  gif(options: {
    start: number;
    duration: number;
    fps: number;
    width: number;
  }): Promise<Uint8Array>;
}
type NativeVideoConstructor = { new (path: string): NativeVideo; readonly available: boolean };
const Video =
  typeof Bun === "undefined"
    ? undefined
    : (Bun as typeof Bun & { Video?: NativeVideoConstructor }).Video;
type Dependencies = {
  available(): boolean;
  source(url: URL, id: number, hash: string): Promise<string>;
  metadata(path: string): Promise<Metadata>;
  image(
    path: string,
    kind: Kind,
    index: number,
    metadata: Metadata,
    settings: GifSettings,
  ): Promise<Uint8Array>;
};
class BusyError extends Error {}
const sourceDirectory = join(tmpdir(), "shenron-episode-video");
const leases = new Map<string, number>();
const currentPaths = new Map<number, string>();

async function purgeOldSources(id: number) {
  const current = currentPaths.get(id);
  if (!current) return;
  const directory = dirname(current);
  for (const name of await readdir(directory).catch(() => [] as string[])) {
    if (!new RegExp(`^${id}-[a-f0-9]{64}\\.mp4$`).test(name)) continue;
    const path = join(directory, name);
    if (path !== currentPaths.get(id) && !leases.has(path))
      await Bun.file(path)
        .delete()
        .catch(() => {});
  }
}

function retainSource(path: string, id: number) {
  leases.set(path, (leases.get(path) ?? 0) + 1);
  return async () => {
    const remaining = (leases.get(path) ?? 1) - 1;
    if (remaining) leases.set(path, remaining);
    else leases.delete(path);
    await purgeOldSources(id);
  };
}

/** Only immutable, owner-published episode sources can enter the decoder. */
export function episodeTimelineSource(id: number, players: readonly Player[] | null): URL | null {
  if (id !== 875 && id !== 876 && id !== 877 && id !== 878) return null;
  for (const player of players ?? []) {
    if (!URL.canParse(player.embedUrl)) continue;
    const url = new URL(player.embedUrl);
    if (
      isShenronEpisodeVideoURL(url) &&
      new RegExp(`^/media/episodes/${id}/[a-f0-9]{64}/source\\.mp4$`).test(url.pathname)
    )
      return url;
  }
  return null;
}

async function digestFile(path: string): Promise<string> {
  const hasher = new Bun.CryptoHasher("sha256");
  for await (const chunk of Bun.file(path).stream()) hasher.update(chunk);
  return hasher.digest("hex");
}

export async function downloadEpisodeVideoSource(
  url: URL,
  id: number,
  hash: string,
  fetcher: typeof fetch = fetch,
  directory = sourceDirectory,
): Promise<string> {
  if (episodeTimelineSource(id, [{ embedUrl: url.href }])?.pathname.split("/")[4] !== hash)
    throw new Error("invalid_source");
  const destination = join(directory, `${id}-${hash}.mp4`);
  const existing = Bun.file(destination);
  if (await existing.exists()) {
    if (existing.size <= 1024 ** 3 && (await digestFile(destination)) === hash) return destination;
    await existing.delete();
  }
  const response = await fetcher(url, {
    redirect: "error",
    credentials: "omit",
    signal: AbortSignal.timeout(120_000),
  });
  const length = response.headers.get("content-length");
  const declared = length === null ? null : Number(length);
  if (
    response.status !== 200 ||
    !response.body ||
    (length !== null &&
      (!/^\d+$/.test(length) ||
        !Number.isSafeInteger(declared) ||
        declared! <= 0 ||
        declared! > 1024 ** 3))
  ) {
    await response.body?.cancel();
    throw new Error("source_unavailable");
  }
  const temporary = `${destination}.${crypto.randomUUID()}.partial`;
  await mkdir(directory, { recursive: true });
  const writer = Bun.file(temporary).writer();
  const hasher = new Bun.CryptoHasher("sha256");
  let total = 0;
  let ended = false;
  try {
    for await (const chunk of response.body) {
      total += chunk.byteLength;
      if (total > 1024 ** 3) throw new Error("source_too_large");
      hasher.update(chunk);
      writer.write(chunk);
      await writer.flush();
    }
    await writer.end();
    ended = true;
    if (!total || (declared !== null && total !== declared) || hasher.digest("hex") !== hash)
      throw new Error("source_integrity_failed");
    await rename(temporary, destination);
    return destination;
  } catch (error) {
    await response.body.cancel().catch(() => {});
    throw error;
  } finally {
    if (!ended) await Promise.resolve(writer.end()).catch(() => {});
    await Bun.file(temporary)
      .delete()
      .catch(() => {});
  }
}

const nativeDependencies: Dependencies = {
  available: () => typeof Video === "function" && Video.available,
  source: downloadEpisodeVideoSource,
  async metadata(path) {
    if (!Video) throw new Error("video_unavailable");
    const value = await new Video(path).metadata();
    const fps = value.fpsNumerator / value.fpsDenominator;
    if (!value.duration || !Number.isFinite(fps) || fps <= 0 || value.frameCount < 1)
      throw new Error("invalid_metadata");
    return {
      durationSeconds: value.duration,
      fps,
      frameCount: value.frameCount,
      width: value.width,
      height: value.height,
    };
  },
  async image(path, kind, index, metadata, settings) {
    const start = index / metadata.fps;
    if (!Video) throw new Error("video_unavailable");
    const video = new Video(path);
    return kind === "frame"
      ? video.frame(start).resize(320, 180).webp({ quality: 75 }).bytes()
      : video.gif({
          start,
          duration: Math.min(settings.duration, metadata.durationSeconds - start),
          fps: settings.fps,
          width: settings.width,
        });
  },
};

/** Shared bounded scheduler and byte LRU; no caller-controlled filesystem paths. */
export function createEpisodeTimelineHandler(
  overrides: Partial<Dependencies> = {},
  directory = sourceDirectory,
) {
  const dependencies = {
    ...nativeDependencies,
    source: (url: URL, id: number, hash: string) =>
      downloadEpisodeVideoSource(url, id, hash, fetch, directory),
    ...overrides,
  };
  const sources = new Map<string, Promise<{ path: string; metadata: Metadata }>>();
  const pending = new Map<string, Promise<Uint8Array>>();
  const cache = new Map<string, Uint8Array>();
  const queue: (() => void)[] = [];
  let active = 0;
  let cachedBytes = 0;
  async function schedule<T>(work: () => Promise<T>, signal: AbortSignal): Promise<T> {
    signal.throwIfAborted();
    if (active >= 2) {
      if (queue.length >= 12) throw new BusyError();
      await new Promise<void>((resolve) => queue.push(resolve));
    } else active++;
    try {
      signal.throwIfAborted();
      return await work();
    } finally {
      const next = queue.shift();
      if (next) next();
      else active--;
    }
  }
  function remember(key: string, bytes: Uint8Array) {
    if (bytes.byteLength > 32 * 1024 ** 2) return;
    while (cachedBytes + bytes.byteLength > 32 * 1024 ** 2) {
      const oldest = cache.keys().next().value;
      if (!oldest) break;
      cachedBytes -= cache.get(oldest)!.byteLength;
      cache.delete(oldest);
    }
    cache.set(key, bytes);
    cachedBytes += bytes.byteLength;
  }
  return async function timeline(
    request: Request,
    id: number,
    players: readonly Player[] | null,
  ): Promise<Response> {
    const fail = (error: string, status: number) =>
      Response.json(
        { error },
        {
          status,
          headers: {
            "Cache-Control": "no-store",
            ...(status === 429 ? { "Retry-After": "2" } : {}),
          },
        },
      );
    const query = new URL(request.url).searchParams;
    const kind = query.get("kind");
    const rawIndex = query.get("index");
    const optionKeys = ["duration", "fps", "width"];
    if (
      [...query.keys()].some(
        (key) => key !== "kind" && key !== "index" && !optionKeys.includes(key),
      ) ||
      optionKeys.some(
        (key) => query.getAll(key).length > 1 || (query.has(key) && kind !== "gif"),
      ) ||
      (query.has("duration") && !/^[1-5]$/.test(query.get("duration")!)) ||
      (query.has("fps") && !["6", "12", "24"].includes(query.get("fps")!)) ||
      (query.has("width") && !["320", "480", "640"].includes(query.get("width")!)) ||
      query.getAll("kind").length > 1 ||
      query.getAll("index").length > 1 ||
      (kind !== null && kind !== "frame" && kind !== "gif") ||
      (kind === null ? rawIndex !== null : !rawIndex || !/^(0|[1-9]\d{0,8})$/.test(rawIndex))
    )
      return fail("invalid_request", 400);
    const settings = {
      duration: Number(query.get("duration") ?? 2),
      fps: Number(query.get("fps") ?? 6),
      width: Number(query.get("width") ?? 320),
    };
    const url = episodeTimelineSource(id, players);
    if (!url) return fail("source_not_found", 404);
    if (!dependencies.available()) return fail("video_unavailable", 503);
    const hash = url.pathname.split("/")[4]!;
    const sourceKey = `${id}-${hash}`;
    try {
      request.signal.throwIfAborted();
      let source = sources.get(sourceKey);
      if (!source) {
        // At most one immutable source per approved episode remains indexed.
        for (const key of sources.keys()) if (key.startsWith(`${id}-`)) sources.delete(key);
        source = schedule(async () => {
          const path = await dependencies.source(url, id, hash);
          const release = retainSource(path, id);
          try {
            const metadata = await dependencies.metadata(path);
            if (path === join(directory, `${id}-${hash}.mp4`)) currentPaths.set(id, path);
            return { path, metadata };
          } finally {
            await release();
          }
        }, request.signal);
        sources.set(sourceKey, source);
        source.catch(() => sources.delete(sourceKey));
      }
      const { path, metadata } = await source;
      request.signal.throwIfAborted();
      if (kind === null)
        return Response.json(metadata, { headers: { "Cache-Control": "public, max-age=60" } });
      const index = Number(rawIndex);
      if (index >= metadata.frameCount) return fail("invalid_request", 400);
      const key = `${sourceKey}-${kind}-${index}-${settings.duration}-${settings.fps}-${settings.width}`;
      let bytes = cache.get(key);
      if (bytes) {
        cache.delete(key);
        cache.set(key, bytes);
      } else {
        let image = pending.get(key);
        if (!image) {
          const release = retainSource(path, id);
          image = schedule(
            () => dependencies.image(path, kind, index, metadata, settings),
            request.signal,
          ).finally(release);
          pending.set(key, image);
          image
            .then(
              (value) => remember(key, value),
              () => {},
            )
            .finally(() => pending.delete(key));
        }
        bytes = await image;
      }
      request.signal.throwIfAborted();
      return new Response(new Uint8Array(bytes).buffer, {
        headers: {
          "Content-Type": kind === "frame" ? "image/webp" : "image/gif",
          "Cache-Control": "public, max-age=60",
          "X-Content-Type-Options": "nosniff",
        },
      });
    } catch (error) {
      if (request.signal.aborted) return fail("request_aborted", 499);
      return error instanceof BusyError
        ? fail("generation_busy", 429)
        : fail("generation_failed", 502);
    }
  };
}
