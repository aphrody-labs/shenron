/**
 * `next start` serves the asset prefix and deployment id the build baked into the Turbopack
 * runtime, whatever the service environment says. A mismatch left the site unhydrated: HTML
 * chunks under the CDN, a runtime waiting for them under `/_next/`, every handler dead.
 */
import { afterAll, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { PHASE_DEVELOPMENT_SERVER, PHASE_PRODUCTION_SERVER } from "next/constants";
import { readBuiltClientConfig } from "@/lib/build-frozen-config";

const dist = mkdtempSync(path.join(tmpdir(), "shenron-next-dist-"));
afterAll(() => rmSync(dist, { recursive: true, force: true }));

function writeBuild(config: Record<string, unknown>) {
  writeFileSync(path.join(dist, "required-server-files.json"), JSON.stringify({ config }));
}

describe("build-frozen client config", () => {
  test("reads the prefix and the deployment id of the build", () => {
    writeBuild({ assetPrefix: "", deploymentId: "abc" });
    expect(readBuiltClientConfig(dist)).toEqual({ assetPrefix: "", deploymentId: "abc" });
    expect(readBuiltClientConfig(path.join(dist, "missing"))).toBeNull();
  });

  test("next start keeps the build values over the runtime environment", async () => {
    writeBuild({ assetPrefix: "", deploymentId: "build-sha" });
    process.env.NEXT_DIST_DIR = dist;
    process.env.NEXT_PUBLIC_CDN_URL = "https://cdn.example.test";
    process.env.NEXT_DEPLOYMENT_ID = "";
    const { default: config } = await import("../next.config");
    const server = config(PHASE_PRODUCTION_SERVER);
    expect(server.assetPrefix).toBeUndefined();
    expect(server.deploymentId).toBe("build-sha");
    // Outside `next start`, the environment rules (dev server, build).
    expect(config(PHASE_DEVELOPMENT_SERVER).assetPrefix).toBe("https://cdn.example.test");
  });
});
