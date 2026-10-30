// SPDX-License-Identifier: Apache-2.0
import { afterEach, describe, expect, spyOn, test } from "bun:test";
import {
  fetchCharacter,
  characterFiles,
  fetchBytes,
  MAX_CHARACTER_BYTES,
  type SceneEntry,
} from "../src/app/games/dragon-pixel/cpk-scene";
import { verifiedWorldMotion } from "../src/components/dragon-world/world-character-assets";

const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
});
const entry = (path: string, extract_size = 1): SceneEntry => ({ path, extract_size });
const resources = [
  entry("data/chara/GOK/GOK_000.esk"),
  entry("data/chara/GOK/GOK.ean"),
  entry("data/chara/GOK/GOK_PLAYER.bac"),
  entry("data/chara/GOK/GOK_PLAYER.bdm"),
  entry("data/chara/GOK/GOK_000_Bust.emd"),
  entry("data/chara/GOK/GOK_000_Bust.emb"),
  entry("data/chara/GOK/GOK_000_Bust.emm"),
  entry("data/chara/GOK/GOK_000_Bust.dyt.emb"),
  entry("data/chara/GOK/GOK_000_Boots.emd"),
];

describe("native world character resources", () => {
  test("cancels a chunked body immediately at the real 64 MiB cap without Content-Length", async () => {
    let cancelled = false;
    let pulls = 0;
    globalThis.fetch = Object.assign(
      async () =>
        new Response(
          new ReadableStream<Uint8Array>({
            pull(controller) {
              pulls++;
              controller.enqueue(new Uint8Array(pulls === 1 ? 64 * 1024 * 1024 : 1));
            },
            cancel() {
              cancelled = true;
            },
          }),
        ),
      { preconnect: originalFetch.preconnect },
    );
    await expect(fetchBytes("/asset", new AbortController().signal)).rejects.toThrow("64 MiB");
    expect(cancelled).toBe(true);
    expect(pulls).toBeLessThanOrEqual(3);
  });

  test("assembles bounded chunks and cancels an unfinished stream on user abort", async () => {
    globalThis.fetch = Object.assign(
      async () =>
        new Response(
          new ReadableStream<Uint8Array>({
            start(controller) {
              controller.enqueue(new Uint8Array([1, 2]));
              controller.enqueue(new Uint8Array([3]));
              controller.close();
            },
          }),
        ),
      { preconnect: originalFetch.preconnect },
    );
    expect(await fetchBytes("/asset", new AbortController().signal)).toEqual(
      new Uint8Array([1, 2, 3]),
    );
    const controller = new AbortController();
    let cancelled = false;
    globalThis.fetch = Object.assign(
      async () =>
        new Response(
          new ReadableStream<Uint8Array>({
            start(stream) {
              stream.enqueue(new Uint8Array([1]));
            },
            cancel() {
              cancelled = true;
            },
          }),
        ),
      { preconnect: originalFetch.preconnect },
    );
    const pending = fetchBytes("/asset", controller.signal);
    await new Promise((resolve) => setTimeout(resolve, 0));
    controller.abort(new DOMException("User aborted", "AbortError"));
    await expect(pending).rejects.toThrow("User aborted");
    expect(cancelled).toBe(true);
  });

  test("a TOC request stops on the configured deadline signal before any raw resource fetch", async () => {
    const deadline = new AbortController();
    const timer = spyOn(AbortSignal, "timeout").mockImplementation((milliseconds) => {
      expect(milliseconds).toBe(60_000);
      return deadline.signal;
    });
    let requests = 0;
    globalThis.fetch = Object.assign(
      async (input: unknown, init?: RequestInit) => {
        requests++;
        expect(String(input)).toContain("/find?");
        return await new Promise<Response>((_resolve, reject) => {
          init!.signal!.addEventListener("abort", () => reject(init!.signal!.reason), {
            once: true,
          });
        });
      },
      { preconnect: originalFetch.preconnect },
    );
    try {
      const pending = fetchCharacter("GOK", new AbortController().signal);
      deadline.abort(new DOMException("Deadline reached", "TimeoutError"));
      await expect(pending).rejects.toThrow("Deadline reached");
      expect(requests).toBe(1);
    } finally {
      timer.mockRestore();
    }
  });

  test("includes a secondary mesh only with its observed skeleton sibling", () => {
    const base = resources.map((item) => item.path);
    const emd = "data/chara/GOK/GOK_000_hair_scd.emd";
    const esk = "data/chara/GOK/GOK_000_hair_scd.esk";
    expect(characterFiles("GOK", [...base, emd])?.parts).toHaveLength(2);
    expect(characterFiles("GOK", [...base, emd, esk])?.parts).toContainEqual({
      emd,
      esk,
      emb: undefined,
      emm: undefined,
      dyt: undefined,
    });
  });

  test("uses only verified exact original motion names, never inferred names", () => {
    const animations = [
      { index: 0, name: "GOK_BAS_STAND", frameCount: 100 },
      { index: 2, name: "GOK_BAS_WALK", frameCount: 70 },
    ];
    expect(verifiedWorldMotion("GOK", animations)).toEqual({
      idleName: "GOK_BAS_STAND",
      walkName: "GOK_BAS_WALK",
      source: "data/chara/GOK/GOK.ean",
    });
    expect(verifiedWorldMotion("VEG", animations)).toBeNull();
    expect(verifiedWorldMotion("constructor", animations)).toBeNull();
    expect(() => verifiedWorldMotion("GOK", animations.slice(0, 1))).toThrow();
    expect(() => verifiedWorldMotion("GOK", [...animations, animations[0]!])).toThrow();
  });

  test("paginates the actual character index and limits raw requests to four", async () => {
    let active = 0,
      peak = 0;
    const offsets: number[] = [];
    const requested: string[] = [];
    globalThis.fetch = Object.assign(
      async (input: unknown) => {
        const url = new URL(String(input), "https://dragonballfr.com");
        if (url.pathname.includes("/find")) {
          const offset = Number(url.searchParams.get("offset"));
          offsets.push(offset);
          return Response.json({
            total: resources.length,
            offset,
            limit: 500,
            entries: offset === 0 ? resources.slice(0, 2) : resources.slice(offset),
          });
        }
        active++;
        peak = Math.max(active, peak);
        requested.push(url.pathname);
        await new Promise((resolve) => setTimeout(resolve, 1));
        active--;
        return new Response(new Uint8Array([1]));
      },
      { preconnect: originalFetch.preconnect },
    );
    const files = await fetchCharacter("GOK", new AbortController().signal);
    expect(offsets).toEqual([0, 2]);
    expect(peak).toBe(4);
    expect(requested).toHaveLength(resources.length);
    expect(files?.parts).toHaveLength(2);
    expect(files?.esk).toEqual(new Uint8Array([1]));
    expect(files?.ean).toEqual(new Uint8Array([1]));
    expect(files?.bac).toEqual(new Uint8Array([1]));
    expect(files?.bdm).toEqual(new Uint8Array([1]));
  });

  test("rejects oversize, incomplete pagination and mismatched raw payloads", async () => {
    let rawRequests = 0;
    globalThis.fetch = Object.assign(
      async (input: unknown) => {
        if (!String(input).includes("/find")) {
          rawRequests++;
          return new Response(new Uint8Array([1]));
        }
        const entries = resources.map((item) => ({
          ...item,
          extract_size: item.path.endsWith(".ean") ? MAX_CHARACTER_BYTES : 1,
        }));
        return Response.json({ total: entries.length, offset: 0, entries });
      },
      { preconnect: originalFetch.preconnect },
    );
    await expect(fetchCharacter("GOK", new AbortController().signal)).rejects.toThrow();
    expect(rawRequests).toBe(0);
    globalThis.fetch = Object.assign(
      async () => Response.json({ total: 10, offset: 0, entries: [] }),
      { preconnect: originalFetch.preconnect },
    );
    await expect(fetchCharacter("GOK", new AbortController().signal)).rejects.toThrow("index");
    globalThis.fetch = Object.assign(
      async (input: unknown) =>
        String(input).includes("/find")
          ? Response.json({ total: resources.length, offset: 0, entries: resources })
          : new Response(new Uint8Array([1, 2])),
      { preconnect: originalFetch.preconnect },
    );
    await expect(fetchCharacter("GOK", new AbortController().signal)).rejects.toThrow("differs");
  });

  test("refuses invalid character paths and respects cancellation before I/O", async () => {
    let requests = 0;
    globalThis.fetch = Object.assign(
      async () => {
        requests++;
        return new Response();
      },
      { preconnect: originalFetch.preconnect },
    );
    await expect(fetchCharacter("../GOK", new AbortController().signal)).rejects.toThrow("code");
    const controller = new AbortController();
    controller.abort();
    await expect(fetchCharacter("GOK", controller.signal)).rejects.toThrow();
    expect(requests).toBe(0);
  });
});
