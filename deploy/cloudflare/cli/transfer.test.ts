// SPDX-License-Identifier: Apache-2.0
import { expect, test } from "bun:test";
import { inventory, within, verifiedHeaders, credentialFingerprint, ByteBudget } from "./transfer";
const entry = {
  path: "/assets/a.png",
  sha256: "a".repeat(64),
  size: 12,
  sourcePath: process.platform === "win32" ? "C:/public/a.png" : "/public/a.png",
  contentType: "image/png",
};
test("changed inventory or path traversal cannot reach provider", () => {
  expect(inventory([entry])).toHaveLength(1);
  expect(() => inventory([{ ...entry, path: "/assets/../private" }])).toThrow();
  expect(() => inventory([{ ...entry, size: 34 * 1024 * 1024 }])).toThrow();
  expect(() => inventory([entry, entry])).toThrow();
});
test("verifier must attest exact digest and size", () => {
  expect(
    verifiedHeaders(
      new Response(null, {
        status: 200,
        headers: { "X-Content-SHA256": entry.sha256, "X-Content-Size": "12" },
      }),
      entry,
    ),
  ).toBe(true);
  expect(
    verifiedHeaders(
      new Response(null, {
        status: 200,
        headers: { "X-Content-SHA256": "b".repeat(64), "Content-Length": "12" },
      }),
      entry,
    ),
  ).toBe(false);
});
test("session renewal refreshes client even when access key ID remains same", () => {
  const p = {
    accessKeyId: "fixture",
    secretAccessKey: "fixture",
    sessionToken: "first",
    expiresAt: "2026-10-11T12:00:00Z",
  };
  expect(credentialFingerprint(p)).not.toBe(
    credentialFingerprint({ ...p, sessionToken: "second" }),
  );
});
test("byte budget prevents impossible reservation and balances failed work", async () => {
  const b = new ByteBudget(12);
  await b.reserve(12);
  expect(b.used).toBe(12);
  b.release(12);
  expect(b.used).toBe(0);
  await expect(b.reserve(13)).rejects.toThrow();
  expect(within(resolveRoot("a"), resolveRoot("a"))).toBe(true);
  expect(within(resolveRoot("ab"), resolveRoot("a"))).toBe(false);
});
function resolveRoot(name: string) {
  return process.platform === "win32" ? "C:/" + name : "/" + name;
}
