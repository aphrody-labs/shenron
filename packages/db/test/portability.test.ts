// SPDX-License-Identifier: Apache-2.0
import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import {
  checkEmptyEnvImports,
  checkNoEscapingImports,
  checkPackageRuntimes,
} from "@shenron/config/guards";

const PACKAGE_DIR = join(import.meta.dir, "..");

describe("@shenron/db portability", () => {
  test(
    "runtime classes hold for every exported entry",
    async () => {
      expect(await checkPackageRuntimes(PACKAGE_DIR)).toEqual([]);
      // The Windows debug runtime takes about 21 s to scan every export's import closure.
    },
    process.platform === "win32" ? 60_000 : 5_000,
  );
  test("no import escapes the package", async () => {
    expect(await checkNoEscapingImports(PACKAGE_DIR)).toEqual([]);
  });
  test("every subpath imports with an empty environment", async () => {
    expect(await checkEmptyEnvImports(PACKAGE_DIR)).toEqual([]);
  }, 120_000);
});
