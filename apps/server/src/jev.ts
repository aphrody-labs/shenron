// SPDX-License-Identifier: Apache-2.0
import { createChatJevPort, type ChatJevPort } from "@aphrody/shenron-api/chat";
import { resolveJev } from "@aphrody/shenron-config/jev";
import { shenronWorkerPool } from "@aphrody/shenron-native/worker";

/** Native loading stays lazy: a missing FFI library reports a sanitized failed tool per turn. */
export function nativeChatJev(env: NodeJS.ProcessEnv, library?: string | null): ChatJevPort | null {
  if (!resolveJev(env).enabled) return null;
  return createChatJevPort((request, options) =>
    shenronWorkerPool(library ? { path: library } : undefined).jevRerank(request, options),
  );
}
