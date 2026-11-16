// SPDX-License-Identifier: Apache-2.0
import "server-only";
import { createChatJevPort, type ChatJevPort } from "@shenron/api/chat";
import { resolveJev } from "@shenron/config/jev";
import { shenronWorkerPool } from "@shenron/native/worker";

export function siteChatJev(env: NodeJS.ProcessEnv): ChatJevPort | null {
  if (!resolveJev(env).enabled) return null;
  return createChatJevPort((request, options) => shenronWorkerPool().jevRerank(request, options));
}
