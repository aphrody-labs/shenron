// SPDX-License-Identifier: Apache-2.0
import { describe, expect, test } from "bun:test";
import pino from "pino";
import { OperationalLogs } from "../src/lib/operational-logs";

describe("container bot operational logs", () => {
  test("captures real logger messages without journald or structured private payloads", () => {
    const logs = new OperationalLogs();
    const logger = pino(
      {
        hooks: {
          logMethod(args, method, level) {
            logs.record(level, args);
            method.apply(this, args);
          },
        },
      },
      { write() {} },
    );
    logger.info({ token: "private-token", payload: "private-provider" }, "Bot ready");
    logger.error({ err: new Error("private-error") }, "Native owner unavailable");
    const result = logs.snapshot(100);
    expect(result.source).toBe("process");
    expect(result.count).toBe(2);
    expect(result.logs[0]?.message).toBe("ERROR Native owner unavailable");
    expect(result.logs[1]?.message).toBe("INFO Bot ready");
    expect(JSON.stringify(result)).not.toContain("private-");
  });
  test("bounds retention and returns newest entries without mutable aliases", () => {
    const logs = new OperationalLogs(128, 2);
    logs.record(30, ["first"]);
    logs.record(30, ["second"]);
    logs.record(30, ["third"]);
    const result = logs.snapshot(500);
    expect(result.logs.map((entry) => entry.message)).toEqual(["INFO third", "INFO second"]);
    result.logs[0]!.message = "changed";
    expect(logs.snapshot(1).logs[0]?.message).toBe("INFO third");
    expect(logs.snapshot(Number.NaN).count).toBe(2);
    expect(logs.snapshot(-10).count).toBe(1);
    logs.record(30, ["x".repeat(5000)]);
    expect(logs.snapshot(500).count).toBe(0);
  });
});
