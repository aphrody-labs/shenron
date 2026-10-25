/**
 * `next start` serves the asset prefix and deployment id the build baked into the Turbopack
 * runtime, whatever the service environment says (`withBun` of `@aphrody/next-bun`). A mismatch
 * left the site unhydrated: HTML chunks under the CDN, a runtime waiting for them under
 * `/_next/`, every handler dead.
 */
import { afterAll, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  PHASE_DEVELOPMENT_SERVER,
  PHASE_PRODUCTION_BUILD,
  PHASE_PRODUCTION_SERVER,
} from "next/constants";

const dist = mkdtempSync(path.join(tmpdir(), "shenron-next-dist-"));
afterAll(() => rmSync(dist, { recursive: true, force: true }));

describe("build-frozen client config", () => {
  test("next start keeps the build values over the runtime environment", async () => {
    writeFileSync(
      path.join(dist, "required-server-files.json"),
      JSON.stringify({ config: { assetPrefix: "", deploymentId: "build-sha" } }),
    );
    process.env.NEXT_DIST_DIR = dist;
    process.env.NEXT_PUBLIC_CDN_URL = "https://cdn.example.test";
    process.env.NEXT_DEPLOYMENT_ID = "";
    const { default: config } = await import("../next.config");
    const server = await config(PHASE_PRODUCTION_SERVER, {});
    expect(server.assetPrefix).toBeUndefined();
    expect(server.deploymentId).toBe("build-sha");
    // Build chunks use the CDN; development chunks only exist on the local server.
    expect((await config(PHASE_DEVELOPMENT_SERVER, {})).assetPrefix).toBeUndefined();
    expect((await config(PHASE_PRODUCTION_BUILD, {})).assetPrefix).toBe("https://cdn.example.test");
  });
});
