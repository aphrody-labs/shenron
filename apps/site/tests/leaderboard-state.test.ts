import { describe, expect, test } from "bun:test";
import { parseLeaderboardPayload } from "../src/lib/leaderboard-state";

describe("public leaderboard state", () => {
  test("treats an empty successful response as an available empty ranking", () => {
    expect(parseLeaderboardPayload({ leaderboard: [] })).toEqual({
      entries: [],
      available: true,
    });
  });

  test("keeps missing and malformed responses unavailable", () => {
    expect(parseLeaderboardPayload(null)).toEqual({ entries: [], available: false });
    expect(parseLeaderboardPayload({})).toEqual({ entries: [], available: false });
    expect(parseLeaderboardPayload({ leaderboard: null })).toEqual({
      entries: [],
      available: false,
    });
  });
});
