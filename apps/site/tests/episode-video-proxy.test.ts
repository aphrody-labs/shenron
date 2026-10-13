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
