// SPDX-License-Identifier: Apache-2.0
import { dirname, join } from "node:path";
import { isCompiledBinary } from "@aphrody/discord-kit";

/** Compiled Bun modules live in a virtual filesystem; the addon ships beside the executable. */
export async function configureCanvasBinding(
  env: Record<string, string | undefined> = process.env,
  options: { compiled?: boolean; execPath?: string; platform?: string; arch?: string } = {},
): Promise<string | null> {
  if (env.NAPI_RS_NATIVE_LIBRARY_PATH?.trim()) return env.NAPI_RS_NATIVE_LIBRARY_PATH;
  if (!(options.compiled ?? isCompiledBinary())) return null;
  const platform = options.platform ?? process.platform;
  const arch = options.arch ?? process.arch;
  const target =
    platform === "win32" ? `win32-${arch}-msvc` : platform === "linux" ? `linux-${arch}-gnu` : null;
  if (!target) return null;
  const path = join(dirname(options.execPath ?? process.execPath), `skia.${target}.node`);
  if (!(await Bun.file(path).exists())) return null;
  env.NAPI_RS_NATIVE_LIBRARY_PATH = path;
  return path;
}
