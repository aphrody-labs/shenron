// SPDX-License-Identifier: Apache-2.0
import { test, expect } from "bun:test";
import { chmodSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AdminWebQueue } from "../src/api/admin-web-queue";
import type { NativeMcpTransport } from "@aphrody/shenron-pipeline/aphrody/jobs";

test("native web placement survives a lost ACK and process restart, with private results", async () => {
  const home = mkdtempSync(join(tmpdir(), "shenron-web-admin-"));
  const path = join(home, "plans.json"),
    mcp = join(home, "mcp.json");
  await Bun.write(mcp, "{}");
  chmodSync(mcp, 0o600);
  await Bun.write(
    path,
    JSON.stringify({
      hosts: [{ id: "dbfr", config: mcp, slots: 2, workerReady: true }],
      actions: [{ id: "web-index", args: ["crawl-index", "--help"] }],
    }),
  );
  chmodSync(path, 0o600);
  const env = { SHENRON_ADMIN_PIPELINE_HOME: home, SHENRON_ADMIN_WEB_CONFIG: path };
  let ackLost = true,
    submissions = 0,
    state = "queued";
  const transport: NativeMcpTransport = async (request) => {
    let data: unknown;
    if (request.tool === "aphrody_job_submit") {
      submissions++;
      expect(request.arguments.idempotency_key).toBe("web-job-001");
      if (ackLost) {
        ackLost = false;
        throw new Error("lost ACK private token");
      }
      data = { id: "remote-001", state };
    } else if (request.tool === "aphrody_job_cancel") {
      state = "cancelled";
      data = { job: { id: "remote-001", state, result: { secret: "private scrape body" } } };
    } else
      data = request.arguments.id
        ? { job: { id: "remote-001", state, result: { secret: "private scrape body" } } }
        : { queue: { queued: 0, running: 0 } };
    return { result: { structuredContent: data } };
  };
  let queue = new AdminWebQueue(env, transport);
  try {
    await expect(queue.submit("web-index", "web-job-001")).rejects.toThrow("lost ACK");
    queue.close();
    queue = new AdminWebQueue(env, transport);
    const snapshot = await queue.status();
    expect(submissions).toBe(2);
    expect(snapshot.jobs[0]).toMatchObject({
      id: "web-job-001",
      state: "queued",
      remoteId: "remote-001",
      host: "dbfr",
    });
    expect(JSON.stringify(snapshot)).not.toContain("private");
    await expect(queue.submit("web-other", "web-job-001")).rejects.toThrow("Unknown");
    expect((await queue.cancel("web-job-001")).state).toBe("cancelled");
    const jobs = await queue.jobs();
    expect(jobs[0]?.finishedAt).not.toBeNull();
    expect(JSON.stringify(jobs)).not.toContain("secret");
  } finally {
    queue.close();
    rmSync(home, { recursive: true, force: true });
  }
});
