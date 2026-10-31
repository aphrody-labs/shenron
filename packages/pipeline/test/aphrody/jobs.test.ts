// SPDX-License-Identifier: Apache-2.0
import { expect, test } from "bun:test";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  AphrodyWebJobs,
  crawlJobOutputDirectory,
  type NativeMcpTransport,
  type AphrodyJobHost,
} from "../../src/aphrody/jobs";

const envelope = (value: unknown) => ({
  result: { content: [{ type: "text", text: JSON.stringify(value) }] },
});
const hosts: AphrodyJobHost[] = [
  { id: "vps", config: "/private/vps.toml", slots: 4, workerReady: true },
  { id: "dbfr", config: "/private/dbfr.toml", slots: 2, workerReady: true },
];

test("successful catalog crawl receipts expose only the deterministic per-job output directory", async () => {
  const directory = await mkdtemp(join(tmpdir(), "shenron-jobs-output-"));
  const key = "catalog-output-1";
  const outputDir = crawlJobOutputDirectory(key);
  const args = [
    "dragon-ball",
    "crawl",
    "--profile",
    "shenron",
    "--output",
    outputDir,
    "--max-requests",
    "10",
    "--render",
    "--json",
    "--index",
  ];
  const transport: NativeMcpTransport = async (request) => {
    if (request.tool === "aphrody_job_status" && !request.arguments.id)
      return envelope({ queue: { queued: 0, running: 0 } });
    if (request.tool === "aphrody_job_submit")
      return envelope({ id: "remote-output-1", state: "queued" });
    return envelope({
      job: { id: "remote-output-1", state: "succeeded", result: { complete: true } },
    });
  };
  try {
    const jobs = new AphrodyWebJobs(join(directory, "ledger.sqlite"), [hosts[0]!], transport);
    try {
      const queued = await jobs.submit({ key, args });
      expect(queued.crawlOutputDir).toBeUndefined();
      const receipt = await jobs.refresh(key);
      expect(receipt).toMatchObject({
        state: "succeeded",
        host: "vps",
        remoteId: "remote-output-1",
        crawlOutputDir: outputDir,
      });
    } finally {
      jobs.close();
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("lost submission ACK survives restart and never moves to a different host", async () => {
  const directory = await mkdtemp(join(tmpdir(), "shenron-jobs-"));
  const path = join(directory, "ledger.sqlite");
  let lost = true,
    probes = 0,
    submissions = 0,
    statuses = 0;
  const destinations: string[] = [];
  const transport: NativeMcpTransport = async (request) => {
    if (request.tool === "aphrody_job_status" && !request.arguments.id) {
      probes++;
      return envelope({ queue: { queued: request.config.includes("dbfr") ? 20 : 0, running: 0 } });
    }
    if (request.tool === "aphrody_job_submit") {
      submissions++;
      destinations.push(request.config);
      expect(request.arguments.idempotency_key).toBe("campaign-1");
      expect(request.arguments.host_affinity).toEqual({ mode: "hosts", hosts: ["vps"] });
      if (lost) {
        lost = false;
        throw new Error("response lost after durable remote commit");
      }
      // The worker completed before the retry reached the same native queue.
      return envelope({ id: "remote-1", state: "succeeded" });
    }
    statuses++;
    return envelope({ job: { id: "remote-1", state: "succeeded", result: { completed: true } } });
  };
  try {
    const first = new AphrodyWebJobs(path, hosts, transport);
    await expect(
      first.submit({ key: "campaign-1", args: ["dragon-ball", "sources"] }),
    ).rejects.toThrow("response lost");
    expect(first.get("campaign-1")?.state).toBe("submitting");
    expect(first.get("campaign-1")?.host).toBe("vps");
    first.close();
    const second = new AphrodyWebJobs(path, hosts, transport);
    const done = await second.submit({ key: "campaign-1", args: ["dragon-ball", "sources"] });
    expect(done.state).toBe("succeeded");
    expect(done.result).toEqual({ completed: true });
    expect(destinations).toEqual(["/private/vps.toml", "/private/vps.toml"]);
    expect(submissions).toBe(2);
    expect(probes).toBe(2);
    expect(statuses).toBe(1);
    // Terminal evidence stays available even if a native queue purges its row.
    expect(await second.refresh("campaign-1")).toEqual(done);
    expect(statuses).toBe(1);
    await expect(
      second.submit({ key: "campaign-1", args: ["dragon-ball", "plan"] }),
    ).rejects.toThrow("different intent");
    if (process.platform !== "win32") expect((await stat(path)).mode & 0o777).toBe(0o600);
    second.close();
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("terminal submission resumes result hydration after a lost status response and restart", async () => {
  const directory = await mkdtemp(join(tmpdir(), "shenron-jobs-"));
  const path = join(directory, "ledger.sqlite");
  let submissions = 0,
    statuses = 0;
  const transport: NativeMcpTransport = async (request) => {
    expect(request.config).toBe("/private/vps.toml");
    if (request.tool === "aphrody_job_submit") {
      submissions++;
      return envelope({ id: "finished", state: "succeeded" });
    }
    if (!request.arguments.id) return envelope({ queue: { queued: 0, running: 0 } });
    statuses++;
    expect(request.arguments.id).toBe("finished");
    if (statuses === 1) throw new Error("terminal result response lost");
    return envelope({ job: { id: "finished", state: "succeeded", result: { pages: 12 } } });
  };
  try {
    const intent = { key: "finished", args: ["dragon-ball", "sources"] };
    const first = new AphrodyWebJobs(path, [hosts[0]!], transport);
    await expect(first.submit(intent)).rejects.toThrow("terminal result response lost");
    expect(first.get(intent.key)).toMatchObject({
      remoteId: "finished",
      state: "submitting",
      error: "terminal result response lost",
    });
    first.close();
    // Recovery uses the durable connection even if no worker is currently advertised.
    const second = new AphrodyWebJobs(path, [], transport);
    const done = await second.submit(intent);
    expect(done).toMatchObject({ state: "succeeded", result: { pages: 12 }, error: null });
    expect(submissions).toBe(1);
    expect(statuses).toBe(2);
    expect(await second.submit(intent)).toEqual(done);
    expect(statuses).toBe(2);
    second.close();
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("parallel intents balance qualified slots and concurrent clients agree on one sticky placement", async () => {
  const directory = await mkdtemp(join(tmpdir(), "shenron-jobs-"));
  const path = join(directory, "ledger.sqlite");
  const assignments = new Map<string, string>();
  const transport: NativeMcpTransport = async (request) => {
    if (request.tool === "aphrody_job_status")
      return envelope({ queue: { queued: 0, running: 0 } });
    const key = String(request.arguments.idempotency_key);
    const previous = assignments.get(key);
    if (previous) expect(request.config).toBe(previous);
    assignments.set(key, request.config);
    await Bun.sleep(15);
    return envelope({ id: `remote-${key}`, state: "queued" });
  };
  try {
    const first = new AphrodyWebJobs(path, hosts, transport);
    const second = new AphrodyWebJobs(path, hosts, transport);
    const args = ["dragon-ball", "sources"];
    const jobs = [
      first.submit({ key: "a", args }),
      first.submit({ key: "b", args }),
      second.submit({ key: "a", args }),
      second.submit({ key: "c", args }),
    ];
    expect(() => first.close()).toThrow("in flight");
    const results = await Promise.all(jobs);
    expect(results[0]).toEqual(results[2]);
    expect(new Set(assignments.values()).size).toBe(2);
    expect(assignments.size).toBe(3);
    first.close();
    second.close();
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test(
  "delayed queue snapshots include new ACK reservations without retaining old ones",
  async () => {
    const directory = await mkdtemp(join(tmpdir(), "shenron-jobs-"));
    const path = join(directory, "ledger.sqlite");
    const releases: Array<() => void> = [];
    const gates = Array.from(
      { length: 4 },
      () => new Promise<void>((resolve) => releases.push(resolve)),
    );
    const assignments = new Map<string, string>();
    let probes = 0;
    const transport: NativeMcpTransport = async (request) => {
      if (request.tool === "aphrody_job_status") {
        // Every snapshot was empty when captured; responses arrive after earlier ACKs.
        const gate = gates[Math.floor(probes++ / hosts.length)];
        if (gate) await gate;
        return envelope({ queue: { queued: 0, running: 0 } });
      }
      const key = String(request.arguments.idempotency_key);
      assignments.set(key, request.config);
      return envelope({ id: `remote-${key}`, state: "queued" });
    };
    const client = new AphrodyWebJobs(path, hosts, transport);
    const pending = ["a", "b", "c", "d"].map((key) =>
      client.submit({ key, args: ["dragon-ball", "sources"] }),
    );
    try {
      for (let index = 0; index < pending.length; index++) {
        releases[index]!();
        await pending[index];
      }
      expect([...assignments.values()]).toEqual([
        "/private/dbfr.toml",
        "/private/vps.toml",
        "/private/vps.toml",
        "/private/dbfr.toml",
      ]);
      // A new empty snapshot supersedes old ACK evidence, even before a local refresh.
      await client.submit({ key: "fresh", args: ["dragon-ball", "sources"] });
      expect(assignments.get("fresh")).toBe("/private/dbfr.toml");
    } finally {
      for (const release of releases) release();
      await Promise.allSettled(pending);
      client.close();
      await rm(directory, { recursive: true, force: true });
    }
  },
  process.platform === "win32" ? 60_000 : 5000,
);

test("terminal ACKs never reserve worker load in a delayed snapshot", async () => {
  const directory = await mkdtemp(join(tmpdir(), "shenron-jobs-"));
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let probes = 0;
  const assignments: string[] = [];
  const transport: NativeMcpTransport = async (request) => {
    if (request.tool === "aphrody_job_status") {
      if (request.arguments.id)
        return envelope({
          job: { id: "terminal", state: "succeeded", result: { completed: true } },
        });
      if (++probes > hosts.length) await gate;
      return envelope({ queue: { queued: 0, running: 0 } });
    }
    assignments.push(request.config);
    const key = String(request.arguments.idempotency_key);
    return envelope({ id: key, state: key === "terminal" ? "succeeded" : "queued" });
  };
  const client = new AphrodyWebJobs(join(directory, "ledger.sqlite"), hosts, transport);
  const first = client.submit({ key: "terminal", args: ["dragon-ball", "sources"] });
  const second = client.submit({ key: "after", args: ["dragon-ball", "sources"] });
  try {
    expect((await first).state).toBe("succeeded");
    release();
    await second;
    expect(assignments).toEqual(["/private/dbfr.toml", "/private/dbfr.toml"]);
  } finally {
    release();
    await Promise.allSettled([first, second]);
    client.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test("unqualified/unreachable workers leave no false execution receipt and cancellation persists", async () => {
  const directory = await mkdtemp(join(tmpdir(), "shenron-jobs-"));
  const path = join(directory, "ledger.sqlite");
  let cancel = false;
  const transport: NativeMcpTransport = async (request) => {
    expect(request.config).not.toContain("vps");
    if (request.tool === "aphrody_job_submit") return envelope({ id: "one", state: "queued" });
    if (request.tool === "aphrody_job_cancel") cancel = true;
    return envelope(
      request.arguments.id
        ? { job: { id: "one", state: cancel ? "cancelled" : "running", result: null } }
        : { queue: { queued: 0, running: 0 } },
    );
  };
  try {
    const unavailable = new AphrodyWebJobs(
      path,
      hosts.map((host) => ({ ...host, workerReady: false })),
      transport,
    );
    await expect(
      unavailable.submit({ key: "one", args: ["dragon-ball", "sources"] }),
    ).rejects.toThrow("No qualified");
    expect(unavailable.get("one")).toBeNull();
    unavailable.close();
    const client = new AphrodyWebJobs(
      path,
      hosts.map((host) => Object.assign({}, host, { workerReady: host.id === "dbfr" })),
      transport,
    );
    await client.submit({ key: "one", args: ["dragon-ball", "sources"] });
    expect((await client.cancel("one")).state).toBe("cancelled");
    client.close();
    const reopened = new AphrodyWebJobs(path, [], transport);
    expect((await reopened.refresh("one")).state).toBe("cancelled");
    reopened.close();
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
