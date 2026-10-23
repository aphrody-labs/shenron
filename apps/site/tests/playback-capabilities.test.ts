import { expect, test } from "bun:test";
import { createPlaybackCapabilityReader } from "../src/lib/playback-capabilities";

test("one global declaration is coalesced, cached 30 seconds, and expires closed", async () => {
  let now = 0;
  let requests = 0;
  const read = createPlaybackCapabilityReader(
    async () => {
      requests++;
      if (requests > 1) throw new Error("offline");
      return { episodeOnDemand: true };
    },
    () => now,
  );
  const batch = await Promise.all([read(), read(), read()]);
  expect(requests).toBe(1);
  expect(batch.every((value) => value.episodeOnDemand)).toBe(true);
  now = 29_999;
  expect((await read()).episodeOnDemand).toBe(true);
  expect(requests).toBe(1);
  now = 30_000;
  expect((await read()).episodeOnDemand).toBe(false);
  expect(requests).toBe(2);
  await read();
  expect(requests).toBe(2);
});
