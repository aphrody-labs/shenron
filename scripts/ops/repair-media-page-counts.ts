// SPDX-License-Identifier: Apache-2.0
import { isAbsolute, resolve } from "node:path";

/** Preserve the typed site owner boundary; no site aliases enter the ops project. */
if (import.meta.main) {
  const directory = process.argv[2];
  if (
    !directory ||
    !isAbsolute(directory) ||
    process.argv.slice(3).some((arg) => arg !== "--apply")
  ) {
    throw new Error("Usage: repair-media-page-counts <private-absolute-job-directory> [--apply]");
  }
  const root = resolve(import.meta.dir, "../..");
  const child = Bun.spawn(
    [
      process.execPath,
      "--conditions",
      "react-server",
      "--tsconfig-override",
      resolve(root, "apps/site/tsconfig.json"),
      resolve(root, "apps/site/scripts/repair-media-page-counts.ts"),
      directory,
      ...process.argv.slice(3),
    ],
    { cwd: root, env: process.env, stdout: "inherit", stderr: "inherit" },
  );
  process.exitCode = await child.exited;
}
