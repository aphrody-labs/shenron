// SPDX-License-Identifier: Apache-2.0
import { existsSync } from "node:fs";
import { delimiter, dirname, isAbsolute, join } from "node:path";

export function nativeRuntime(configured: string | undefined): string {
  if (!configured) return process.execPath;
  if (!isAbsolute(configured) || !existsSync(configured))
    throw new Error("SHENRON_BUN_EXECUTABLE must name an existing absolute runtime path");
  return configured;
}

export function nativeEnvironment(
  runtime: string,
  command: string,
  cwd: string,
): NodeJS.ProcessEnv {
  return {
    ...process.env,
    PATH: [dirname(runtime), process.env.PATH].filter(Boolean).join(delimiter),
    // The lifecycle identifies the built-in command and prevents same-named scripts
    // from shadowing it in child processes.
    npm_lifecycle_event: command,
    // Bun honours that guard only when npm_package_json names the package.json of the
    // directory it runs in; inside `bun run <script>` the inherited value is the caller's.
    npm_package_json: join(cwd, "package.json"),
  };
}
