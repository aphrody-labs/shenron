import { afterAll, beforeEach, describe, expect, test } from "bun:test";
import type { StreamingEpisode } from "../src/lib/streaming-catalogue";
import { FAVORITES_EVENT, isFavorited, readFavorites, toggleFavorite } from "../src/lib/favorites";
import {
  readStreamingWatchlist,
  STREAMING_WATCHLIST_EVENT,
  toggleStreamingWatchlist,
} from "../src/lib/streaming-watchlist";

const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
const memory = new Map<string, string>();
const target = new EventTarget();
let writesBlocked = false;
const storage = {
  getItem: (key: string) => memory.get(key) ?? null,
  setItem: (key: string, value: string) => {
    if (writesBlocked) throw new Error("Storage blocked");
    memory.set(key, value);
  },
};
Object.defineProperty(globalThis, "window", {
  configurable: true,
  value: { localStorage: storage, dispatchEvent: target.dispatchEvent.bind(target) },
});
afterAll(() => {
  if (originalWindow) Object.defineProperty(globalThis, "window", originalWindow);
  else Reflect.deleteProperty(globalThis, "window");
});
function episode(id = 875): StreamingEpisode {
  return {
    id,
    series: "DBS_BEERUS",
    number: 1,
    title: "Le dieu de la Destruction",
    titleJa: null,
    image: "./assets/ext/db_episodes/875.jpg",
    synopsis: null,
    year: 2026,
    languages: ["vostfr"],
    hasPlayback: true,
    duration: 1400,
  };
}

describe("streaming favorites adapter", () => {
  beforeEach(() => {
    memory.clear();
    writesBlocked = false;
  });

  test("existing detail favorite appears in catalogue and shares removal state", () => {
    toggleFavorite({
      kind: "episode",
      id: "875",
      title: episode().title,
      href: "/wiki/episodes/875",
      image: episode().image,
      caption: "Dragon Ball Super: Beerus",
    });
    expect(readStreamingWatchlist()).toHaveLength(1);
    expect(readStreamingWatchlist()[0]?.series).toBe("Dragon Ball Super: Beerus");
    expect(toggleStreamingWatchlist(episode())).toBe(true);
    expect(isFavorited("episode", "875")).toBe(false);
    expect(readStreamingWatchlist()).toEqual([]);
  });

  test("catalogue uses the original owner and does not create a second list", () => {
    expect(STREAMING_WATCHLIST_EVENT).toBe(FAVORITES_EVENT);
    expect(toggleStreamingWatchlist(episode())).toBe(true);
    expect(readFavorites()[0]).toMatchObject({
      kind: "episode",
      id: "875",
      href: "/wiki/episodes/875",
    });
    expect(memory.has("dbfr_streaming_watchlist_v1")).toBe(false);
    expect(readStreamingWatchlist()[0]?.duration).toBeNull();
    expect(readStreamingWatchlist()[0]?.hasPlayback).toBe(false);
  });

  test("only episode favorites are projected and malformed owner records are sanitized", () => {
    toggleFavorite({ kind: "movie", id: "1", title: "Film", href: "/wiki/movies/film" });
    toggleStreamingWatchlist(episode());
    expect(readStreamingWatchlist().map((row) => row.id)).toEqual([875]);
    memory.set(
      "dbfr_favorites_v1",
      JSON.stringify([
        { kind: "episode", id: "-1", title: "bad", href: "/wiki/episodes/1", at: 1 },
        { kind: "episode", id: "1", title: "external", href: "https://google.com", at: 2 },
      ]),
    );
    expect(readStreamingWatchlist()).toEqual([]);
  });

  test("does not persist playback URLs or other extra transport fields", () => {
    const dirty = { ...episode(), providerUrl: "https://provider.invalid/?token=secret" };
    expect(toggleStreamingWatchlist(dirty)).toBe(true);
    expect(memory.get("dbfr_favorites_v1")).not.toContain("secret");
    expect(readFavorites()[0]).not.toHaveProperty("providerUrl");
  });

  test("reports a denied local write and rejects invalid episode identities", () => {
    writesBlocked = true;
    expect(toggleStreamingWatchlist(episode())).toBe(false);
    expect(readStreamingWatchlist()).toEqual([]);
    writesBlocked = false;
    expect(toggleStreamingWatchlist({ ...episode(), id: -1 })).toBe(false);
    expect(toggleStreamingWatchlist({ ...episode(), title: "" })).toBe(false);
  });
});
