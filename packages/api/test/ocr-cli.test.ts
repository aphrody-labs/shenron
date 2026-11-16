// SPDX-License-Identifier: Apache-2.0
import { afterAll, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { testExecutable } from "@shenron/config/testing-executable";

import { createCliOcr, readOcrResult } from "../src/chat/ocr";

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
const SHA = new Bun.CryptoHasher("sha256").update(PNG).digest("hex");

const result = (over: Record<string, unknown> = {}) => ({
  schema: "aphrody.ocr.result/v2",
  page_id: "/tmp/page.png",
  image: { path: "/tmp/page.png", sha256: SHA },
  attempts: [{ run: { model_id: "ppocr-v5-mobile", backend: "onnx" }, status: "completed" }],
  status: "text",
  markdown: null,
  blocks: [{ text: "ドラゴンボール" }, { text: " " }, { text: "Son Goku" }],
  ...over,
});

describe("readOcrResult (aphrody.ocr.result/v2)", () => {
  test("joins the non-empty blocks and names the engine from the last attempt", () => {
    expect(readOcrResult(result(), SHA)).toEqual({
      engine: "ppocr-v5-mobile",
      text: "ドラゴンボール\nSon Goku",
      regions: 2,
    });
  });

  test("a page without text is an empty answer, not an error", () => {
    expect(readOcrResult(result({ status: "no-text", blocks: [] }), SHA)).toMatchObject({
      text: "",
      regions: 0,
    });
  });

  test("refuses another schema, another image or an unreadable page", () => {
    expect(() => readOcrResult(result({ schema: "other" }), SHA)).toThrow("schema");
    expect(() => readOcrResult(result(), "0".repeat(64))).toThrow("not bound");
    expect(() => readOcrResult(result({ status: "unreadable" }), SHA)).toThrow("unreadable");
  });
});

describe("createCliOcr", () => {
  const dir = mkdtempSync(join(tmpdir(), "shenron-ocr-cli-"));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  test("runs `aphrody ocr ppocr <file> --json` and reads its result", async () => {
    const answer = JSON.stringify(result());
    const fake = testExecutable(
      dir,
      "aphrody",
      `const [command, engine, file, json] = process.argv.slice(2);
if (command !== "ocr" || engine !== "ppocr" || !file || json !== "--json") { console.error("bad args"); process.exit(2); }
process.stdout.write(${JSON.stringify(answer)});`,
    );
    const ocr = createCliOcr({ binary: fake });
    expect(ocr.available()).toBe(true);
    const out = await ocr.recognize(PNG, "image/png");
    expect(out.text).toBe("ドラゴンボール\nSon Goku");
    expect(out.regions).toBe(2);
  });

  test("a failing CLI surfaces its exit code and last stderr line", async () => {
    const fake = testExecutable(
      dir,
      "aphrody-fail",
      'console.error("model ppocr-v5-mobile not installed"); process.exit(3);',
    );
    await expect(createCliOcr({ binary: fake }).recognize(PNG, "image/png")).rejects.toThrow(
      "aphrody ocr ppocr failed (exit 3): model ppocr-v5-mobile not installed",
    );
  });
});
