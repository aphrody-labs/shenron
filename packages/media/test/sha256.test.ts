// SPDX-License-Identifier: Apache-2.0
import { describe, expect, test } from "bun:test";
import { sha256Hex } from "../src/sha256";

const reference = (data: Uint8Array) => new Bun.CryptoHasher("sha256").update(data).digest("hex");

describe("sha256Hex (pure)", () => {
  test("FIPS 180-4 vectors", () => {
    expect(sha256Hex("")).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
    expect(sha256Hex("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
    expect(sha256Hex("abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq")).toBe(
      "248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1",
    );
  });

  test("matches Bun.CryptoHasher on every padding boundary and on UTF-8 text", () => {
    for (const length of [1, 55, 56, 57, 63, 64, 65, 119, 120, 128, 1000, 65_537]) {
      const bytes = Uint8Array.from({ length }, (_, i) => (i * 31 + length) & 0xff);
      expect(sha256Hex(bytes)).toBe(reference(bytes));
    }
    const text = "孫悟空 · Kamé Hamé Ha";
    expect(sha256Hex(text)).toBe(reference(new TextEncoder().encode(text)));
  });
});
