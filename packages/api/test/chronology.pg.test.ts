// SPDX-License-Identifier: Apache-2.0
import { expect, test } from "bun:test";
import { createBunSql } from "@shenron/db/bun-sql";
import { DEFAULT_CHRONOLOGY_CONFIG } from "@shenron/config/chronology";
import { createHostChronology } from "../src/host/chronology";
import { createShenronApiClient } from "../src/client";
import { endpoints } from "../src/contract";
import { createShenronApi } from "../src/server";
import { createMemoryRateLimiter, createPublicCache, noopInvalidation } from "../src/http";

const url = process.env.SHENRON_THEME_PG_URL;
test.skipIf(!url)(
  "isolated PostgreSQL: Bun chronology upsert, audit identity and fresh HTTP reads",
  async () => {
    const target = new URL(url!);
    if (
      !["127.0.0.1", "localhost"].includes(target.hostname) ||
      target.pathname !== "/shenron_theme_fixture"
    )
      throw new Error("Isolated home fixture URL required");
    const sql = createBunSql({ url: url!, max: 1, applicationName: "shenron-theme-fixture" });
    const host = createHostChronology({ DATABASE_URL: url! })!;
    const api = createShenronApi(
      {
        chronology: host.port,
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
        `create table "ChronologyConfig" (id text primary key,data jsonb not null,"updatedBy" text,"updatedAt" timestamp(3) not null default current_timestamp)`,
      );
      await sql.unsafe("create schema bot");
      await sql.unsafe(
        "create table bot.db_episodes (id integer primary key,series text,number_in_series integer,title text,title_ja text,air_date integer,image text,players jsonb,visible boolean)",
      );
      await sql.unsafe(
        "create table bot.db_movies (id integer primary key,slug text,series text,title text,title_ja text,release_date integer,poster text,players jsonb,visible boolean)",
      );
      await sql.unsafe(
        "create table bot.db_manga_volumes (id integer primary key,series text,volume_number integer,title text,title_ja text,published_at integer,cover text,visible boolean)",
      );
      await sql.unsafe(
        `insert into bot.db_episodes values (1,'DB',1,'Episode fixture',null,1,null,'[{"lang":"vf","embedUrl":"https://fixture.example/private-player"}]',true),(2,'DBZ',2,'Hidden fixture',null,2,null,'[]',false)`,
      );
      await sql.unsafe(
        `insert into bot.db_movies values (1,'movie-fixture','DBS_MOVIE','Movie fixture',null,3,null,'[null,{"lang":"vostfr"}]',true)`,
      );
      await sql.unsafe(
        `insert into bot.db_manga_volumes values (1,'DB',1,'Son Goku fixture',null,4,null,true),(2,'DB_SD',1,'Spin-off fixture',null,5,null,true),(3,'DBS',1,'Super fixture',null,6,null,true),(4,'DB',2,'Hidden volume',null,7,null,false)`,
      );
      const timeline = await client.call(endpoints.timelineItems, {});
      expect(timeline.ok).toBe(true);
      if (!timeline.ok) throw new Error("Timeline fixture failed");
      expect(timeline.value.items).toHaveLength(4);
      expect(timeline.value.items).toContainEqual(
        expect.objectContaining({ kind: "episode", id: 1, hasVf: true, hasVostfr: false }),
      );
      expect(timeline.value.items).toContainEqual(
        expect.objectContaining({
          kind: "movie",
          id: 1,
          href: "/wiki/movies/movie-fixture",
          hasVostfr: true,
        }),
      );
      expect(
        timeline.value.items
          .filter((i) => i.kind === "manga")
          .map((i) => i.id)
          .toSorted(),
      ).toEqual([1, 3]);
      expect(JSON.stringify(timeline.value)).not.toContain("private-player");
      expect(await client.call(endpoints.chronology, {})).toMatchObject({
        ok: true,
        value: { config: JSON.parse(JSON.stringify(DEFAULT_CHRONOLOGY_CONFIG)) },
      });
      const first = await client.call(endpoints.chronologySave, {
        body: { overrides: { "episode:1": { title: "First fixture" } }, updatedBy: "forged" },
      });
      expect(first).toMatchObject({
        ok: true,
        value: { config: { overrides: { "episode:1": { title: "First fixture" } } } },
      });
      expect(
        await client.call(endpoints.chronologySave, {
          body: { overrides: { "episode:1": { title: "Latest fixture" } } },
        }),
      ).toMatchObject({ ok: true });
      const rows = await sql.unsafe(
        'select id,data,jsonb_typeof(data) as "dataType","updatedBy","updatedAt" from "ChronologyConfig"',
      );
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        id: "default",
        dataType: "object",
        updatedBy: "discord:fixture-staff",
      });
      const stored = typeof rows[0]!.data === "string" ? JSON.parse(rows[0]!.data) : rows[0]!.data;
      expect(stored).toMatchObject({ overrides: { "episode:1": { title: "Latest fixture" } } });
      expect(rows[0]?.updatedAt).toBeInstanceOf(Date);
      expect(await client.call(endpoints.chronology, {})).toMatchObject({
        ok: true,
        value: { config: stored },
      });
    } finally {
      await server.stop(true);
      await host.close();
      await sql.close();
    }
  },
);
