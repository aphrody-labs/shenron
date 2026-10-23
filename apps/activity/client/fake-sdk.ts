// SPDX-License-Identifier: Apache-2.0
/**
 * Development stand-in for the Embedded App SDK, active with `?mock=1` on a development build.
 * It plays the handshake (`ready`, `authorize`, `authenticate`) with the same shapes as the real
 * SDK, so the whole client runs in a plain browser against a server started with
 * `SHENRON_ACTIVITY_DEV_AUTH=1` (`bun run dev`).
 *
 *   ?mock=1                 one window, plays "Son Goku" with 3 simulated opponents
 *   ?mock=1&user=2          this window plays the second character (open several windows)
 *   ?mock=1&bots=0          no simulated opponents
 *   ?mock=1&fast=1          opponents answer within a second (browser checks)
 *   ?mock=1&lang=ja         Discord locale reported by the stand-in
 *   ?mock=1&instance=abc    room to join (default: "mock-instance")
 */
import type { ActivitySdk } from "./sdk";

const pause = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export function createFakeSdk(params: URLSearchParams, apiBase: string): ActivitySdk {
  const slot = Math.min(8, Math.max(1, Number(params.get("user") ?? 1) || 1));
  const bots = Math.min(7, Math.max(0, Number(params.get("bots") ?? 3) || 0));
  const instance = (params.get("instance") ?? "mock-instance").replace(/[^A-Za-z0-9_.:-]/g, "");
  const lang = params.get("lang");
  return {
    kind: "mock",
    instanceId: instance || "mock-instance",
    guildId: null,
    apiBase,
    mock: { slot, bots, fast: params.get("fast") === "1" },
    async ready() {
      await pause(30);
    },
    async authorize() {
      await pause(30);
      return `mock-code-${slot}`;
    },
    async authenticate() {
      await pause(30);
    },
    async locale() {
      return lang ?? navigator.language;
    },
    async invite() {
      // No Discord to open an invite dialog in.
    },
  };
}
