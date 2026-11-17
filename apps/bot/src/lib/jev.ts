// SPDX-License-Identifier: Apache-2.0
import { createChatJevPort, type ChatJevPort } from "@aphrody/shenron-api/chat";
import { resolveJev } from "@aphrody/shenron-config/jev";
import { shenronWorkerPool } from "@aphrody/shenron-native/worker";

export function botChatJev(env: NodeJS.ProcessEnv): ChatJevPort | null {
  if (!resolveJev(env).enabled) return null;
  return createChatJevPort((request, options) => shenronWorkerPool().jevRerank(request, options));
}
