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
