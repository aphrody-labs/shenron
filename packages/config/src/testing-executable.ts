// SPDX-License-Identifier: Apache-2.0
import { chmodSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/** Fixture CLI using the test runner's Bun, with a native executable on Windows. */
export function testExecutable(dir: string, name: string, code: string): string {
  const source = join(dir, `${name}.ts`);
  writeFileSync(source, code);
  const executable = join(dir, `${name}${process.platform === "win32" ? ".exe" : ""}`);
  if (process.platform === "win32") {
    const built = Bun.spawnSync([
      process.execPath,
      "build",
      "--compile",
      "--outfile",
      executable,
      source,
    ]);
    if (built.exitCode !== 0) throw new Error(built.stderr.toString());
  } else {
    const quote = (value: string) => `'${value.replaceAll("'", "'\\''")}'`;
    writeFileSync(executable, `#!/bin/sh\nexec ${quote(process.execPath)} ${quote(source)} "$@"\n`);
    chmodSync(executable, 0o755);
  }
  return executable;
}
