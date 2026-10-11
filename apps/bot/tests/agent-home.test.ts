// SPDX-License-Identifier: Apache-2.0
import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import "./setup";
import "reflect-metadata";
import { DirAgentHomeStore, PgAgentHomeStore } from "@aphrody/shenron-db/agent-homes";
import { PgService } from "~/db/pg";
import { AgentHomeService, botAgentHomeStore } from "~/lib/agent-home";

const ID = "123456789012345678";
const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("cloud agent homes of DM users", () => {
  test("the first DM creates discord:<id> from the template, once", async () => {
    const dir = mkdtempSync(join(tmpdir(), "shenron-bot-agent-home-"));
    dirs.push(dir);
    const store = new DirAgentHomeStore(dir);
    let reads = 0;
    const counting = { get: (id: string) => (reads++, store.get(id)), put: store.put.bind(store) };
    const service = AgentHomeService.withStore(counting);
    const home = await service.forDiscordUser({
      id: ID,
      username: "kakarot",
      globalName: "Son Goku",
      avatarUrl: "https://cdn.discordapp.com/avatars/1/a.png",
    });
    expect(home?.agentId).toBe(`discord:${ID}`);
    expect(home?.profile).toMatchObject({ name: "Son Goku", language: "fr" });
    expect(home?.files["USER.md"]).toContain(`agent_id: "discord:${ID}"`);
    expect(home?.files["SOUL.md"]).toContain("Shenron");
    const before = reads;
    expect((await service.forDiscordUser({ id: ID, username: "x" }))?.profile.name).toBe(
      "Son Goku",
    );
    expect(reads).toBe(before);
    expect(await service.forDiscordUser({ id: "not-a-snowflake", username: "x" })).toBeNull();
  });

  test("a store failure leaves the DM relay without a home", async () => {
    const service = AgentHomeService.withStore({
      get: async () => {
        throw new Error('relation "chat.agent_homes" does not exist');
      },
      put: async () => "accepted",
    });
    expect(await service.forDiscordUser({ id: ID, username: "x" })).toBeNull();
  });

  test("PostgreSQL when configured, else directories beside the database", () => {
    const dir = mkdtempSync(join(tmpdir(), "shenron-bot-no-postgres-"));
    dirs.push(dir);
    const offline = PgService.withEnv({ SHENRON_PG_ENV: join(dir, "absent.env") });
    expect(botAgentHomeStore(offline, "/srv/bot/data/bot.db")).toBeInstanceOf(DirAgentHomeStore);
    const pg = PgService.withEnv({ DATABASE_URL: "postgres://u:p@127.0.0.1:1/x" }, () => ({
      sql: {} as never,
      db: {} as never,
    }));
    expect(botAgentHomeStore(pg)).toBeInstanceOf(PgAgentHomeStore);
  });
});
