import { expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const script = await readFile(
  fileURLToPath(new URL("./fix-global-paths.ps1", import.meta.url)),
  "utf8",
);

test("global path repair discovers installed fork and cached runtime", () => {
  expect(script).toContain("$env:BUN_BIN");
  expect(script).toContain("C:\\bun\\build\\release\\bun.exe");
  expect(script).toContain("bun.exe");
  expect(script).toContain("--version");
  expect(script).toContain("picocolors");
  expect(script).toContain("tiny-invariant");
  expect(script).toContain("1.4.4");
  expect(script).toContain("Test-PublishedMain");
  expect(script).toContain("refs/remotes/bun-os/main");
  expect(script).toContain("merge-base --is-ancestor");
  expect(script).toContain("SetEnvironmentVariable('BUN_BIN', $InstalledBun, 'User')");
  expect(script).toContain("SetEnvironmentVariable('APHRODY_BUN_BIN_DIR', $InstallBin, 'User')");
});

test("global path repair removes only known build and legacy paths", () => {
  expect(script).toContain("C:\\\\Windows\\\\System32\\\\bun\\\.exe");
  expect(script).toContain("C:\\\\bun\\\\build\\\\release");
  expect(script).toContain("SetEnvironmentVariable('Path', $new, $scope)");
  expect(script).toContain("--Machine exige PowerShell eleve.");
});

test("global path repair audits by default and verifies resolution", () => {
  expect(script).toContain("[switch]$Apply");
  expect(script).toContain("[switch]$Verify");
  expect(script).toContain("Get-Command bun");
  expect(script).toContain("$Apply = $true");
  expect(script).toContain("Bun 1.4.4 qualifie introuvable");
});
