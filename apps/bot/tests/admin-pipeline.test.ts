// SPDX-License-Identifier: Apache-2.0
import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, chmodSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AdminPipeline, loadAdminPlans } from "../src/api/admin-pipeline";
import type { runAphrodyCommand } from "@shenron/pipeline/aphrody/native-commands";

const success = {
  kind: "exit",
  ok: true,
  code: 0,
  data: undefined,
  stdout: "",
  stderr: "",
  durationMs: 1,
} as const;
async function fixture(execute: typeof runAphrodyCommand, target = "dbfr") {
  const home = mkdtempSync(join(tmpdir(), "shenron-admin-test-"));
  const config = join(home, "plans.json");
  await Bun.write(
    config,
    JSON.stringify({
      plans: [
        {
          id: "rag-stats",
          category: "rag",
          target,
          args: ["rag", "stats"],
          probe: ["rag", "stats"],
        },
      ],
    }),
  );
  chmodSync(config, 0o600);
  const env = {
    SHENRON_ADMIN_PIPELINE_HOME: home,
    SHENRON_ADMIN_PIPELINE_CONFIG: config,
    SHENRON_ADMIN_PIPELINE_HOST: "dbfr",
  };
  const pipeline = new AdminPipeline(env, execute);
  return {
    pipeline,
    home,
    config,
    env,
    close() {
      pipeline.close();
      rmSync(home, { recursive: true, force: true });
    },
  };
}
async function settled(pipeline: AdminPipeline, id: string) {
  for (let attempt = 0; attempt < 100; attempt++) {
    const job = pipeline.jobs().find((item) => item.id === id);
    if (job?.state !== "running") return job;
    await Bun.sleep(1);
  }
  throw new Error("Job did not settle");
}

describe("native admin pipeline", () => {
  test("refuses browser-supplied plans, cross-host execution and missing features", async () => {
    let calls = 0;
    const f = await fixture(async () => {
      calls++;
      return success;
    }, "vps");
    try {
      await expect(f.pipeline.submit("rag-stats", "native-job-001")).rejects.toThrow(
        "qualified host",
      );
      expect(calls).toBe(0);
      await expect(f.pipeline.submit("shell", "native-job-001")).rejects.toThrow(
        "Unknown installed",
      );
      await Bun.write(
        f.config,
        JSON.stringify({
          plans: [
            {
              id: "shell",
              category: "pipeline",
              target: "dbfr",
              args: ["sh", "-c", "echo 1"],
              probe: ["sh", "--help"],
            },
          ],
        }),
      );
      expect(() => loadAdminPlans(f.config)).toThrow();
    } finally {
      f.close();
    }
    const unavailable = await fixture(async () => ({ ...success, ok: false, code: 1 }));
    try {
      await expect(unavailable.pipeline.submit("rag-stats", "native-job-002")).rejects.toThrow(
        "unavailable",
      );
      expect(unavailable.pipeline.jobs()).toEqual([]);
    } finally {
      unavailable.close();
    }
  });
  test("persists actual completion and idempotency without storing captured provider data", async () => {
    let calls = 0;
    const f = await fixture(async () => {
      calls++;
      return { ...success, stdout: "private-provider-data" };
    });
    try {
      await f.pipeline.submit("rag-stats", "native-job-003");
      expect((await settled(f.pipeline, "native-job-003"))?.state).toBe("succeeded");
      await f.pipeline.submit("rag-stats", "native-job-003");
      expect(calls).toBe(2);
      expect(JSON.stringify(f.pipeline.jobs())).not.toContain("private-provider-data");
      f.pipeline.close();
      const reopened = new AdminPipeline(f.env);
      expect(reopened.jobs()[0]?.state).toBe("succeeded");
      reopened.close();
    } finally {
      f.close();
    }
  });
  test("cancellation waits for the native call to settle and frees the exclusive slot", async () => {
    let calls = 0;
    const f = await fixture(async (_args, options) => {
      if (++calls === 1) return success;
      await new Promise<void>((_resolve, reject) =>
        options?.signal?.addEventListener("abort", () => reject(new Error("cancelled")), {
          once: true,
        }),
      );
      return success;
    });
    try {
      await f.pipeline.submit("rag-stats", "native-job-004");
      await expect(f.pipeline.submit("rag-stats", "native-job-005")).rejects.toThrow(
        "already running",
      );
      expect(f.pipeline.cancel("native-job-004").state).toBe("cancelling");
      expect((await settled(f.pipeline, "native-job-004"))?.state).toBe("cancelled");
    } finally {
      f.close();
    }
  });
});
