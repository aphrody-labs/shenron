// SPDX-License-Identifier: Apache-2.0
/** Exact public surface of `@aphrody/shenron-pipeline/shenron` and its subpaths (B16). */
import { describe, expect, it } from "bun:test";
import * as root from "../../src/shenron/index";
import * as cli from "../../src/shenron/cli";
import pkg from "../../package.json";

describe("@aphrody/shenron-pipeline/shenron exports", () => {
  it("root exposes the shared service clients and script adapters", () => {
    expect(Object.keys(root).toSorted()).toEqual(
      [
        "ShenronComputeClient",
        "SHENRON_EMBED_DIMENSIONS",
        "SHENRON_EMBED_MODEL",
        "ShenronEmbeddingsClient",
        "shenronInfraCheck",
        "shenronInfraStatus",
      ].toSorted(),
    );
  });

  it("root no longer carries the FFI bridge nor the A2A hub", () => {
    const names = Object.keys(root);
    for (const gone of [
      "ShenronNativeBridge",
      "ShenronBridge",
      "ShenronA2AHub",
      "searchMemory",
      "mcpCall",
    ]) {
      expect(names).not.toContain(gone);
    }
  });

  it("cli subpath exposes the JSON wrappers", () => {
    expect(Object.keys(cli).toSorted()).toEqual(
      [
        "DEFAULT_SHENRON_CLI_TIMEOUT_MS",
        "shenronDoctor",
        "shenronGitInspect",
        "runShenronCli",
        "runShenronCommand",
      ].toSorted(),
    );
  });

  it("manifest maps every subpath to source with a runtime class", () => {
    expect(pkg.private).toBe(false);
    expect(pkg.exports["./shenron"]).toBe("./src/shenron/index.ts");
    expect(pkg.exports["./shenron/compute"]).toBe("./src/shenron/compute.ts");
    expect(pkg.exports["./shenron/cli"]).toBe("./src/shenron/cli.ts");
    expect(pkg.shenron.runtime["./shenron"]).toBe("bun");
    // Native command consumers belong to the Bun boundary even with lazy FFI loading.
    expect(pkg.shenron.runtime["./shenron/cli"]).toBe("bun");
  });

  it("a2a subpath keeps the hub API", async () => {
    const a2a = await import("../../src/shenron/a2a");
    expect(typeof a2a.ShenronA2AHub.configure).toBe("function");
    expect(typeof a2a.ShenronA2AHub.handleJsonRpc).toBe("function");
    expect(typeof a2a.ShenronA2AHub.setProbes).toBe("function");
  });
});
