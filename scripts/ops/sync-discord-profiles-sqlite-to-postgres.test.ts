import { expect, test } from "bun:test";
import { compareProfile } from "./sync-discord-profiles-sqlite-to-postgres";

const profile = {
  user_id: "123456789012345678",
  username: "current",
  avatar_hash: "hash",
  updated_at: 10,
};

test("profile reconciliation preserves newer data and rejects equal-time divergence", () => {
  expect(compareProfile(profile, { ...profile })).toBe("same");
  expect(compareProfile(profile, { ...profile, updated_at: 9 })).toBe("source-newer");
  expect(compareProfile(profile, { ...profile, updated_at: 11 })).toBe("target-newer");
  expect(() => compareProfile(profile, { ...profile, username: "other" })).toThrow();
});
