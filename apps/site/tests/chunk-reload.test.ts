/** A missing chunk of a former release reloads the page once, never in a loop. */
import { describe, expect, test } from "bun:test";
import { CHUNK_RELOAD_KEY, isChunkLoadError, recoverFromChunkError } from "@/lib/chunk-reload";

function deps(start = 1_000_000) {
  const store = new Map<string, string>();
  let now = start;
  let reloads = 0;
  return {
    deps: {
      storage: {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => void store.set(k, v),
      },
      reload: () => void reloads++,
      now: () => now,
    },
    advance: (ms: number) => void (now += ms),
    reloads: () => reloads,
    store,
  };
}

const chunkError = Object.assign(new Error("Loading chunk 123 failed."), {
  name: "ChunkLoadError",
});

describe("chunk reload", () => {
  test("recognises chunk failures only", () => {
    expect(isChunkLoadError(chunkError)).toBe(true);
    expect(isChunkLoadError(new Error("Failed to load chunk /_next/static/chunks/x.js"))).toBe(
      true,
    );
    expect(isChunkLoadError(new Error("Failed to fetch dynamically imported module: x"))).toBe(
      true,
    );
    expect(isChunkLoadError(new Error("Cannot read properties of undefined"))).toBe(false);
    expect(isChunkLoadError(null)).toBe(false);
  });

  test("reloads once, then not again for the same failure", () => {
    const t = deps();
    expect(recoverFromChunkError(chunkError, t.deps)).toBe(true);
    expect(t.store.get(CHUNK_RELOAD_KEY)).toBeDefined();
    expect(recoverFromChunkError(chunkError, t.deps)).toBe(false);
    t.advance(10_000);
    expect(recoverFromChunkError(chunkError, t.deps)).toBe(false);
    expect(t.reloads()).toBe(1);
    t.advance(120_000);
    expect(recoverFromChunkError(chunkError, t.deps)).toBe(true);
    expect(t.reloads()).toBe(2);
  });

  test("no storage, no reload; other errors untouched", () => {
    const t = deps();
    expect(recoverFromChunkError(chunkError, { ...t.deps, storage: null })).toBe(false);
    expect(recoverFromChunkError(new Error("boom"), t.deps)).toBe(false);
    expect(t.reloads()).toBe(0);
  });
});
