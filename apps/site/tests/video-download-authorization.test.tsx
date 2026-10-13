// SPDX-License-Identifier: Apache-2.0
import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { GET as episodeDownload } from "../src/app/api/episodes/[id]/download/route";
import { GET as movieDownload } from "../src/app/api/movies/[id]/download/route";
import { EpisodeDownload } from "../src/components/episodes/EpisodeDownload";

test("episode and film downloads fail closed without a publication grant", async () => {
  for (const [kind, handler] of [
    ["episodes", episodeDownload],
    ["movies", movieDownload],
  ] as const) {
    const response = await handler(
      new Request(`https://dragonballfr.com/api/${kind}/875/download`),
    );
    expect(response.status).toBe(404);
    expect(response.headers.get("location")).toBeNull();
    expect(response.headers.get("cache-control")).toBe("no-store");
  }
});

test("download controls remain absent from cached public pages", () => {
  const html = renderToStaticMarkup(
    <EpisodeDownload
      href="/api/episodes/875/download"
      signinCallback="/wiki/episodes/875"
      title="Episode 875"
    />,
  );
  expect(html).toBe("");
});
