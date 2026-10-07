// SPDX-License-Identifier: Apache-2.0
/** Node server consumer of the authenticated Shenron Web API; no native runtime imports. */
import { readFile } from "node:fs/promises";
import { envFirst, ENV_ALIASES } from "@shenron/config/env";
import { resolveHostUrl } from "@shenron/config/public-urls";
import {
  WEB_PATHS,
  WebStatus,
  WebImage,
  WebFrameSearch,
  WebMediaResolve,
  WebMediaSearch,
  WebMediaSource,
  WebMediaResults,
  BxcFramesStatsSchema,
  BxcVectorOutputSchema,
  BxcSearchOutputSchema,
} from "./contracts";
import type { z } from "zod";
import { DragonballCnSnapshotService } from "./snapshot";
export type {
  DbcnCatalogCategory,
  FrameMatch,
  BxcSearchOutput,
  BxcVectorOutput,
} from "./contracts";

export interface BxcServerOptions {
  baseUrl?: string;
  token?: string;
  fetcher?: typeof fetch;
}
/** Source configuration is resolved on each call; it never establishes runtime readiness. */
export class BxcServerBridge {
  readonly dragonballcn = new DragonballCnSnapshotService();
  readonly frames = {
    stats: () => this.call(WEB_PATHS.framesStats, BxcFramesStatsSchema),
    vector: async (path: string) =>
      this.call(
        WEB_PATHS.framesVector,
        BxcVectorOutputSchema,
        WebImage.parse({ imageBase64: (await readFile(path)).toString("base64") }),
      ),
    search: async (
      path: string,
      mode: "--local" | "--remote" = "--local",
      options: { limit?: number } = {},
    ) =>
      this.call(
        WEB_PATHS.framesSearch,
        BxcSearchOutputSchema,
        WebFrameSearch.parse({
          imageBase64: (await readFile(path)).toString("base64"),
          mode,
          ...options,
        }),
      ),
  };
  readonly media = {
    resolveEmbed: (url: string) =>
      this.call(WEB_PATHS.mediaResolve, WebMediaSource, WebMediaResolve.parse({ url })),
    searchMedia: (query: string) =>
      this.call(WEB_PATHS.mediaSearch, WebMediaResults, WebMediaSearch.parse({ query })),
  };
  constructor(private readonly options: BxcServerOptions = {}) {}
  private configuration() {
    const base = this.options.baseUrl ?? resolveHostUrl(process.env);
    const token = this.options.token ?? envFirst(process.env, ENV_ALIASES.adminToken)?.value;
    if (!base || !token) throw new Error("The authenticated Shenron Web owner is not configured");
    const url = new URL(base);
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password)
      throw new Error("Invalid Shenron Web owner URL");
    return { url, token };
  }
  private async call<S extends z.ZodType>(
    path: string,
    schema: S,
    body?: unknown,
  ): Promise<z.infer<S>> {
    const { url, token } = this.configuration();
    const response = await (this.options.fetcher ?? fetch)(new URL(path, url), {
      method: body === undefined ? "GET" : "POST",
      headers: {
        accept: "application/json",
        authorization: `Bearer ${token}`,
        ...(body === undefined ? {} : { "content-type": "application/json" }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      redirect: "manual",
      cache: "no-store",
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok)
      throw new Error(`Shenron Web capability unavailable (HTTP ${response.status})`);
    const parsed = schema.safeParse(await response.json());
    if (!parsed.success) throw new Error("The Shenron Web owner returned an invalid receipt");
    return parsed.data;
  }
  async status() {
    return this.call(WEB_PATHS.status, WebStatus);
  }
  async version(): Promise<string> {
    return (await this.status()).version;
  }
  resolvePath(): string {
    try {
      const value = this.options.baseUrl ?? resolveHostUrl(process.env);
      if (!value) return "unconfigured";
      const url = new URL(value);
      return url.username || url.password ? "unconfigured" : url.origin;
    } catch {
      return "unconfigured";
    }
  }
}
export const bxc = new BxcServerBridge();
