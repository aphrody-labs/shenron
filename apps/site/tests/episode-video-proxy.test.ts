// SPDX-License-Identifier: Apache-2.0
import { expect, test } from "bun:test";
import {
  approvedEpisodeVideoURL,
  validEpisodeVideoRange,
  streamEpisodeVideo,
} from "../src/lib/episode-video-proxy";

const source = "https://27.mugiwara.one/dbs/dbs-1.mp4";
test("only the owner supplied clear video origin is forwarded", () => {
  expect(approvedEpisodeVideoURL(source)?.href).toBe(source);
  expect(approvedEpisodeVideoURL("http://27.mugiwara.one/dbs/dbs-1.mp4")).toBeNull();
  expect(approvedEpisodeVideoURL(source + "?token=private")).toBeNull();
  expect(approvedEpisodeVideoURL("https://27.mugiwara.one/")).toBeNull();
});
test("native single byte ranges retain seek and metadata semantics", () => {
  for (const range of [null, "bytes=0-1023", "bytes=1024-", "bytes=-1024"])
    expect(validEpisodeVideoRange(range)).toBe(true);
  for (const range of ["bytes=0-1,4-5", "bytes=-", "bytes=-0", "bytes=20-10", "bytes=2147483648-"])
    expect(validEpisodeVideoRange(range)).toBe(false);
});
test("unapproved and malformed requests fail before any upstream network call", async () => {
  expect(
    (await streamEpisodeVideo(new Request("https://dragonballfr.com/api/episodes/875/video"), null))
      .status,
  ).toBe(404);
  expect(
    (
      await streamEpisodeVideo(
        new Request("https://dragonballfr.com/api/episodes/875/video", {
          headers: { Range: "bytes=0-1,4-5" },
        }),
        source,
      )
    ).status,
  ).toBe(416);
});

async function withUpstream<T>(
  respond: (url: string, init: RequestInit) => Response,
  run: () => Promise<T>,
): Promise<T> {
  const original = globalThis.fetch;
  globalThis.fetch = ((input: string | URL | Request, init: RequestInit = {}) =>
    Promise.resolve(respond(String(input), init))) as typeof fetch;
  try {
    return await run();
  } finally {
    globalThis.fetch = original;
  }
}
const mp4Headers = (extra: Record<string, string>) => ({ "Content-Type": "video/mp4", ...extra });

test("a satisfied range is forwarded as 206 with its Content-Range and no stored cache", async () => {
  const body = new Uint8Array(100).fill(7);
  const response = await withUpstream(
    (_url, init) => {
      expect((init.headers as Record<string, string>).Range).toBe("bytes=0-99");
      return new Response(body, {
        status: 206,
        headers: mp4Headers({ "Content-Length": "100", "Content-Range": "bytes 0-99/1000" }),
      });
    },
    () =>
      streamEpisodeVideo(
        new Request("https://dragonballfr.com/api/episodes/875/video", {
          headers: { Range: "bytes=0-99" },
        }),
        source,
      ),
  );
  expect(response.status).toBe(206);
  expect(response.headers.get("content-range")).toBe("bytes 0-99/1000");
  expect(response.headers.get("accept-ranges")).toBe("bytes");
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(new Uint8Array(await response.arrayBuffer())).toEqual(body);
});

test("an origin that ignores Range is reported as not seekable", async () => {
  const response = await withUpstream(
    () =>
      new Response(new Uint8Array(10), {
        status: 200,
        headers: mp4Headers({ "Content-Length": "10" }),
      }),
    () =>
      streamEpisodeVideo(
        new Request("https://dragonballfr.com/api/episodes/875/video", {
          headers: { Range: "bytes=5-" },
        }),
        source,
      ),
  );
  expect(response.status).toBe(200);
  expect(response.headers.get("accept-ranges")).toBe("none");
  await response.arrayBuffer();
});

test("a non-MP4 or truncated origin is refused instead of streamed", async () => {
  const wrongType = await withUpstream(
    () =>
      new Response("<html></html>", {
        status: 200,
        headers: { "Content-Type": "text/html", "Content-Length": "13" },
      }),
    () =>
      streamEpisodeVideo(new Request("https://dragonballfr.com/api/episodes/875/video"), source),
  );
  expect(wrongType.status).toBe(502);
  const truncated = await withUpstream(
    () =>
      new Response(new Uint8Array(5), {
        status: 200,
        headers: mp4Headers({ "Content-Length": "10" }),
      }),
    () =>
      streamEpisodeVideo(new Request("https://dragonballfr.com/api/episodes/875/video"), source),
  );
  await expect(truncated.arrayBuffer()).rejects.toThrow();
});
