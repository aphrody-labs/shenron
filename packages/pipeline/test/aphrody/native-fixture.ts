// SPDX-License-Identifier: Apache-2.0
/** Existing command contract fixtures execute against an injected native port,
 * with isolated argv/stdio, rather than launching test executables. */
import { format } from "node:util";
import type { NativeCommandExecutor } from "../../src/aphrody/native-commands";

const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor as new (
  ...parts: string[]
) => (process: unknown, console: unknown, runtime: unknown) => Promise<void>;

export function nativeFixture(_name: string, source: string): NativeCommandExecutor {
  const run = new AsyncFunction("process", "console", "Bun", source);
  return async (args, controls) => {
    controls.signal?.throwIfAborted();
    let stdout = "",
      stderr = "",
      code = 0;
    const exited = Symbol("fixture exit");
    try {
      await run(
        {
          argv: ["native", "aphrody", ...args],
          exit: (value: number) => {
            code = value;
            throw exited;
          },
        },
        {
          log: (...values: unknown[]) => {
            stdout += format(...values) + "\n";
          },
          error: (...values: unknown[]) => {
            stderr += format(...values) + "\n";
          },
        },
        {
          sleep: async () => {
            throw new Error(`timed out after ${controls.timeoutMs} ms`, {
              cause: "native-deadline",
            });
          },
        },
      );
    } catch (error) {
      if (error !== exited) throw error;
    }
    return { code, stdout, stderr };
  };
}
