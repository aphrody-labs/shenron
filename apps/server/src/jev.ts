// SPDX-License-Identifier: Apache-2.0
import { createChatJevPort, type ChatJevPort } from "@shenron/api/chat";
import { resolveJev } from "@shenron/config/jev";
import { shenronWorkerPool } from "@shenron/native/worker";

/** Native loading stays lazy: a missing FFI library reports a sanitized failed tool per turn. */
export function nativeChatJev(env: NodeJS.ProcessEnv, library?: string | null): ChatJevPort | null {
  if (!resolveJev(env).enabled) return null;
  return createChatJevPort((request, options) =>
    shenronWorkerPool(library ? { path: library } : undefined).jevRerank(request, options),
  );
}
