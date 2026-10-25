// SPDX-License-Identifier: Apache-2.0
import { describe, expect, test } from "bun:test";
import {
  boundedMap,
  extractCrunchyrollEpisode3,
  extractOfficialEpisode3,
  maxWorkers,
  observeSource,
  parseOptions,
  publicUrl,
  snapshotFingerprint,
  SOURCES,
} from "./beerus-episode-monitor";

const source = "https://dragonball-super.com/";
test("Shenron identity uses the public API episode number field", async () => {
  const result = await observeSource(SOURCES[4], async () =>
    Response.json({ id: 877, series: "DBS_BEERUS", numberInSeries: 3 }),
  );
  expect(result.facts).toEqual({
    requestedId: 877,
    returnedId: 877,
    series: "DBS_BEERUS",
    number: 3,
  });
});
describe("official episode 3 evidence", () => {
  test("rejects episode 1/2 text and commented episode 3", async () => {
    const html =
      '<div id="ep-02"><div class="str-txt"><h4>Episode 2</h4>Old synopsis</div><img src="img/story/st03-01.jpg"></div><!-- <div id="ep-03"><div class="str-txt"><h4>Fake</h4>Comment</div></div> -->';
    expect(await extractOfficialEpisode3(html, source, "ja")).toBeNull();
  });
  test("extracts local exact episode container only, strips comments and title", async () => {
    const html =
      '<div id="ep-01"><div class="str-txt">Wrong</div></div><div id="ep-03"><div class="str-txt"><h4>破壊神地球へ</h4> 地球へ向かう。<!-- fake --> </div><img src="img/story/st03-01.jpg"><img src="img/story/st02-01.jpg"><img src="https://foreign.example/img/story/st03-02.jpg"><img src="img/story/st03-03.jpg?token=secret"></div>';
    expect(await extractOfficialEpisode3(html, source, "ja")).toEqual({
      episode: 3,
      lang: "ja",
      source,
      title: "破壊神地球へ",
      synopsis: "地球へ向かう。",
      images: [`${source}img/story/st03-01.jpg`],
      watchUrls: [],
    });
  });
  test("rejects duplicate episode containers", async () => {
    expect(
      await extractOfficialEpisode3(
        '<div id="ep-03"><div class="str-txt">A</div></div><div id="ep-03"></div>',
        source,
        "en",
      ),
    ).toBeNull();
  });
});
test("rejects signed, credentialed and non-HTTPS links", () => {
  for (const value of [
    "/image.jpg?X-Amz-Signature=secret",
    "https://user:secret@example.com/a",
    "http://example.com/a",
    "javascript:alert(1)",
  ])
    expect(publicUrl(value, source)).toBeNull();
});
test("watch links require explicit episode number 3 evidence", async () => {
  const html =
    '<a href="/watch/WRONG/episode-3">Episode 3</a><div data-episode-number="2"><a href="/watch/OTHER/episode-3">Wrong</a></div><!--<div data-episode-number="3"><a href="/watch/FAKE">fake</a></div>--><div data-episode-number="3"><a href="/fr/watch/OBSERVED/episode-3">E3</a><a href="/watch/SIGNED?token=secret">signed</a></div><script type="application/ld+json">{"@type":"TVEpisode","episodeNumber":3,"url":"https://www.crunchyroll.com/watch/STRUCTURED/episode-3"}</script>';
  expect(await extractCrunchyrollEpisode3(html, "https://www.crunchyroll.com/")).toEqual([
    "https://www.crunchyroll.com/fr/watch/OBSERVED/episode-3",
    "https://www.crunchyroll.com/watch/STRUCTURED/episode-3",
  ]);
});
test("fingerprint ignores observation time and object insertion order", () => {
  expect(snapshotFingerprint({ observedAt: "A", facts: { title: "T", number: 3 } })).toBe(
    snapshotFingerprint({ facts: { number: 3, title: "T" }, observedAt: "B" }),
  );
  expect(snapshotFingerprint({ title: "T" })).not.toBe(snapshotFingerprint({ title: "U" }));
});
test("worker count never exceeds four and results retain source order", async () => {
  let active = 0;
  let peak = 0;
  const result = await boundedMap([0, 1, 2, 3, 4, 5, 6], 99, async (value) => {
    active++;
    peak = Math.max(peak, active);
    await Bun.sleep(3);
    active--;
    return value * 2;
  });
  expect(peak).toBe(4);
  expect(result).toEqual([0, 2, 4, 6, 8, 10, 12]);
  expect(maxWorkers(0)).toBe(1);
  expect(maxWorkers(Number.NaN)).toBe(4);
});
test("403 and challenge responses never become candidates", async () => {
  const cr = SOURCES[3];
  const denied = await observeSource(cr, () =>
    Promise.resolve(new Response("challenge", { status: 403 })),
  );
  expect(denied.status).toBe("access-blocked");
  expect(denied.candidate).toBeNull();
  const challenge = await observeSource(cr, () =>
    Promise.resolve(new Response("Just a moment... cf-chl")),
  );
  expect(challenge.status).toBe("access-blocked");
  expect(challenge.candidate).toBeNull();
});
test("network failures are isolated and oversized bodies rejected", async () => {
  const failed = await observeSource(SOURCES[0], () =>
    Promise.reject(new Error("secret URL not logged")),
  );
  expect(failed.status).toBe("network-or-parse-error");
  expect(JSON.stringify(failed)).not.toContain("secret URL");
  const oversized = await observeSource(SOURCES[0], () =>
    Promise.resolve(new Response("x", { headers: { "content-length": String(3 * 1024 * 1024) } })),
  );
  expect(oversized.status).toBe("body-limit");
});
test("CLI requires once and absolute output; clamps requested workers", () => {
  const out = process.platform === "win32" ? "C:/reports/beerus" : "/tmp/beerus";
  expect(parseOptions(["--once", "--out", out, "--workers", "40"])).toEqual({ out, workers: 4 });
  expect(() => parseOptions(["--out", out])).toThrow("--once");
  expect(() => parseOptions(["--once", "--out", "relative"])).toThrow("absolute");
});

test("streaming body limit applies without a content-length header", async () => {
  let cancelled = false;
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      controller.enqueue(new Uint8Array(1024 * 1024));
    },
    cancel() {
      cancelled = true;
    },
  });
  const result = await observeSource(SOURCES[0], async () => new Response(stream));
  expect(result.status).toBe("body-limit");
  expect(cancelled).toBe(true);
});

test("foreign probes omit credentials and never follow redirects", async () => {
  const result = await observeSource(SOURCES[0], async (url, init) => {
    expect(url).toBe(SOURCES[0].url);
    expect(init.credentials).toBe("omit");
    expect(init.redirect).toBe("manual");
    const headers = new Headers(init.headers);
    expect(headers.has("authorization")).toBe(false);
    expect(headers.has("cookie")).toBe(false);
    expect(init.signal).toBeInstanceOf(AbortSignal);
    return new Response(null, {
      status: 302,
      headers: { location: "https://foreign.example/?token=secret" },
    });
  });
  expect(result.status).toBe("http-error");
  expect(JSON.stringify(result)).not.toContain("secret");
});
