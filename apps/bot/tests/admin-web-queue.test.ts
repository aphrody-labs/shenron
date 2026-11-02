// SPDX-License-Identifier: Apache-2.0
import { test, expect } from "bun:test";
import { chmodSync, mkdtempSync, renameSync, rmSync } from "node:fs";
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
      actions: [{ id: "web-official", source: "official", maxRequests: 80, depth: 1 }],
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
      const args = (request.arguments.payload as { args: unknown }).args;
      expect(args).toEqual(
        expect.arrayContaining([
          "dragon-ball",
          "crawl",
          "--profile",
          "shenron",
          "--source",
          "official",
          "--browser",
          "playwright",
          "--max-requests",
          "80",
          "--max-depth",
          "1",
          "--render",
          "--json",
          "--index",
        ]),
      );
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
    await expect(queue.submit("web-official", "web-job-001")).rejects.toThrow("lost ACK");
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
    expect(snapshot.actions).toEqual([
      expect.objectContaining({ id: "web-official", available: true }),
    ]);
    expect((await queue.cancel("web-job-001")).state).toBe("cancelled");
    const jobs = await queue.jobs();
    expect(jobs[0]?.finishedAt).not.toBeNull();
    expect(JSON.stringify(jobs)).not.toContain("secret");
  } finally {
    queue.close();
    rmSync(home, { recursive: true, force: true });
  }
});

test("admin crawl actions reject arbitrary commands, unlisted sources, and excessive budgets", async () => {
  const home = mkdtempSync(join(tmpdir(), "shenron-web-config-"));
  const configPath = join(home, "plans.json");
  const mcpPath = join(home, "mcp.json");
  await Bun.write(mcpPath, "{}");
  chmodSync(mcpPath, 0o600);
  const env = { SHENRON_ADMIN_PIPELINE_HOME: home, SHENRON_ADMIN_WEB_CONFIG: configPath };
  const transport: NativeMcpTransport = async () => ({
    result: { structuredContent: { queue: { queued: 0, running: 0 } } },
  });
  const cases = [
    { id: "web-shell", args: ["dragon-ball", "crawl"], maxAttempts: 1 },
    { id: "web-custom", source: "custom", url: "https://example.org/" },
    { id: "web-large", source: "official", maxRequests: 2001 },
    { id: "web-deep", source: "official", depth: 6 },
  ];

  try {
    for (const action of cases) {
      await Bun.write(
        configPath,
        JSON.stringify({
          hosts: [{ id: "dbfr", config: mcpPath, slots: 1, workerReady: true }],
          actions: [action],
        }),
      );
      chmodSync(configPath, 0o600);
      const queue = new AdminWebQueue(env, transport);
      try {
        await expect(queue.status()).rejects.toThrow();
      } finally {
        queue.close();
      }
    }
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("web queue stays unavailable until an atomic readiness flip, without restarting", async () => {
  const home = mkdtempSync(join(tmpdir(), "shenron-web-readiness-"));
  const configPath = join(home, "plans.json");
  const nextPath = join(home, "plans.next.json");
  const mcpPath = join(home, "mcp.json");
  await Bun.write(mcpPath, "{}");
  chmodSync(mcpPath, 0o600);
  const writeConfig = async (workerReady: boolean, target = configPath) => {
    await Bun.write(
      target,
      JSON.stringify({
        hosts: [{ id: "vps", config: mcpPath, slots: 1, workerReady }],
        actions: [{ id: "web-official", source: "official", maxRequests: 10, depth: 0 }],
      }),
    );
    chmodSync(target, 0o600);
  };
  await writeConfig(false);
  const env = { SHENRON_ADMIN_PIPELINE_HOME: home, SHENRON_ADMIN_WEB_CONFIG: configPath };
  const calls: string[] = [];
  const transport: NativeMcpTransport = async (request) => {
    calls.push(request.tool);
    return {
      result: {
        structuredContent:
          request.tool === "aphrody_job_submit"
            ? { id: "remote-1", state: "queued" }
            : { queue: { queued: 0, running: 0 } },
      },
    };
  };
  const queue = new AdminWebQueue(env, transport);
  try {
    expect((await queue.status()).actions).toEqual([
      expect.objectContaining({ id: "web-official", available: false }),
    ]);
    expect(calls).toEqual([]);
    await expect(queue.submit("web-official", "web-job-disabled")).rejects.toThrow(
      "No web worker is ready",
    );
    await writeConfig(true, nextPath);
    renameSync(nextPath, configPath);
    expect((await queue.status()).actions).toEqual([
      expect.objectContaining({ id: "web-official", available: true }),
    ]);
    expect(calls).toContain("aphrody_job_status");
    await expect(queue.submit("web-official", "web-job-enabled")).resolves.toMatchObject({
      id: "web-job-enabled",
      state: "queued",
    });
    expect(calls).toContain("aphrody_job_submit");
  } finally {
    queue.close();
    rmSync(home, { recursive: true, force: true });
  }
});
