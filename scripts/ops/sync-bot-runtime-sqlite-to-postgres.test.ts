import { describe, expect, test } from "bun:test";
import { sameRecord, stablePostgresId } from "./sync-bot-runtime-sqlite-to-postgres";

describe("bot runtime PostgreSQL mapping", () => {
  const row = {
    id: 1,
    user_id: "42",
    moderator_id: null,
    action: "interaction",
    reason: null,
    meta: '{"name":"ping"}',
    created_at: 1791904905000,
  };

  test("uses stable source and row identities without cloning mutations", () => {
    const first = stablePostgresId("action_logs", row, "dbfr-bot-20261013");
    expect(first).toBe(stablePostgresId("action_logs", row, "dbfr-bot-20261013"));
    expect(BigInt(first)).toBeLessThan(0n);
    expect(
      stablePostgresId(
        "action_logs",
        { ...row, created_at: row.created_at + 1 },
        "dbfr-bot-20261013",
      ),
    ).toBe(first);
    expect(stablePostgresId("action_logs", row, "dbfr-bot-replacement")).not.toBe(first);
  });

  test("refuses a conflicting target instead of silently dropping it", () => {
    expect(sameRecord("action_logs", row, { ...row, id: "-1" })).toBe(true);
    expect(sameRecord("action_logs", row, { ...row, id: "-1", action: "other" })).toBe(false);
  });
});
