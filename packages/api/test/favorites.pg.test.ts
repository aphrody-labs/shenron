import { expect, test } from "bun:test";
import { createBunSql } from "@aphrody/shenron-db/bun-sql";
import { createHostFavorites } from "../src/host/favorites";
import { createShenronApi } from "../src/server";
import { createMemoryRateLimiter, createPublicCache, noopInvalidation } from "../src/http";
import { endpoints } from "../src/contract";

const url = process.env.SHENRON_THEME_PG_URL;
test.skipIf(!url)(
  "isolated PostgreSQL favorites preserve other preferences and account boundaries",
  async () => {
    const target = new URL(url!);
    if (
      !["127.0.0.1", "localhost"].includes(target.hostname) ||
      target.pathname !== "/shenron_theme_fixture"
    )
      throw new Error("Isolated fixture required");
    const sql = createBunSql({ url: url!, max: 1, applicationName: "shenron-favorites-fixture" });
    const host = createHostFavorites({ DATABASE_URL: url! })!;
    const api = createShenronApi(
      {
        favorites: host.port,
        betterAuth: {
          handler: async () => new Response(),
          session: async () => ({
            userId: "auth-a",
            profile: {
              id: "profile-a",
              discordId: "discord-a",
              username: "Reader",
              avatar: null,
              roleAdmin: false,
              createdAt: "2026-10-07T00:00:00.000Z",
            },
          }),
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
    const favorite = {
      kind: "chapter" as const,
      id: "7",
      title: "Chapter",
      href: "/wiki/manga/7",
      at: 1,
    };
    try {
      await sql.unsafe(
        `create table user_preferences (id text primary key, identity text unique not null, "userId" text, "anonId" text, prefs jsonb not null default '{}', "eventCount" integer not null default 0, "updatedAt" timestamp(3) not null default current_timestamp)`,
      );
      await sql.unsafe(
        `insert into user_preferences (id,identity,"userId",prefs) values ('a','u:profile-a','profile-a','{"eras":["DB"],"favorites":[]}'),('b','u:profile-b','profile-b','{"favorites":[]}')`,
      );
      const response = await fetch(new URL(endpoints.favorites.path, server.url), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ userId: "profile-b", favorites: [favorite] }),
      });
      expect(await response.json()).toEqual({ ok: true, count: 1 });
      await Promise.all([
        host.port.save("profile-a", [{ ...favorite, id: "8", at: 2 }]),
        sql.unsafe(
          `update user_preferences set prefs = prefs || '{"language":"ja"}'::jsonb where identity = 'u:profile-a'`,
        ),
      ]);
      const rows = await sql.unsafe(
        `select identity, "userId", prefs, jsonb_typeof(prefs) as type from user_preferences order by identity`,
      );
      expect(rows).toHaveLength(2);
      expect(rows[0]).toMatchObject({
        identity: "u:profile-a",
        userId: "profile-a",
        type: "object",
      });
      const stored = typeof rows[0].prefs === "string" ? JSON.parse(rows[0].prefs) : rows[0].prefs;
      expect(stored).toMatchObject({ eras: ["DB"], language: "ja", favorites: [{ id: "8" }] });
      expect(await host.port.read("profile-b")).toEqual([]);
      expect(
        await (await fetch(new URL(endpoints.favorites.path, server.url))).json(),
      ).toMatchObject({ favorites: [{ id: "8" }] });
      await host.port.save("profile-a", []);
      expect(await host.port.read("profile-a")).toEqual([]);
      const retained = await sql.unsafe(
        `select prefs->>'language' as language from user_preferences where identity='u:profile-a'`,
      );
      expect(retained[0]?.language).toBe("ja");
      await host.port.save("profile-c", [favorite]);
      expect(await host.port.read("profile-c")).toMatchObject([{ id: "7" }]);
    } finally {
      await server.stop(true);
      await host.close();
      await sql.close();
    }
  },
);
