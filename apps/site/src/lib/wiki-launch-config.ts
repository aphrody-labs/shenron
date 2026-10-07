// SPDX-License-Identifier: Apache-2.0
/** Cached launch adapter; only the Bun host owns storage. */
import "server-only";
import { resolveHostUrl } from "@shenron/config/public-urls";
import {
  DEFAULT_LAUNCH_CONFIG,
  resolveLaunchConfig,
  type LaunchConfig,
} from "@shenron/config/wiki-launch-config";
import { createShenronApiClient } from "@shenron/api/client";
import { endpoints } from "@shenron/api/contract";

import { HostLaunchError } from "./host-launch-error";
export { HostLaunchError } from "./host-launch-error";

function hostLaunchClient(host: string, requestHeaders?: Headers, adminToken?: string | null) {
  const forward = Object.assign(
    (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
      const headers = new Headers(init?.headers);
      for (const name of ["cookie", "user-agent", ...(!adminToken ? ["authorization"] : [])]) {
        const value = requestHeaders?.get(name);
        if (value) headers.set(name, value);
      }
      return fetch(input, { ...init, headers, cache: "no-store" });
    },
    { preconnect: fetch.preconnect },
  );
  return createShenronApiClient({
    baseUrl: host,
    fetch: forward,
    adminToken: () => adminToken ?? null,
  });
}

async function readLaunchConfig(): Promise<LaunchConfig> {
  const host = resolveHostUrl(process.env);
  if (!host) return structuredClone(DEFAULT_LAUNCH_CONFIG);
  const result = await hostLaunchClient(host).call(endpoints.wikiLaunch, {});
  if (!result.ok) throw new HostLaunchError(result.kind === "http" ? result.status : 502);
  return resolveLaunchConfig(result.value.config);
}

export async function saveLaunchConfig(
  patch: Partial<LaunchConfig>,
  by?: string | null,
  requestHeaders?: Headers,
  adminToken?: string | null,
): Promise<LaunchConfig> {
  const host = resolveHostUrl(process.env);
  if (!host) throw new HostLaunchError(503);
  const result = await hostLaunchClient(host, requestHeaders, adminToken).call(
    endpoints.wikiLaunchSave,
    { body: patch },
  );
  if (!result.ok) throw new HostLaunchError(result.kind === "http" ? result.status : 502);
  const config = resolveLaunchConfig(result.value.config);
  generation++;
  cached = { config, expires: Date.now() + TTL_MS };
  pending = null;
  return config;
}

const TTL_MS = 30_000;
let cached: { config: LaunchConfig; expires: number } | null = null;
let pending: Promise<LaunchConfig> | null = null;
let generation = 0;

export async function getLaunchConfig(): Promise<LaunchConfig> {
  if (cached && Date.now() < cached.expires) return cached.config;
  if (pending) return pending;
  const started = generation;
  const flight = readLaunchConfig()
    .catch(() => cached?.config ?? structuredClone(DEFAULT_LAUNCH_CONFIG))
    .then((config) => {
      if (generation === started) cached = { config, expires: Date.now() + TTL_MS };
      return generation === started ? config : (cached?.config ?? config);
    });
  pending = flight;
  try {
    return await flight;
  } finally {
    if (pending === flight) pending = null;
  }
}

export async function getOpenCategoryKeys(): Promise<string[]> {
  return (await getLaunchConfig()).openKeys;
}
export type { LaunchConfig } from "@shenron/config/wiki-launch-config";
