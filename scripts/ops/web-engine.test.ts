// SPDX-License-Identifier: Apache-2.0
import { expect, test } from "bun:test";
import {
  claim,
  enqueue,
  extract,
  fetchLadder,
  isChallenge,
  openDb,
  parseArgs,
  stats,
} from "./web-engine";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const home = () => mkdtempSync(join(tmpdir(), "engine-"));

test("extract finds title, links, text and image assets", () => {
  const page = extract(
    `<title> A </title><a href="/b#x">b</a><img src="/i.png"><img src="/t.svg"><video src="v.mp4"></video><p>Hello&nbsp;world</p>`,
    "https://e.test/a/",
  );
  expect(page.title).toBe("A");
  expect(page.links).toEqual(["https://e.test/b#x"]);
  expect(page.assets).toEqual([
    ["https://e.test/i.png", "image"],
    ["https://e.test/a/v.mp4", "video"],
  ]);
  expect(page.text).toContain("Hello world");
});

test("claim honors the per-host cap and marks rows running", () => {
  const db = openDb(home());
  enqueue(
    db,
    [
      "https://a.test/1",
      "https://a.test/2",
      "https://a.test/3",
      "https://b.test/1",
      "mailto:x@y",
      "https://a.test/1#dup",
    ],
    0,
  );
  const got = claim(db, 10, 2);
  expect(got.map((r) => r.url).toSorted()).toEqual([
    "https://a.test/1",
    "https://a.test/2",
    "https://b.test/1",
  ]);
  expect(stats(db).frontier).toContainEqual({ state: "running", n: 3 });
});

test("challenge pages are detected", () => {
  expect(isChallenge(403, "<title>Just a moment...</title>")).toBe(true);
  expect(isChallenge(200, "<html>" + "x".repeat(7000) + "</html>")).toBe(false);
});

test("the ladder skips failing tiers and records them", async () => {
  using server = Bun.serve({
    port: 0,
    fetch: () =>
      new Response("<title>ok</title>" + "p".repeat(10), {
        headers: { "content-type": "text/html" },
      }),
  });
  const ok = await fetchLadder(`http://localhost:${server.port}/`, ["fetch"]);
  expect(ok.result?.html).toContain("ok");
  const none = await fetchLadder("http://127.0.0.1:1/", ["fetch"]);
  expect(none.result).toBeUndefined();
  expect(none.notes[0]).toStartWith("fetch:");
});

test("parseArgs collects repeated flags", () => {
  const a = parseArgs(["--seed", "x", "--seed", "y", "--publish", "--workers", "3"]);
  expect(a.flags.get("seed")).toEqual(["x", "y"]);
  expect(a.bare.has("publish")).toBe(true);
  expect(a.num("workers", 1)).toBe(3);
});
