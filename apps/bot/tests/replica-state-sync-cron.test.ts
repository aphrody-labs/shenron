// SPDX-License-Identifier: Apache-2.0
/** ReplicaSyncCronEvent: registration in the cron registry, live cadence, nothing without a database. */
import "./setup";
import { describe, expect, it, spyOn } from "bun:test";
import { container } from "tsyringe";
import { CronRegistry } from "../src/api/cron-registry";
import { DatabaseService } from "../src/db/index";
import {
  REPLICA_SYNC_JOB,
  REPLICA_SYNC_STARTUP_DELAY_MS,
  ReplicaSyncCronEvent,
} from "../src/events/ReplicaSyncCron";
import { logger } from "../src/lib/logger";
import { EventBusService } from "../src/services/EventBusService";
import { ReplicaSyncService } from "../src/services/ReplicaSyncService";
import { PgService } from "../src/db/pg";
import { REPLICA_SYNC_INTERVAL_MINUTES, SettingsService } from "../src/services/SettingsService";

const ENV = {
  DATABASE_URL: "postgres://bot:secret@127.0.0.1:1/shenron_test",
  NODE_ENV: "production",
};

function build(env: Record<string, string | undefined>) {
  // The registry reads its cadence override through the container: share its instances.
  const dbs = container.resolve(DatabaseService);
  const bus = container.resolve(EventBusService);
  const settings = container.resolve(SettingsService);
  const service = new ReplicaSyncService(
    dbs,
    PgService.withEnv(env, () => ({}) as never),
    settings,
  );
  service.env = env;
  const passes: string[] = [];
  service.runPass = async (trigger = "cron") => {
    passes.push(trigger);
    return null;
  };
  const cron = new CronRegistry();
  const event = new ReplicaSyncCronEvent(cron, service, settings, dbs, bus);
  return { event, cron, settings, passes, service };
}

describe("ReplicaSyncCronEvent", () => {
  it("registers nothing, and says so, without DATABASE_URL", async () => {
    const info = spyOn(logger, "info").mockImplementation(() => {});
    const { event, cron } = build({});
    await event.register();
    expect(cron.list().some((job) => job.name === REPLICA_SYNC_JOB)).toBe(false);
    expect(info.mock.calls.some((call) => String(call[0]).includes("inactive"))).toBe(true);
    info.mockRestore();
    cron.stopAll();
  });

  it("registers the job at the configured cadence and runs a pass on demand", async () => {
    const { event, cron, passes } = build(ENV);
    await event.register();
    const job = cron.list().find((candidate) => candidate.name === REPLICA_SYNC_JOB)!;
    expect(job).toMatchObject({
      owner: "database",
      category: "periodic",
      idempotent: true,
      intervalMs: 15 * 60_000,
    });
    const result = await cron.run(REPLICA_SYNC_JOB);
    expect(result.ok).toBe(true);
    expect(passes).toEqual(["cron"]);
    expect(REPLICA_SYNC_STARTUP_DELAY_MS).toBeGreaterThanOrEqual(30_000);
    cron.stopAll();
  });

  it("follows the cadence setting live", async () => {
    const { event, cron, settings } = build(ENV);
    await event.register();
    await settings.set(REPLICA_SYNC_INTERVAL_MINUTES, "5");
    await Bun.sleep(100);
    expect(cron.list().find((job) => job.name === REPLICA_SYNC_JOB)!.intervalMs).toBe(5 * 60_000);
    await settings.set(REPLICA_SYNC_INTERVAL_MINUTES, "30");
    await Bun.sleep(100);
    expect(cron.list().find((job) => job.name === REPLICA_SYNC_JOB)!.intervalMs).toBe(30 * 60_000);
    cron.stopAll();
  });
});
