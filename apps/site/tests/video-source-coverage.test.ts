// SPDX-License-Identifier: Apache-2.0
import { expect, test } from "bun:test";
import { summarizeVideoSources } from "@/lib/video-source-coverage";

test("separates licensed offers, external readers and original audio", () => {
  const coverage = summarizeVideoSources(
    [{ lang: "vf" }, { lang: "vostfr" }],
    [
      {
        provider: "ADN",
        label: "ADN",
        url: "https://google.com/watch",
        embedUrl: null,
        langs: ["vostfr"],
        available: true,
        checkedAt: 1,
      },
      {
        provider: "Withdrawn",
        label: "Withdrawn",
        url: "https://google.com/old",
        embedUrl: null,
        langs: ["vf"],
        available: false,
        checkedAt: 2,
      },
    ],
  );

  expect(coverage).toEqual({
    players: { vf: true, vostfr: true, vost: false },
    official: { vf: false, vostfr: true, vost: false },
    originalAudio: { players: true, official: true },
  });
});
