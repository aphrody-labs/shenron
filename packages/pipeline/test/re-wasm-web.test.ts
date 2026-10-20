// SPDX-License-Identifier: Apache-2.0
import { expect, spyOn, test } from "bun:test";
import { initShenronReWeb, parseGameDataFile, parseMessageFile } from "../src/re-wasm-web";

function messageFixture(lines: string[]): Uint8Array {
  const count = lines.length;
  const keys = 32,
    ids = keys + count * 16,
    lists = ids + count * 4,
    slots = lists + count * 8;
  const buffer = new Uint8Array(
    slots +
      count * 16 +
      lines.reduce((size, line, index) => size + (`MSG_${index}`.length + line.length + 2) * 2, 0),
  );
  const view = new DataView(buffer.buffer);
  buffer.set([35, 77, 83, 71, 0, 1, 1, 0]);
  [count, keys, ids, lists, count, slots].forEach((value, index) =>
    view.setUint32(8 + index * 4, value, true),
  );
  let cursor = slots + count * 16;
  lines.forEach((line, index) => {
    view.setUint32(ids + index * 4, index, true);
    view.setUint32(lists + index * 8, 1, true);
    view.setUint32(lists + index * 8 + 4, slots + index * 16, true);
    for (const [slot, text] of [
      [keys + index * 16, `MSG_${index}`],
      [slots + index * 16, line],
    ] as const) {
      [cursor, text.length, (text.length + 1) * 2].forEach((value, field) =>
        view.setUint32(slot + field * 4, value, true),
      );
      for (let unit = 0; unit < text.length; unit++) {
        view.setUint16(cursor, text.charCodeAt(unit), true);
        cursor += 2;
      }
      cursor += 2;
    }
  });
  return buffer;
}

test("the browser loader rejects untrusted responses, retries, and initializes the real parser once", async () => {
  const request = spyOn(globalThis, "fetch");
  try {
    request.mockRejectedValueOnce(new Error("offline"));
    await expect(initShenronReWeb("https://example.test/parser.wasm")).rejects.toThrow("offline");
    request.mockResolvedValueOnce(new Response("missing", { status: 404 }));
    await expect(initShenronReWeb("https://example.test/parser.wasm")).rejects.toThrow("404");
    request.mockResolvedValueOnce(new Response(new Uint8Array([0, 97, 115, 109])));
    await expect(initShenronReWeb("https://example.test/parser.wasm")).rejects.toThrow("digest");
    let cancelled = false;
    request.mockResolvedValueOnce(
      new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(new Uint8Array(16 * 1024 * 1024 + 1));
          },
          cancel() {
            cancelled = true;
          },
        }),
      ),
    );
    await expect(initShenronReWeb("https://example.test/parser.wasm")).rejects.toThrow(
      "byte limit",
    );
    expect(cancelled).toBe(true);
    const wasm = await Bun.file(new URL("../src/wasm/shenron_re_bg.wasm", import.meta.url)).bytes();
    request.mockResolvedValueOnce(new Response(wasm));
    const pending = initShenronReWeb("https://example.test/parser.wasm");
    expect(initShenronReWeb("https://example.test/parser.wasm")).toBe(pending);
    await pending;
    await initShenronReWeb("https://example.test/parser.wasm");
    expect(request).toHaveBeenCalledTimes(5);
    expect(request.mock.calls[4]?.[1]).toMatchObject({
      credentials: "omit",
      redirect: "error",
      mode: "cors",
    });
    // A minimal format fixture exercises the actual pinned Rust parser, not a game runtime.
    const pup = new Uint8Array(80);
    pup.set(new TextEncoder().encode("#PUP"));
    const view = new DataView(pup.buffer);
    view.setUint32(8, 1, true);
    view.setUint32(12, 16, true);
    view.setUint32(16, 300, true);
    view.setFloat32(20, 1.25, true);
    expect(parseGameDataFile("pup", pup)).toMatchObject({
      format: "pup",
      recordCount: 1,
      preview: [{ id: 300, basic_attack_mult: 1.25 }],
    });
    expect(() => parseGameDataFile("pup", new Uint8Array())).toThrow();
    const lines = [
      "",
      "  日本語 🐉  ",
      "same",
      "same",
      ...Array.from({ length: 201 }, (_, index) => `line${index}`),
    ];
    const messages = messageFixture(lines);
    expect(parseMessageFile(messages).entries.flatMap((entry) => entry.lines)).toEqual(lines);
    expect(parseGameDataFile("msg", messages).preview).toHaveLength(12);
  } finally {
    request.mockRestore();
  }
});
