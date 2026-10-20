// SPDX-License-Identifier: Apache-2.0
import { afterAll, expect, test } from "bun:test";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openReaderAuditCheckpoint } from "./audit-readers-checkpoint";

const path = join(tmpdir(), `shenron-reader-audit-${crypto.randomUUID()}.sqlite`);
afterAll(async () => {
  for (const suffix of ["", "-wal", "-shm"]) await rm(`${path}${suffix}`, { force: true });
});

test("resuming an interrupted audit preserves successes and retries failures", () => {
  const origin = "https://example.com";
  let runId: string;
  let startedAt: string;
  {
    using first = openReaderAuditCheckpoint(path, origin, false);
    runId = first.runId;
    startedAt = first.startedAt;
    first.record("asset", `${origin}/image.jpg`, true);
    first.record("page", `${origin}/retry`, false);
  }
  {
    using resumed = openReaderAuditCheckpoint(path, origin, true);
    expect(resumed.runId).toBe(runId);
    expect(resumed.startedAt).toBe(startedAt);
    expect(resumed.has("asset", `${origin}/image.jpg`)).toBe(true);
    expect(resumed.has("page", `${origin}/image.jpg`)).toBe(false);
    expect(resumed.has("page", `${origin}/retry`)).toBe(false);
    resumed.record("page", `${origin}/retry`, true);
  }
  {
    using resumed = openReaderAuditCheckpoint(path, origin, true);
    expect(resumed.has("page", `${origin}/retry`)).toBe(true);
  }
  expect(() => openReaderAuditCheckpoint(path, "https://other.example", true)).toThrow();
  using fresh = openReaderAuditCheckpoint(path, origin, false);
  expect(fresh.runId).not.toBe(runId);
  expect(fresh.has("asset", `${origin}/image.jpg`)).toBe(false);
});
