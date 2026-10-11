// SPDX-License-Identifier: Apache-2.0
import { expect, test } from "bun:test";
import { createBunSql } from "@aphrody/shenron-db/bun-sql";
import { DEFAULT_LAUNCH_CONFIG } from "@aphrody/shenron-config/wiki-launch-config";
import { createHostWikiLaunch } from "../src/host/wiki-launch";
import { createShenronApiClient } from "../src/client";
import { endpoints } from "../src/contract";
import { createShenronApi } from "../src/server";
import { createMemoryRateLimiter, createPublicCache, noopInvalidation } from "../src/http";

const url = process.env.SHENRON_THEME_PG_URL;
test.skipIf(!url)(
  "isolated PostgreSQL: native launch policy and concurrent partial saves",
  async () => {
    const target = new URL(url!);
    if (
      !["127.0.0.1", "localhost"].includes(target.hostname) ||
      target.pathname !== "/shenron_theme_fixture"
    )
      throw new Error("Isolated fixture required");
    const sql = createBunSql({ url: url!, max: 1, applicationName: "shenron-launch-fixture" });
    const host = createHostWikiLaunch({ DATABASE_URL: url! })!;
    const api = createShenronApi(
      {
        wikiLaunch: host.port,
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
        `create table "WikiLaunch" (id text primary key,data jsonb not null,"updatedBy" text,"updatedAt" timestamp(3) not null default current_timestamp)`,
      );
      expect(await client.call(endpoints.wikiLaunch, {})).toMatchObject({
        ok: true,
        value: { config: DEFAULT_LAUNCH_CONFIG },
      });
      const forgedPatch = { openKeys: ["personnages", "unknown"], updatedBy: "forged" };
      const results = await Promise.all([
        client.call(endpoints.wikiLaunchSave, { body: forgedPatch }),
        client.call(endpoints.wikiLaunchSave, {
          body: {
            order: ["jeux", "personnages"],
            access: {
              personnages: { mode: "roles", roleIds: ["123456789012345678", "invalid"] },
              episodes: { mode: "admin", roleIds: [] },
            },
          },
        }),
      ]);
      for (const result of results) expect(result.ok).toBe(true);
      const read = await client.call(endpoints.wikiLaunch, {});
      expect(read).toMatchObject({
        ok: true,
        value: {
          config: {
            openKeys: [...DEFAULT_LAUNCH_CONFIG.openKeys, "characters"],
            order: ["games", "characters"],
            access: { characters: { mode: "roles", roleIds: ["123456789012345678"] } },
          },
        },
      });
      if (!read.ok) throw new Error("Expected saved launch policy");
      expect(read.value.config.openKeys.includes("unknown")).toBe(false);
      expect(read.value.config.access.episodes).toBeUndefined();
      const rows = await sql.unsafe(
        'select id,jsonb_typeof(data) as "dataType","updatedBy","updatedAt" from "WikiLaunch"',
      );
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        id: "default",
        dataType: "object",
        updatedBy: "discord:fixture-staff",
      });
      expect(rows[0]?.updatedAt).toBeInstanceOf(Date);
      expect(
        (await fetch(new URL(endpoints.wikiLaunch.path, server.url))).headers.get("cache-control"),
      ).toBe("no-store");
      expect(
        (
          await fetch(new URL(endpoints.wikiLaunch.path, server.url), {
            method: "POST",
            headers: { authorization: "Bearer fixture-admin", "content-type": "application/json" },
            body: "{}",
          })
        ).status,
      ).toBe(400);
    } finally {
      await server.stop(true);
      await host.close();
      await sql.close();
    }
  },
);
