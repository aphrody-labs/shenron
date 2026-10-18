// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "bun:test";
import { BunVideoAutonomousEngine } from "./bun-autonomous-engine";

describe("BunVideoAutonomousEngine", () => {
  it("probes DNS using native Bun.dns", async () => {
    const engine = new BunVideoAutonomousEngine();
    const result = await engine.probeDns("dragonballfr.com");
    expect(result.ipv4.length).toBeGreaterThan(0);
  });

  it("probes TCP connectivity using native Bun.connect", async () => {
    const engine = new BunVideoAutonomousEngine();
    const result = await engine.probeTcp("dragonballfr.com", 443);
    expect(result.reachable).toBe(true);
    expect(result.latencyMs).toBeGreaterThan(0);
  });

  it("probes and extracts video metadata using native Bun.FetchSession", async () => {
    const engine = new BunVideoAutonomousEngine();
    const probe = await engine.probeVideoPage("https://dragonballfr.com/wiki/episodes/875");
    expect(probe.status).toBe(200);
    expect(probe.title).toContain("Le dieu de la Destruction");
  });
});
