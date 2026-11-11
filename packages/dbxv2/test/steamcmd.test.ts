// SPDX-License-Identifier: Apache-2.0
import { describe, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  DBXV2_STEAM_APP_ID,
  DBXV2_DEPOTS,
  generateSteamcmdScript,
  verifyDbxv2Installation,
} from "../src/steamcmd";

describe("dbxv2 steamcmd automation", () => {
  test("declares official DBXV2 AppID and depots", () => {
    expect(DBXV2_STEAM_APP_ID).toBe(323470);
    expect(DBXV2_DEPOTS.content).toBe(323471);
    expect(DBXV2_DEPOTS.executableWindows).toBe(323472);
  });

  test("generates valid headless steamcmd script with validate flag", () => {
    const script = generateSteamcmdScript({
      installDir: "/srv/shenron/games/dbxv2",
      username: "shenron_ci",
      password: "secret_token",
      validate: true,
    });

    expect(script).toContain('force_install_dir "/srv/shenron/games/dbxv2"');
    expect(script).toContain("login shenron_ci secret_token");
    expect(script).toContain("app_update 323470 validate");
    expect(script).toContain("quit");
  });

  test("verifies mock DBXV2 installation integrity", async () => {
    const dir = mkdtempSync(join(tmpdir(), "dbxv2-mock-"));
    try {
      // Empty dir initially
      const reportEmpty = await verifyDbxv2Installation(dir);
      expect(reportEmpty.installed).toBe(false);
      expect(reportEmpty.missingRequirements.length).toBeGreaterThan(0);

      // Create structure
      mkdirSync(join(dir, "bin"), { recursive: true });
      const exeName = process.platform === "win32" ? "DBXV2.exe" : "DBXV2";
      writeFileSync(join(dir, "bin", exeName), "MOCK_EXE");
      writeFileSync(join(dir, "data.cpk"), "MOCK_CPK_DATA");
      writeFileSync(join(dir, "data2.cpk"), "MOCK_CPK_DATA2");

      const reportValid = await verifyDbxv2Installation(dir);
      expect(reportValid.installed).toBe(true);
      expect(reportValid.executableFound).toBe(true);
      expect(reportValid.dataCpks).toContain("data.cpk");
      expect(reportValid.dataCpks).toContain("data2.cpk");
      expect(reportValid.missingRequirements.length).toBe(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
