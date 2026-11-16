// SPDX-License-Identifier: Apache-2.0

/**
 * Command prefix that runs uv: the `uv` binary on PATH (CI installs it with
 * astral-sh/setup-uv), otherwise the `bun uv` subcommand of the Aphrody runtime.
 * Official upstream Bun has no `uv` subcommand.
 */
export function uvCommand(): string[] {
  const binary = Bun.which("uv");
  return binary ? [binary] : [process.execPath, "uv"];
}
