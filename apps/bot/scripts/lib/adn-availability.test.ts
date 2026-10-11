// SPDX-License-Identifier: Apache-2.0
import { describe, expect, test } from "bun:test";
import { adnLanguages, collectAdnVideos, mergeAdnOffer, videoNumber } from "./adn-availability";

const video = (id: number) => ({
  id,
  title: "Episode",
  shortNumber: String(id),
  url: `https://animationdigitalnetwork.com/video/${id}`,
  embeddedUrl: null,
  languages: ["vf"],
  available: true,
  duration: null,
});

describe("ADN availability snapshots", () => {
  test("a failed second page never becomes a complete empty catalogue", async () => {
    let calls = 0;
    await expect(
      collectAdnVideos(
        999,
        async () => {
          if (calls++ === 0) return { videos: Array.from({ length: 100 }, (_, i) => video(i + 1)) };
          throw new Error("HTTP 503");
        },
        "https://adn.invalid",
      ),
    ).rejects.toThrow("HTTP 503");
  });
  test("rejects malformed snapshots and foreign destinations", async () => {
    await expect(collectAdnVideos(999, async () => ({}), "https://adn.invalid")).rejects.toThrow(
      "invalid catalogue",
    );
    await expect(
      collectAdnVideos(
        999,
        async () => ({ videos: [{ ...video(1), url: "https://foreign.invalid/watch" }] }),
        "https://adn.invalid",
      ),
    ).rejects.toThrow("unexpected offer");
  });
  test("pagination and positive availability survive collection", async () => {
    let calls = 0;
    const result = await collectAdnVideos(
      999,
      async () => ({
        videos:
          calls++ === 0
            ? Array.from({ length: 100 }, (_, i) => video(i + 1))
            : [{ ...video(101), available: false }],
      }),
      "https://adn.invalid",
    );
    expect(result.length).toBe(101);
    expect(result[100]?.available).toBe(false);
  });
  test("French subtitle evidence excludes other regional subtitle tracks", () => {
    expect(adnLanguages(["vf", "vostf", "vostde", "vostpl"])).toEqual(["vf", "vostfr"]);
    expect(adnLanguages(["vostde"])).toEqual([]);
    expect(videoNumber(null)).toBeNull();
    expect(videoNumber("")).toBeNull();
    expect(videoNumber("0")).toBeNull();
    expect(videoNumber("98")).toBe(98);
  });
  test("retraction preserves other providers without manufacturing an offer", () => {
    const other = { provider: "netflix", url: "https://netflix.com/title/1" };
    expect(mergeAdnOffer([{ provider: "adn" }, other], null)).toEqual([other]);
    expect(mergeAdnOffer(null, null)).toEqual([]);
  });
});
