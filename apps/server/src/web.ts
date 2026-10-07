// SPDX-License-Identifier: Apache-2.0
/** Native Web capabilities share Aphrody's FFI owner; no process is started per request. */
import type { WebPort } from "@shenron/api/server";
import { AphrodyFramesClient } from "@shenron/pipeline/aphrody/frames";
import { AphrodyMediaService } from "@shenron/pipeline/aphrody/media";
import {
  runAphrodyCommand,
  type NativeCommandExecutor,
} from "@shenron/pipeline/aphrody/native-commands";

export async function createNativeWebPort(
  executor?: NativeCommandExecutor,
): Promise<WebPort | null> {
  const version = await runAphrodyCommand(["--version"], { nativeExecutor: executor });
  if (version.kind !== "exit" || !version.ok || !/^aphrody\s+\S+/.test(version.stdout.trim()))
    return null;
  const help = await runAphrodyCommand(["web", "--help"], { nativeExecutor: executor });
  if (help.kind !== "exit" || !help.ok) return null;
  const framesReady = /^\s+frames\s/m.test(help.stdout);
  const mediaReady = /^\s+media\s/m.test(help.stdout);
  const capabilities: Array<"frames-stats" | "media-resolve"> = [];
  if (framesReady) capabilities.push("frames-stats");
  if (mediaReady) capabilities.push("media-resolve");
  const frames = new AphrodyFramesClient({ nativeExecutor: executor });
  const media = new AphrodyMediaService({ nativeExecutor: executor });
  return {
    status: async () => ({ version: version.stdout.trim(), capabilities }),
    ...(framesReady ? { framesStats: () => frames.stats() } : {}),
    ...(mediaReady
      ? { mediaResolve: (input, signal) => media.resolveSource(input.url, { signal }) }
      : {}),
    // File-based frames currently invoke FFmpeg; do not silently fall through to that path.
    // Anime catalogue search has no native Web command and remains unavailable as well.
  };
}
