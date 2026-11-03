// SPDX-License-Identifier: Apache-2.0
import { afterAll, beforeEach, expect, mock, test } from "bun:test";
let admin = true;
let authDown = false;
let calls = 0;
let commitDown = false;
let cacheDown = false;
mock.module("@/lib/session", () => ({
  isCurrentUserAdmin: async () => {
    if (authDown) throw new Error("Auth down");
    return admin;
  },
  getCurrentUser: async () => null,
  revisionActorOf: () => ({ id: null, name: "Admin fixture" }),
}));
mock.module("next/cache", () => ({
  revalidatePath: () => {
    if (cacheDown) throw new Error("Cache down");
  },
}));
mock.module("@/lib/card-image-import", () => ({
  CardImageImportError: class extends Error {},
  importCardImages: async (input: { intent: string; lang: string }) => {
    calls++;
    if (commitDown) throw new Error("Driver internals and private values");
    return { intent: input.intent, lang: input.lang, updated: input.intent === "commit" ? 1 : 0 };
  },
}));
mock.module("@/lib/card-image-restore", () => ({
  restoreCardImages: async (input: { intent: string; lang: string }) => {
    calls++;
    return { intent: input.intent, lang: input.lang };
  },
}));
const { POST } = await import("../src/app/api/admin/cards/images/route");
const item = {
  setId: "set-ja",
  cardNumber: "A-001",
  language: "ja",
  region: "JP",
  frontImageUrl: `https://cdn.dragonballfr.com/publications/carddass-reviewed/objects/${"a".repeat(64)}.png`,
  frontImageWidth: 172,
  frontImageHeight: 250,
  frontImageSourceUrl: "https://www.carddass.com/dbh/cardlist/A-001.png",
  frontImageRights: "Owner-authorized catalogue thumbnail",
  sha256: "a".repeat(64),
};
const request = (body: unknown) =>
  new Request("https://dragonballfr.com/api/admin/cards/images", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
const oldError = console.error;
beforeEach(() => {
  admin = true;
  authDown = false;
  calls = 0;
  commitDown = false;
  cacheDown = false;
  console.error = () => {};
});
afterAll(() => {
  console.error = oldError;
});
test("anonymous writes and authentication outages never enter the publisher and stay private", async () => {
  admin = false;
  const denied = await POST(request({ intent: "preview", items: [item] }));
  expect(denied.status).toBe(403);
  expect(denied.headers.get("cache-control")).toBe("private, no-store");
  expect(calls).toBe(0);
  authDown = true;
  expect((await POST(request({}))).status).toBe(503);
  expect(calls).toBe(0);
});

test("historical restore accepts only persisted revision IDs and never a forged image or writer override", async () => {
  for (const payload of [
    {
      intent: "restore-preview",
      items: [{ revisionId: "saved", frontImageUrl: "https://foreign.example/private.png" }],
    },
    {
      intent: "restore-preview",
      items: [{ revisionId: "saved" }],
      restoreEpisodeRevisionId: "forged",
    },
    { intent: "preview", items: [item], historicalFrames: true },
  ])
    expect((await POST(request(payload))).status).toBe(400);
  expect(calls).toBe(0);
  expect(
    (await POST(request({ intent: "restore-preview", items: [{ revisionId: "saved" }] }))).status,
  ).toBe(200);
});
test("streamed and announced oversized manifests plus unknown metadata are rejected before the writer", async () => {
  expect(
    (await POST(request({ intent: "preview", items: [{ ...item, status: "published" }] }))).status,
  ).toBe(400);
  expect((await POST(request({ padding: "a".repeat(800001) }))).status).toBe(413);
  expect(
    (
      await POST(
        new Request("https://localhost", {
          method: "POST",
          headers: { "content-length": "800001" },
        }),
      )
    ).status,
  ).toBe(413);
  expect(calls).toBe(0);
});
test("localized preview succeeds while storage failures are retryable without driver details", async () => {
  const preview = await POST(request({ intent: "preview", lang: "ja", items: [item] }));
  expect(preview.status).toBe(200);
  expect(await preview.json()).toMatchObject({ intent: "preview", lang: "ja" });
  commitDown = true;
  const failed = await POST(request({ intent: "preview", items: [item] }));
  expect(failed.status).toBe(503);
  expect(await failed.text()).not.toContain("Driver internals");
});
test("post-commit cache errors cannot turn a recorded publication into a false failure", async () => {
  cacheDown = true;
  const response = await POST(
    request({
      intent: "commit",
      items: [{ ...item, expectedSha256: "b".repeat(64) }],
      planSha256: "c".repeat(64),
    }),
  );
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({
    intent: "commit",
    updated: 1,
    cacheInvalidated: false,
  });
});
