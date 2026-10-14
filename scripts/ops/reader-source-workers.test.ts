// SPDX-License-Identifier: Apache-2.0
import { expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import {
  frontier,
  hash,
  publishQualified,
  sourcePlan,
  tokyoExit,
  verifyDom,
  publicationIndexPath,
  deadOwner,
} from "./reader-source-workers";
const url = "https://www.shueisha.co.jp/books/items/contents_amp.html?isbn=978-4-08-851182-5";
const source = {
  sourceUrl: url,
  sourceObservedStatus: 200 as const,
  sourceCaptureVerified: true as const,
};
test("sources require the exact independently captured primary URL", () => {
  expect(sourcePlan([source])).toEqual([source]);
  for (const changed of [
    { sourceUrl: "https://glenat.com.example.org/" },
    { sourceUrl: "https://user:secret@www.glenat.com/" },
    { sourceUrl: "http://www.glenat.com/" },
    { sourceUrl: "https://www.glenat.com:8443/" },
    { sourceCaptureVerified: false },
    { sourceObservedStatus: 404 },
  ]) {
    expect(() => sourcePlan([{ ...source, ...changed }])).toThrow();
  }
  expect(() => sourcePlan([source, source])).toThrow();
  expect(() => sourcePlan([], 0)).toThrow();
  expect(
    sourcePlan([{ ...source, sourceUrl: "https://www.hanmoto.com/bd/isbn/9784088511825" }])[0]
      ?.sourceUrl,
  ).toContain("www.hanmoto.com/bd/");
});
test("Tokyo exit requires native country, city and exit proof", () => {
  expect(
    tokyoExit(JSON.stringify({ country: "Japan", city: "Tokyo", mullvad_exit_ip: true })),
  ).toEqual({ country: "Japan", city: "Tokyo", mullvadExit: true });
  for (const changed of [{ country: "France" }, { city: "Osaka" }, { mullvad_exit_ip: false }])
    expect(() =>
      tokyoExit(
        JSON.stringify({ country: "Japan", city: "Tokyo", mullvad_exit_ip: true, ...changed }),
      ),
    ).toThrow();
});
test("a loaded error page or a redirect cannot qualify the source", () => {
  const dom = { url, title: "Dr. Slump", text: "Original official source. ".repeat(10) };
  expect(verifyDom(dom, url).title).toBe("Dr. Slump");
  for (const changed of [
    { url: "https://www.shueisha.co.jp/" },
    { title: "403 Access Denied" },
    { title: "404 Not Found" },
    { text: "Loading" },
  ])
    expect(() => verifyDom({ ...dom, ...changed }, url)).toThrow();
});
test("frontier claims once, resumes terminal states and refuses a different plan", () => {
  const db = new Database(":memory:");
  try {
    const q = frontier(db, [source], hash("plan"));
    expect(q.next()).toBe(url);
    expect(q.next()).toBeUndefined();
    q.complete(url, hash("receipt"));
    const resumed = frontier(db, [source], hash("plan"));
    expect(resumed.next()).toBeUndefined();
    expect(resumed.rows()[0]?.receipt_sha).toBe(hash("receipt"));
    expect(() => frontier(db, [source], hash("another plan"))).toThrow();
  } finally {
    db.close();
  }
});
test("interrupted frontier resumes only after its exact owner is proved absent", () => {
  const db = new Database(":memory:");
  try {
    const q = frontier(db, [source], hash("plan"));
    q.next();
    expect(() => q.recoverInterrupted(false)).toThrow();
    expect(q.recoverInterrupted(true)).toEqual([url]);
    expect(q.next()).toBe(url);
  } finally {
    db.close();
  }
  const prior = {
    schema: "shenron-reader-worker-claim/v1",
    identity: hash("plan"),
    host: "factory",
    pid: 1234,
  };
  expect(deadOwner(prior, hash("plan"), "factory", () => false)).toBe(1234);
  expect(() => deadOwner(prior, hash("plan"), "factory", () => true)).toThrow();
  expect(() => deadOwner(prior, hash("different"), "factory", () => false)).toThrow();
  expect(() => deadOwner(prior, hash("plan"), "another-host", () => false)).toThrow();
});
test("settled aborted workers leave unfinished URLs resumable and preserve terminal receipts", () => {
  const db = new Database(":memory:");
  const sources = [
    source,
    { ...source, sourceUrl: url + "&edition=2" },
    { ...source, sourceUrl: url + "&edition=3" },
  ];
  try {
    const q = frontier(db, sources, hash("stopped-run"));
    q.complete(q.next()!, hash("verified-receipt"));
    q.fail(q.next()!);
    const unfinished = q.next()!;
    expect(q.finishStoppedRun()).toEqual([unfinished]);
    const resumed = frontier(db, sources, hash("stopped-run"));
    expect(resumed.recoverInterrupted(false)).toEqual([]);
    expect(resumed.next()).toBe(unfinished);
    expect(resumed.rows()[0]?.receipt_sha).toBe(hash("verified-receipt"));
    expect(resumed.rows()[1]?.state).toBe("failed");
  } finally {
    db.close();
  }
});
test("publication uses the canonical nested public-root shape", () => {
  const root = "/qualified/public";
  const expected = publicationIndexPath(
    root,
    "https://dragonballfr.com/publications/manga-catalogue",
  ).replaceAll("\\", "/");
  const fixture = new Map([
    ["/qualified/public/index.json", "incorrect flat index"],
    [
      "/qualified/public/publications/manga-catalogue/index.json",
      JSON.stringify({ schema: "qualified-index", sources: [source] }),
    ],
  ]);
  expect(JSON.parse(fixture.get(expected)!).schema).toBe("qualified-index");
  expect(() =>
    publicationIndexPath(root, "https://dragonballfr.com/publications/../private"),
  ).toThrow();
});
test("publisher pins the native plan and requires independent live readback", async () => {
  let calls = 0;
  const identity = hash("qualified plan");
  await expect(
    publishQualified({
      plan: async () => ({ planSha256: "" }),
      apply: async () => {
        calls++;
      },
      readback: async () => true,
    }),
  ).rejects.toThrow();
  expect(calls).toBe(0);
  await expect(
    publishQualified({
      plan: async () => ({ planSha256: identity }),
      apply: async (sha) => {
        expect(sha).toBe(identity);
        return { receipt: true };
      },
      readback: async () => false,
    }),
  ).rejects.toThrow();
  expect(
    await publishQualified({
      plan: async () => ({ planSha256: identity }),
      apply: async () => ({ receipt: true }),
      readback: async (r) => Bun.deepEquals(r, { receipt: true }),
    }),
  ).toEqual({ receipt: true });
});
