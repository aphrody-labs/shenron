// SPDX-License-Identifier: Apache-2.0
import { describe, expect, mock, test } from "bun:test";
import { isAgentAuthor } from "../src/lib/contributions-shared";

mock.module("server-only", () => ({}));
mock.module("@/lib/db", () => ({ db: {} }));
const { toContributorStats } = await import("../src/lib/wiki-contributions");

const at = new Date("2026-01-02T03:04:05.000Z");

describe("isAgentAuthor", () => {
  test("recognises the agent prefix only", () => {
    expect(isAgentAuthor("agent:key-1")).toBe(true);
    expect(isAgentAuthor("user-1")).toBe(false);
    expect(isAgentAuthor("an-agent:x")).toBe(false);
    expect(isAgentAuthor("")).toBe(false);
    expect(isAgentAuthor(null)).toBe(false);
    expect(isAgentAuthor(undefined)).toBe(false);
  });
});

describe("toContributorStats", () => {
  const rows = [
    {
      authorId: "agent:key-1",
      authorName: "Shenron MCP owner agents",
      accepted: 9,
      pending: 0,
      lastAt: at,
    },
    { authorId: "u1", authorName: "Zed", accepted: "4", pending: "1", lastAt: at },
    { authorId: "u2", authorName: null, accepted: 2, pending: 0, lastAt: at },
    { authorId: "u3", authorName: "Pending only", accepted: 0, pending: 5, lastAt: at },
    { authorId: null, authorName: "Ghost", accepted: 3, pending: 0, lastAt: at },
  ];

  test("drops agents, zero-accepted members and rows without author", () => {
    const stats = toContributorStats(rows);
    expect(stats.map((s) => s.authorId)).toEqual(["u1", "u2"]);
  });

  test("keeps one row per authorId with numeric counts and an ISO date", () => {
    const stats = toContributorStats(rows);
    expect(new Set(stats.map((s) => s.authorId)).size).toBe(stats.length);
    expect(stats[0]).toEqual({
      authorId: "u1",
      authorName: "Zed",
      accepted: 4,
      pending: 1,
      lastAt: at.toISOString(),
    });
    expect(stats[1]!.authorName).toBe("Anonyme");
  });
});
