// SPDX-License-Identifier: Apache-2.0
import { describe, expect, test } from "bun:test";
import { computeUpstreamWeights, renderNginxWeights } from "./quota-guard";
import { buildPreprodPlan, XBUILD_ROOT } from "./ci-preprod";

describe("VPS quota-guard & pre-prod CI plan", () => {
  test("shifts upstream weights to VPS shield before hitting free quota ceiling", () => {
    const low = computeUpstreamWeights([
      { provider: "neon", metric: "compute_seconds", used: 1000, limit: 288000, ratio: 0.01 },
    ]);
    expect(low.mode).toBe("cloud-primary");
    expect(low.vercelWeight).toBe(100);
    expect(renderNginxWeights(low)).toContain("127.0.0.1:18082 backup");

    const mid = computeUpstreamWeights([
      { provider: "neon", metric: "data_transfer_bytes", used: 60, limit: 100, ratio: 0.6 },
    ]);
    expect(mid.mode).toBe("balanced");
    expect(mid.vercelWeight).toBe(35);
    expect(mid.vpsWeight).toBe(65);

    const high = computeUpstreamWeights([
      { provider: "vercel", metric: "edge_requests", used: 80, limit: 100, ratio: 0.8 },
    ]);
    expect(high.mode).toBe("vps-shield");
    expect(high.vercelWeight).toBe(0);
    expect(high.vpsWeight).toBe(100);
    expect(renderNginxWeights(high)).toContain("127.0.0.1:18081 down;");
  });

  test("pre-prod CI targets xbuild cleanly without user home directories", () => {
    const plan = buildPreprodPlan();
    expect(plan.remoteDir).toBe(XBUILD_ROOT);
    expect(plan.remoteDir).toContain("xbuild/shenron");
    expect(plan.remoteDir).not.toMatch(/^\/(?:home|Users)\//);
    expect(plan.deployCommands).toContain(
      "bunx vercel deploy --prebuilt --prod --archive=tgz --yes",
    );
  });
});
