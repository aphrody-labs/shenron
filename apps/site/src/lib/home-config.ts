// SPDX-License-Identifier: Apache-2.0
/** Request-cached home adapter; only the Bun host owns storage. */
import "server-only";
import { cache } from "react";
import { pickBestImage } from "@/lib/image-variants";
import { resolveHostUrl } from "@aphrody/shenron-config/public-urls";
import {
  DEFAULT_HOME_CONFIG,
  resolveHomeConfig,
  type HomeConfig,
} from "@aphrody/shenron-config/home";
import { createShenronApiClient } from "@aphrody/shenron-api/client";
import { endpoints } from "@aphrody/shenron-api/contract";
import { HostHomeError } from "./host-home-error";
export { HostHomeError } from "./host-home-error";
/**
 * Sert la meilleure résolution EXISTANTE de chaque image de scène : si la même
 * image (dHash identique) est hébergée en plus grand, c'est elle qui part au
 * héro. Le poster d'un clip reste tel quel (c'est une frame, pas un doublon).
 */
function upgradeSceneImages(config: HomeConfig): HomeConfig {
  const up = <T extends { image: string }>(s: T): T => ({
    ...s,
    image: pickBestImage([s.image]) ?? s.image,
  });
  return {
    ...config,
    hero: { ...config.hero, scenes: config.hero.scenes.map(up) },
    sections: config.sections.map((sec) => (sec.scene ? { ...sec, scene: up(sec.scene) } : sec)),
  };
}

function hostHomeClient(host: string, requestHeaders?: Headers, adminToken?: string | null) {
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

export const getHomeConfig = cache(async (): Promise<HomeConfig> => {
  const host = resolveHostUrl(process.env);
  if (!host) return upgradeSceneImages(structuredClone(DEFAULT_HOME_CONFIG));
  const result = await hostHomeClient(host).call(endpoints.homeConfig, {});
  return upgradeSceneImages(
    result.ok ? resolveHomeConfig(result.value.config) : structuredClone(DEFAULT_HOME_CONFIG),
  );
});

export async function saveHomeConfig(
  patch: unknown,
  by?: string | null,
  requestHeaders?: Headers,
  adminToken?: string | null,
): Promise<HomeConfig> {
  const host = resolveHostUrl(process.env);
  if (!host) throw new HostHomeError(503);
  const result = await hostHomeClient(host, requestHeaders, adminToken).call(
    endpoints.homeConfigSave,
    { body: patch },
  );
  if (!result.ok) throw new HostHomeError(result.kind === "http" ? result.status : 502);
  return resolveHomeConfig(result.value.config);
}
