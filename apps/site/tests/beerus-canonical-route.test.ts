// SPDX-License-Identifier: Apache-2.0
import { expect, test } from "bun:test";
import { DBS_BEERUS_REDIRECTS, DBS_BEERUS_EPISODE_HREF } from "../src/lib/episode-series-catalogue";

test("former Beerus landings converge before rendering without intercepting later episodes", () => {
  expect(DBS_BEERUS_REDIRECTS).toEqual([
    {
      source: "/wiki/episodes/series/DBS_BEERUS",
      destination: "/wiki/episodes/875",
      permanent: true,
    },
    {
      source: "/wiki/episodes/series/DBS_BEERUS/1",
      destination: "/wiki/episodes/875",
      permanent: true,
    },
  ]);
  expect(DBS_BEERUS_REDIRECTS.some(({ source }) => source.endsWith("/2"))).toBe(false);
  expect(DBS_BEERUS_REDIRECTS.some(({ source }) => source === DBS_BEERUS_EPISODE_HREF)).toBe(false);
});
