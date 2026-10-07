// SPDX-License-Identifier: Apache-2.0

/** cargo-xwin sets target CFLAGS itself; retain the Windows 11 SIMD baseline in generic CFLAGS. */
export function msvcCrossConfig(cflags = ""): string[] {
  const flags = `${cflags.trim()} -msse4.1`.trim();
  return [
    "--config",
    `env.CFLAGS.value=${JSON.stringify(flags)}`,
    "--config",
    "env.CFLAGS.force=true",
  ];
}
