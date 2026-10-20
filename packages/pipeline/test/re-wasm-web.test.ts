// SPDX-License-Identifier: Apache-2.0
import { expect, spyOn, test } from "bun:test";
import { initShenronReWeb, parseGameDataFile } from "../src/re-wasm-web";

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
  } finally {
    request.mockRestore();
  }
});
