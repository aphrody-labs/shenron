// SPDX-License-Identifier: Apache-2.0
import { existsSync } from "node:fs";
import { delimiter, dirname, isAbsolute } from "node:path";

export function nativeRuntime(configured: string | undefined): string {
  if (!configured) return process.execPath;
  if (!isAbsolute(configured) || !existsSync(configured))
    throw new Error("SHENRON_BUN_EXECUTABLE must name an existing absolute runtime path");
  return configured;
}

export function nativeEnvironment(runtime: string, command: string): NodeJS.ProcessEnv {
  return {
    ...process.env,
    PATH: [dirname(runtime), process.env.PATH].filter(Boolean).join(delimiter),
    // The lifecycle identifies the built-in command and prevents same-named scripts
    // from shadowing it in child processes.
    npm_lifecycle_event: command,
  };
}
