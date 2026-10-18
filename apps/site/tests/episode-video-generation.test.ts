// SPDX-License-Identifier: Apache-2.0
import { expect, test } from "bun:test";
import {
  createEpisodeTimelineHandler,
  episodeTimelineSource,
  downloadEpisodeVideoSource,
} from "../src/lib/episode-video-generation";
import { tmpdir } from "node:os";
import { join } from "node:path";

const players = [
  { embedUrl: `https://cdn.dragonballfr.com/media/episodes/876/${"a".repeat(64)}/source.mp4` },
];
const metadata = { durationSeconds: 10, fps: 24, frameCount: 240, width: 1920, height: 1080 };
const request = (query = "") =>
  new Request(`https://dragonballfr.com/api/episodes/876/timeline${query}`);
function fixture(overrides = {}) {
  return {
    available: () => true,
    source: async () => "test.mp4",
    metadata: async () => metadata,
    image: async () => new Uint8Array([1, 2]),
    ...overrides,
  };
}

test("only the matching immutable public episode source is accepted", () => {
  expect(episodeTimelineSource(876, players)?.hostname).toBe("cdn.dragonballfr.com");
  expect(episodeTimelineSource(875, players)).toBeNull();
  expect(episodeTimelineSource(877, players)).toBeNull();
  expect(episodeTimelineSource(876, [{ embedUrl: players[0]!.embedUrl + "?secret=x" }])).toBeNull();
});

test("query and frame bounds reject invalid work without decoding", async () => {
  let images = 0;
  const handler = createEpisodeTimelineHandler(
    fixture({
      image: async () => {
        images++;
        return new Uint8Array([1]);
      },
    }),
  );
  for (const query of [
    "?kind=no",
    "?kind=frame",
    "?kind=frame&index=-1",
    "?kind=frame&index=1.5",
    "?kind=frame&index=240",
    "?index=1",
    "?path=secret",
    "?kind=frame&kind=gif&index=0",
  ]) {
    expect((await handler(request(query), 876, players)).status).toBe(400);
  }
  expect(images).toBe(0);
  expect(await (await handler(request(), 876, players)).json()).toEqual(metadata);
});

test("source and generated images are deduplicated and images cached", async () => {
  let sources = 0;
  let images = 0;
  const handler = createEpisodeTimelineHandler(
    fixture({
      source: async () => {
        sources++;
        return "test.mp4";
      },
      image: async () => {
        images++;
        return new Uint8Array([1, 2]);
      },
    }),
  );
  const responses = await Promise.all(
    Array.from({ length: 5 }, () => handler(request("?kind=frame&index=0"), 876, players)),
  );
  expect(responses.every((response) => response.status === 200)).toBe(true);
  expect(responses[0]!.headers.get("content-type")).toBe("image/webp");
  await handler(request("?kind=frame&index=0"), 876, players);
  expect(sources).toBe(1);
  expect(images).toBe(1);
});

test("scheduler limits active jobs and rejects excess queued work", async () => {
  let running = 0;
  let maximum = 0;
  const releases: (() => void)[] = [];
  const handler = createEpisodeTimelineHandler(
    fixture({
      image: async () => {
        running++;
        maximum = Math.max(maximum, running);
        await new Promise<void>((resolve) => releases.push(resolve));
        running--;
        return new Uint8Array([1]);
      },
    }),
  );
  await handler(request(), 876, players);
  const work = Array.from({ length: 15 }, (_, index) =>
    handler(request(`?kind=frame&index=${index}`), 876, players),
  );
  const rejected = await work[14]!;
  expect(rejected.status).toBe(429);
  expect(rejected.headers.get("retry-after")).toBe("2");
  for (let index = 0; index < 14; index++) {
    releases.shift()!();
    await work[index];
  }
  expect(maximum).toBe(2);
});

test("failures stay generic and absent providers do not fetch sources", async () => {
  const absent = createEpisodeTimelineHandler(
    fixture({
      available: () => false,
      source: async () => {
        throw new Error("private path");
      },
    }),
  );
  expect((await absent(request(), 876, players)).status).toBe(503);
  expect((await absent(request(), 876, null)).status).toBe(404);
  const failed = createEpisodeTimelineHandler(
    fixture({
      source: async () => {
        throw new Error("private path");
      },
    }),
  );
  const result = await failed(request(), 876, players);
  expect(result.status).toBe(502);
  expect(await result.json()).toEqual({ error: "generation_failed" });
});

test("aborted callers never schedule new native work", async () => {
  let images = 0;
  const handler = createEpisodeTimelineHandler(
    fixture({
      image: async () => {
        images++;
        return new Uint8Array([1]);
      },
    }),
  );
  const controller = new AbortController();
  controller.abort();
  const response = await handler(
    new Request(request("?kind=gif&index=0"), { signal: controller.signal }),
    876,
    players,
  );
  expect(response.status).toBe(499);
  expect(images).toBe(0);
});

test("byte LRU evicts images beyond its 32 MiB budget", async () => {
  let images = 0;
  const handler = createEpisodeTimelineHandler(
    fixture({
      image: async () => {
        images++;
        return new Uint8Array(17 * 1024 ** 2);
      },
    }),
  );
  for (const index of [0, 1, 0]) {
    const response = await handler(request(`?kind=frame&index=${index}`), 876, players);
    expect(response.status).toBe(200);
    await response.body?.cancel();
  }
  expect(images).toBe(3);
});

test("download verifies status, exact length and hash before exposing the cache file", async () => {
  const bytes = new TextEncoder().encode(`episode-test-${crypto.randomUUID()}`);
  const hash = new Bun.CryptoHasher("sha256").update(bytes).digest("hex");
  const url = new URL(`https://cdn.dragonballfr.com/media/episodes/876/${hash}/source.mp4`);
  const path = join(tmpdir(), "shenron-episode-video", `876-${hash}.mp4`);
  const fetcher = (response: Response) =>
    (async (_input: unknown, init?: RequestInit) => {
      expect(init?.credentials).toBe("omit");
      expect(init?.redirect).toBe("error");
      return response;
    }) as unknown as typeof fetch;
  try {
    for (const response of [
      new Response(bytes, { status: 206 }),
      new Response(bytes, { headers: { "content-length": "NaN" } }),
      new Response(bytes, { headers: { "content-length": "-1" } }),
      new Response(bytes, { headers: { "content-length": String(bytes.length + 1) } }),
      new Response(new Uint8Array([1]), { headers: { "content-length": "1" } }),
    ]) {
      await expect(downloadEpisodeVideoSource(url, 876, hash, fetcher(response))).rejects.toThrow();
      expect(await Bun.file(path).exists()).toBe(false);
    }
    expect(
      await downloadEpisodeVideoSource(
        url,
        876,
        hash,
        fetcher(new Response(bytes, { headers: { "content-length": String(bytes.length) } })),
      ),
    ).toBe(path);
    expect(await Bun.file(path).bytes()).toEqual(bytes);
    expect(
      await downloadEpisodeVideoSource(url, 876, hash, (async () => {
        throw new Error("cache avoids network");
      }) as unknown as typeof fetch),
    ).toBe(path);
  } finally {
    await Bun.file(path)
      .delete()
      .catch(() => {});
  }
});

test("a failed download stream leaves no completed source", async () => {
  const hash = "f".repeat(64);
  const url = new URL(`https://cdn.dragonballfr.com/media/episodes/876/${hash}/source.mp4`);
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.error(new Error("broken network"));
    },
  });
  await expect(
    downloadEpisodeVideoSource(
      url,
      876,
      hash,
      (async () => new Response(stream)) as unknown as typeof fetch,
    ),
  ).rejects.toThrow();
  expect(await Bun.file(join(tmpdir(), "shenron-episode-video", `876-${hash}.mp4`)).exists()).toBe(
    false,
  );
});
