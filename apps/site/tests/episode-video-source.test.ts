// SPDX-License-Identifier: Apache-2.0
import { expect, test, mock } from "bun:test";
import { approvedEpisodeVideoURL, nativeEpisodeVideoSource } from "../src/lib/episode-video-source";
import { GET, HEAD } from "../src/app/api/media/video/route";
const source = "https://27.mugiwara.one/dbs/dbs-1.mp4";
const shenronSource = "https://cdn.dragonballfr.com/media/episodes/beerus-01/optimized-720p.mp4";

test("published Beerus sources use immutable episode-specific paths", () => {
  const hash = "a".repeat(64);
  for (const id of [875, 876, 877]) {
    const url = `https://cdn.dragonballfr.com/media/episodes/${id}/${hash}/source.mp4`;
    expect(approvedEpisodeVideoURL(url)?.href).toBe(url);
    expect(nativeEpisodeVideoSource(url)).toBe(url);
    expect(approvedEpisodeVideoURL(url + "?token=private")).toBeNull();
  }
  for (const path of [
    `878/${hash}/source.mp4`,
    "876/not-a-hash/source.mp4",
    `876/${hash}/other.mp4`,
  ])
    expect(
      approvedEpisodeVideoURL(`https://cdn.dragonballfr.com/media/episodes/${path}`),
    ).toBeNull();
});
test("approved MP4 uses the same-origin range transport while other sources retain their owner", () => {
  const local = nativeEpisodeVideoSource(source);
  expect(local.startsWith("/api/media/video?")).toBe(true);
  expect(new URL(local, "https://dragonballfr.com").searchParams.get("source")).toBe(source);
  expect(approvedEpisodeVideoURL(shenronSource)?.href).toBe(shenronSource);
  expect(nativeEpisodeVideoSource(shenronSource)).toBe(shenronSource);
  for (const url of [
    "/api/hls/1/master.m3u8",
    "https://cdn.dragonballfr.com/movie.mp4",
    "https://www.crunchyroll.com/watch/example",
  ])
    expect(nativeEpisodeVideoSource(url)).toBe(url);
  for (const url of [
    source + "?token=private",
    "https://user:pass@27.mugiwara.one/dbs/dbs-1.mp4",
    "https://27.mugiwara.one/../private",
    "https://foreign.example/dbs/dbs-1.mp4",
    shenronSource + "?token=private",
    "https://cdn.dragonballfr.com/media/episodes/beerus-01/source.mp4",
  ])
    expect(approvedEpisodeVideoURL(url)).toBeNull();
});
test("the media route refuses unapproved destinations before network access", async () => {
  expect(
    (await GET(new Request("https://dragonballfr.com/api/media/video?source=https://127.0.0.1/")))
      .status,
  ).toBe(404);
});
test("byte ranges stream through without forwarding application credentials", async () => {
  const previous = globalThis.fetch;
  let forwarded: RequestInit | undefined;
  globalThis.fetch = mock(async (_url: unknown, options?: RequestInit) => {
    forwarded = options;
    return new Response(new Uint8Array([1, 2, 3, 4]), {
      status: 206,
      headers: {
        "content-type": "video/mp4",
        "content-length": "4",
        "content-range": "bytes 4-7/12",
      },
    });
  }) as unknown as typeof fetch;
  try {
    const response = await GET(
      new Request("https://dragonballfr.com" + nativeEpisodeVideoSource(source), {
        headers: {
          Range: "bytes=4-7",
          Authorization: "Bearer application-session",
          Cookie: "session=private",
        },
      }),
    );
    expect(response.status).toBe(206);
    expect(response.headers.get("content-range")).toBe("bytes 4-7/12");
    expect([...new Uint8Array(await response.arrayBuffer())]).toEqual([1, 2, 3, 4]);
    expect(new Headers(forwarded?.headers).get("range")).toBe("bytes=4-7");
    expect(new Headers(forwarded?.headers).get("authorization")).toBeNull();
    expect(new Headers(forwarded?.headers).get("cookie")).toBeNull();
    expect(HEAD).toBe(GET);
  } finally {
    globalThis.fetch = previous;
  }
});
