// SPDX-License-Identifier: Apache-2.0
import { expect, test } from "bun:test";
import { createBunSql } from "@aphrody/shenron-db/bun-sql";
import { createDefaultPageBanners } from "@aphrody/shenron-config/page-banners";
import { createHostPageBanners } from "../src/host/page-banners";
import { createShenronApiClient } from "../src/client";
import { endpoints } from "../src/contract";
import { createShenronApi } from "../src/server";
import { createMemoryRateLimiter, createPublicCache, noopInvalidation } from "../src/http";

const url = process.env.SHENRON_THEME_PG_URL;
test.skipIf(!url)(
  "isolated PostgreSQL: Bun banners upsert, audit identity and fresh HTTP reads",
  async () => {
    const target = new URL(url!);
    if (
      !["127.0.0.1", "localhost"].includes(target.hostname) ||
      target.pathname !== "/shenron_theme_fixture"
    )
      throw new Error("Isolated home fixture URL required");
    const sql = createBunSql({ url: url!, max: 1, applicationName: "shenron-theme-fixture" });
    const publicApi = "https://fixture.example/api";
    const host = createHostPageBanners({ DATABASE_URL: url!, SHENRON_PUBLIC_API_URL: publicApi })!;
    const api = createShenronApi(
      {
        pageBanners: host.port,
        auth: {
          owner: async () => "discord:fixture-staff",
          admin: async (r) => r.headers.get("authorization") === "Bearer fixture-admin",
        },
        rateLimit: createMemoryRateLimiter(),
        publicCache: createPublicCache(),
        invalidation: noopInvalidation,
        cors: { allowedOrigins: [] },
        clientIp: () => "fixture",
        isDirectLoopback: () => true,
      },
      { service: "shenron-server" },
    );
    const server = Bun.serve({
      hostname: "127.0.0.1",
      port: 0,
      routes: api.routes,
      fetch: api.fetch,
    });
    const client = createShenronApiClient({
      baseUrl: server.url,
      adminToken: () => "fixture-admin",
    });
    try {
      await sql.unsafe(
        `create table "PageBanners" (id text primary key,data jsonb not null,"updatedBy" text,"updatedAt" timestamp(3) not null default current_timestamp)`,
      );
      expect(await client.call(endpoints.pageBanners, {})).toMatchObject({
        ok: true,
        value: { banners: createDefaultPageBanners(publicApi) },
      });
      const first = await client.call(endpoints.pageBannersSave, {
        body: { pages: { episodes: "First fixture" }, updatedBy: "forged" },
      });
      expect(first).toMatchObject({
        ok: true,
        value: { banners: { pages: { episodes: "First fixture" } } },
      });
      expect(
        await client.call(endpoints.pageBannersSave, {
          body: { pages: { episodes: "Latest fixture" } },
        }),
      ).toMatchObject({ ok: true });
      const rows = await sql.unsafe(
        'select id,data,jsonb_typeof(data) as "dataType","updatedBy","updatedAt" from "PageBanners"',
      );
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        id: "default",
        dataType: "object",
        updatedBy: "discord:fixture-staff",
      });
      const stored = typeof rows[0]!.data === "string" ? JSON.parse(rows[0]!.data) : rows[0]!.data;
      expect(stored).toMatchObject({ pages: { episodes: "Latest fixture" } });
      expect(rows[0]?.updatedAt).toBeInstanceOf(Date);
      expect(await client.call(endpoints.pageBanners, {})).toMatchObject({
        ok: true,
        value: { banners: stored },
      });
    } finally {
      await server.stop(true);
      await host.close();
      await sql.close();
    }
  },
);
