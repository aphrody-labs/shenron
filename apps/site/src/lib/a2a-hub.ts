// SPDX-License-Identifier: Apache-2.0
/**
 * a2a-hub.ts — client of the Rust A2A server served by `aphrody a2a serve`
 * (crates/os/a2a-coord listener + crates/os/a2a-server routers).
 *
 * Upstream routes used:
 * - GET  /.well-known/agent-card.json  agent card
 * - GET  /coord                        mailbox snapshot (JSONL)
 * - POST /msg                          raw `.coord` envelope
 * - POST /a2a                          legacy JSON-RPC `message/send` bridge
 * - POST /                             A2A 1.0 JSON-RPC (SendMessage, GetTask, ListTasks, ...)
 *
 * Base URL: `APHRODY_A2A_URL`. Read per call, never at module load.
 *
 * Without `APHRODY_A2A_URL` (production since the Aphrody A2A service was retired on 2026-09-25),
 * the site answers itself with the in-process Shenron hub (`@aphrody/shenron-pipeline/aphrody/a2a`):
 * legacy `message/send`, `tasks/*` and the A2A 1.0 `SendMessage`, `GetTask`, `ListTasks`, with
 * tasks and envelopes kept in the durable store of `A2A_COORD_DIR`.
 */

import { ShenronA2AHub, type AdminNotifier } from "@aphrody/shenron-pipeline/aphrody/a2a";
import { resolveSiteUrl } from "@aphrody/shenron-config/public-urls";
import {
  A2A_DEFAULT_URL,
  A2A_URL_ENV,
  LEGACY_SEND_METHOD,
  a2aBaseUrl,
  fetchA2AAgentCard,
  fetchA2AEnvelopes,
  postA2AEnvelope,
  postA2AJsonRpc,
  type UpstreamReply,
} from "@aphrody/shenron-pipeline/aphrody/a2a-transport";

export { A2A_DEFAULT_URL, A2A_URL_ENV, LEGACY_SEND_METHOD, a2aBaseUrl };
export type { UpstreamReply };

/** Legacy task methods still sent by older peers, renamed for the A2A 1.0 root. */
export const LEGACY_METHOD_ALIASES: Readonly<Record<string, string>> = {
  "tasks/get": "GetTask",
  "tasks/list": "ListTasks",
  "tasks/cancel": "CancelTask",
};

/** `true` when an external A2A server is configured; otherwise the in-process hub answers. */
export function a2aUpstreamConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(env[A2A_URL_ENV]?.trim());
}

async function local(run: () => Promise<unknown> | unknown): Promise<UpstreamReply> {
  try {
    return { status: 200, body: await run() };
  } catch (err) {
    return {
      status: 503,
      body: {
        error: "a2a_store_unavailable",
        message: err instanceof Error ? err.message : String(err),
      },
    };
  }
}

/** Agent card: the upstream one, or the hub card on the public site origin. */
export function fetchAgentCard(): Promise<UpstreamReply> {
  if (a2aUpstreamConfigured()) return fetchA2AAgentCard({ noStore: true });
  return local(() => getA2AHub().getAgentCard(resolveSiteUrl(process.env)));
}

/** Last `limit` mailbox envelopes (upstream JSONL snapshot, or the hub store). */
export function fetchEnvelopes(limit = 100): Promise<UpstreamReply> {
  if (a2aUpstreamConfigured()) {
    return fetchA2AEnvelopes(limit, "application/x-ndjson", { noStore: true });
  }
  return local(() => getA2AHub().listStoredEnvelopes(limit));
}

/** Raw `.coord` envelope → upstream `/msg`, or the hub. */
export function postEnvelope(envelope: unknown): Promise<UpstreamReply> {
  if (a2aUpstreamConfigured()) return postA2AEnvelope(envelope, { noStore: true });
  return local(() => getA2AHub().handleMsgEnvelope(envelope));
}

/** JSON-RPC: upstream (legacy `message/send` → `/a2a`, other methods → root), or the hub. */
export function postJsonRpc(body: unknown): Promise<UpstreamReply> {
  if (a2aUpstreamConfigured())
    return postA2AJsonRpc(body, LEGACY_METHOD_ALIASES, { noStore: true });
  return local(() => getA2AHub().handleJsonRpc(body));
}

// ---------------------------------------------------------------------------
// In-process hub: `/api/a2a` without upstream, and `api/admin/dashboard-live`.
// ---------------------------------------------------------------------------

let configured = false;

const siteAdminNotifier: AdminNotifier = async (message) => {
  const { sendAdminLabMessage } = await import("@/lib/admin-lab");
  return sendAdminLabMessage(message);
};

/** Returns the in-process hub, configured once per process with the site admin notifier. */
export function getA2AHub(): typeof ShenronA2AHub {
  if (!configured) {
    ShenronA2AHub.configure({ notifier: siteAdminNotifier });
    configured = true;
  }
  return ShenronA2AHub;
}
