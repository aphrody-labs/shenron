// SPDX-License-Identifier: Apache-2.0
/** Request-cached chronology adapter; only the Bun host owns storage. */
import "server-only";
import { cache } from "react";
import { resolveHostUrl } from "@aphrody/shenron-config/public-urls";
import {
  DEFAULT_CHRONOLOGY_CONFIG,
  resolveChronologyConfig,
  type ChronologyConfig,
  type TimelineItem,
} from "@aphrody/shenron-config/chronology";
import { createShenronApiClient } from "@aphrody/shenron-api/client";
import { endpoints } from "@aphrody/shenron-api/contract";
import type { TimelineEvent, TimelineAtlas } from "@aphrody/shenron-api/contract";

import { HostChronologyError } from "./host-chronology-error";
export { HostChronologyError } from "./host-chronology-error";

function hostChronologyClient(host: string, requestHeaders?: Headers, adminToken?: string | null) {
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

export const getChronologyConfig = cache(async (): Promise<ChronologyConfig> => {
  const host = resolveHostUrl(process.env);
  if (!host) return structuredClone(DEFAULT_CHRONOLOGY_CONFIG);
  const result = await hostChronologyClient(host).call(endpoints.chronology, {});
  return result.ok ? resolveChronologyConfig(result.value.config) : DEFAULT_CHRONOLOGY_CONFIG;
});

export async function saveChronologyConfig(
  patch: unknown,
  by?: string | null,
  requestHeaders?: Headers,
  adminToken?: string | null,
): Promise<ChronologyConfig> {
  const host = resolveHostUrl(process.env);
  if (!host) throw new HostChronologyError(503);
  const result = await hostChronologyClient(host, requestHeaders, adminToken).call(
    endpoints.chronologySave,
    { body: patch },
  );
  if (!result.ok) throw new HostChronologyError(result.kind === "http" ? result.status : 502);
  return resolveChronologyConfig(result.value.config);
}

export async function getTimelineItems(): Promise<TimelineItem[]> {
  const host = resolveHostUrl(process.env);
  if (!host) throw new HostChronologyError(503);
  const result = await hostChronologyClient(host).call(endpoints.timelineItems, {});
  if (!result.ok) throw new HostChronologyError(result.kind === "http" ? result.status : 502);
  return result.value.items;
}

export async function getTimelineEvents(era?: string): Promise<TimelineEvent[]> {
  const host = resolveHostUrl(process.env);
  if (!host) throw new HostChronologyError(503);
  const result = await hostChronologyClient(host).call(endpoints.timelineEvents, {
    query: { era },
  });
  if (!result.ok) throw new HostChronologyError(result.kind === "http" ? result.status : 502);
  return result.value.events;
}

export async function getTimelineAtlas(): Promise<TimelineAtlas> {
  const host = resolveHostUrl(process.env);
  if (!host) throw new HostChronologyError(503);
  const result = await hostChronologyClient(host).call(endpoints.timelineAtlas, {});
  if (!result.ok) throw new HostChronologyError(result.kind === "http" ? result.status : 502);
  return result.value;
}
