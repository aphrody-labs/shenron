export type LeaderboardState<T> = { entries: T[]; available: boolean };

/** Distinguishes an empty successful response from a missing or malformed payload. */
export function parseLeaderboardPayload<T>(payload: unknown): LeaderboardState<T> {
  if (
    payload === null ||
    typeof payload !== "object" ||
    !("leaderboard" in payload) ||
    !Array.isArray(payload.leaderboard)
  ) {
    return { entries: [], available: false };
  }

  return { entries: payload.leaderboard as T[], available: true };
}
