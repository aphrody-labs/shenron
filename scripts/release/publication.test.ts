// SPDX-License-Identifier: Apache-2.0
import { describe, expect, test } from "bun:test";
import {
  auditArchive,
  isProtectedPackagePath,
  parseTar,
  readPublishedVersion,
} from "./publication";

function archive(entries: Record<string, string>): Uint8Array<ArrayBuffer> {
  const encoder = new TextEncoder(),
    chunks = [];
  for (const [path, text] of Object.entries(entries)) {
    const data = encoder.encode(text),
      header = new Uint8Array(512);
    header.set(encoder.encode("package/" + path));
    header.set(encoder.encode(data.length.toString(8).padStart(11, "0") + "\0"), 124);
    header[156] = 48;
    chunks.push(header, data, new Uint8Array((512 - (data.length % 512)) % 512));
  }
  chunks.push(new Uint8Array(1024));
  const all = new Uint8Array(chunks.reduce((sum, chunk) => sum + chunk.length, 0));
  let cursor = 0;
  for (const chunk of chunks) {
    all.set(chunk, cursor);
    cursor += chunk.length;
  }
  return Bun.gzipSync(all);
}

describe("publication archive boundary", () => {
  test("allows slow propagation but stops after the bounded publication window", async () => {
    let calls = 0;
    const delayed = async () =>
      ++calls < 16 ? new Response("", { status: 404 }) : Response.json({ version: "1.4.6" });
    expect(await readPublishedVersion("fixture", "1.4.6", delayed, async () => {})).toEqual({
      version: "1.4.6",
    });
    expect(calls).toBe(16);
    calls = 0;
    await expect(
      readPublishedVersion(
        "fixture",
        "1.4.6",
        async () => {
          calls++;
          return new Response("", { status: 404 });
        },
        async () => {},
      ),
    ).rejects.toThrow("HTTP 404");
    expect(calls).toBe(91);
  });
  test("retries only registry propagation and keeps authorization failures terminal", async () => {
    let calls = 0,
      pauses = 0;
    const request = async () =>
      ++calls === 1
        ? new Response("", { status: 404 })
        : Response.json({ name: "@aphrody/shenron-fixture", version: "1.4.4" });
    expect(
      await readPublishedVersion("@aphrody/shenron-fixture", "1.4.4", request, async () => {
        pauses++;
      }),
    ).toEqual({ name: "@aphrody/shenron-fixture", version: "1.4.4" });
    expect([calls, pauses]).toEqual([2, 1]);
    const forbidden = async () => new Response("", { status: 403 });
    await expect(
      readPublishedVersion("@aphrody/shenron-fixture", "1.4.4", forbidden, async () => {
        pauses++;
      }),
    ).rejects.toThrow("HTTP 403");
    expect(pauses).toBe(1);
  });
  test("rejects protected payloads and flags credentials without returning their values", () => {
    expect(isProtectedPackagePath("src/paths.ts")).toBe(false);
    expect(isProtectedPackagePath("data/bot.db")).toBe(true);
    const secret = "npm_" + "x".repeat(30);
    const result = auditArchive(
      archive({
        "package.json": JSON.stringify({ name: "@aphrody/shenron-fixture", private: false }),
        ".env": "private",
        "README.md": secret,
      }),
    );
    expect(result.issues).toEqual([
      { path: ".env", reason: "protected path" },
      { path: "README.md", reason: "credential pattern" },
    ]);
    expect(JSON.stringify(result.issues)).not.toContain(secret);
  });
  test("requires resolved dependency versions and every public export", () => {
    const result = auditArchive(
      archive({
        "package.json": JSON.stringify({
          name: "@aphrody/shenron-fixture",
          private: false,
          dependencies: { zod: "catalog:" },
          exports: { ".": "./src/index.ts" },
        }),
      }),
    );
    expect(result.issues).toEqual([
      { path: "package.json", reason: "unresolved dependency protocol" },
      { path: "src/index.ts", reason: "missing export payload" },
    ]);
  });
  test("rejects archive paths escaping the package", () => {
    expect(() => parseTar(Bun.gunzipSync(archive({ "../private": "private" })))).toThrow(
      "Unsafe archive entry path",
    );
  });
});
