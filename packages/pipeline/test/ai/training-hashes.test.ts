// SPDX-License-Identifier: Apache-2.0
import { expect, test } from "bun:test";
import {
  normalizeText,
  segmentHashes,
  goldKeys,
  overlapsGold,
  sha256,
} from "../../src/ai/training-hashes";

test("historical normalization stays NFC and compatibility checks are opt-in", () => {
  expect(normalizeText(" E\u0301\t SOURCE \n", true)).toBe("é source");
  expect(normalizeText("ＦＵＬＬＷＩＤＴＨ", true)).toBe("ｆｕｌｌｗｉｄｔｈ");
  expect(normalizeText("ＦＵＬＬＷＩＤＴＨ", true, { compatibility: true })).toBe("fullwidth");
  expect(sha256("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  const keys = goldKeys([{ query: "Heldout source question", expect: ["Heldout source answer"] }]);
  expect(
    overlapsGold(
      { nested: { response: "Earlier context. Heldout source answer. Later context." } },
      keys,
    ),
  ).toBe(true);
  expect(segmentHashes("unrelated source text").size).toBe(1);
});

test("shared hash helpers bundle for a browser without Bun or Node runtime globals", async () => {
  const built = await Bun.build({
    entrypoints: [Bun.fileURLToPath(new URL("../../src/ai/training-hashes.ts", import.meta.url))],
    target: "browser",
    write: false,
  });
  expect(built.success).toBe(true);
  const output = await built.outputs[0]!.text();
  expect(output).not.toContain("node:crypto");
  expect(output).not.toContain("Bun.CryptoHasher");
  expect(output).not.toContain("require(");
});
