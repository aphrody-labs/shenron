// SPDX-License-Identifier: Apache-2.0
import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  AGENT_HOME_DOCUMENTS,
  agentHomeDirName,
  agentHomeId,
  agentHomesPgDdl,
  convertToDiscordHome,
  DirAgentHomeStore,
  discordIdOf,
  ensureAgentHome,
  instantiateAgentHome,
  newerHome,
  readAgentTemplate,
  readUserProfile,
  SHENRON_AGENT_TEMPLATE,
  templateProblems,
  updateAgentHome,
} from "../src/agent-homes";

const ROOT = join(import.meta.dir, "../../..");
const ID = "123456789012345678";
const dirs: string[] = [];
const tmp = () => {
  const dir = mkdtempSync(join(tmpdir(), "shenron-agent-homes-"));
  dirs.push(dir);
  return dir;
};
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("template", () => {
  test("the repository template is public and complete", async () => {
    const entries = readdirSync(join(ROOT, "templates/agent-home"), { recursive: true }).map(
      String,
    );
    expect(templateProblems(SHENRON_AGENT_TEMPLATE.files, entries)).toEqual([]);
    const fromDir = await readAgentTemplate(join(ROOT, "templates/agent-home"));
    expect(fromDir?.revision).toBe(SHENRON_AGENT_TEMPLATE.revision);
    for (const name of AGENT_HOME_DOCUMENTS)
      expect(SHENRON_AGENT_TEMPLATE.files[name].trim().length).toBeGreaterThan(0);
  });

  test("the template carries the editorial rules", () => {
    const text =
      SHENRON_AGENT_TEMPLATE.files["AGENTS.md"] + SHENRON_AGENT_TEMPLATE.files["SOUL.md"];
    expect(text).toContain("Akira Toriyama");
    expect(text).toMatch(/Fandom[^\n]*est interdit comme source/);
    expect(text).toMatch(/fr`, `en` ou\s+`ja`/);
  });

  test("a filled-in USER.md or a private entry is refused", () => {
    const home = instantiateAgentHome(SHENRON_AGENT_TEMPLATE, {
      agentId: `discord:${ID}`,
      name: "Goku",
    });
    expect(templateProblems(home.files)).toContain("USER.md agent_id is filled in");
    expect(templateProblems(SHENRON_AGENT_TEMPLATE.files, ["MEMORY.md", "memory/x.md"])).toEqual([
      "private entry MEMORY.md",
      "private entry memory/x.md",
    ]);
  });
});

describe("ids and profile", () => {
  test("discord:<id> or local, sanitised like aphrody-agent-home", () => {
    expect(agentHomeId(ID)).toBe(`discord:${ID}`);
    expect(agentHomeId("abc")).toBe("local");
    expect(agentHomeId(null)).toBe("local");
    expect(agentHomeDirName(`discord:${ID}`)).toBe(`discord-${ID}`);
    expect(discordIdOf(`discord:${ID}`)).toBe(ID);
    expect(discordIdOf("local")).toBeNull();
  });

  test("instantiation personalises USER.md in the native frontmatter", () => {
    const home = instantiateAgentHome(
      SHENRON_AGENT_TEMPLATE,
      {
        agentId: `discord:${ID}`,
        name: 'Vegeta "Prince"\n',
        language: "ja-JP",
        timezone: "Asia/Tokyo",
        preferences: ["réponses courtes", "réponses courtes", " "],
        avatarUrl: "https://cdn.discordapp.com/avatars/x.png",
      },
      new Date("2026-10-06T10:00:00Z"),
    );
    const user = home.files["USER.md"];
    expect(user).toContain(`agent_id: "discord:${ID}"`);
    expect(user).toContain(`address_as: "Vegeta 'Prince'"`);
    expect(user).toContain('language: "ja"');
    expect(user).toContain('  - "réponses courtes"');
    expect(user).toContain('updated_at: "2026-10-06T10:00:00.000Z"');
    expect(user).toContain("# Utilisateur");
    expect(readUserProfile(user)).toEqual(home.profile);
    expect(home.profile).toMatchObject({ language: "ja", timezone: "Asia/Tokyo" });
    expect(home.files["SOUL.md"]).toBe(SHENRON_AGENT_TEMPLATE.files["SOUL.md"]);
  });

  test("invalid fields are dropped", () => {
    const home = instantiateAgentHome(SHENRON_AGENT_TEMPLATE, {
      agentId: "local",
      timezone: "Mars/Olympus",
      avatarUrl: "javascript:alert(1)",
      language: "de",
    });
    expect(home.profile).toMatchObject({ timezone: null, avatarUrl: null, language: "fr" });
    expect(() => instantiateAgentHome(SHENRON_AGENT_TEMPLATE, { agentId: "discord:x" })).toThrow();
  });

  test("last-writer-wins on updatedAt", () => {
    const a = instantiateAgentHome(SHENRON_AGENT_TEMPLATE, { agentId: "local" }, new Date(1000));
    const b = updateAgentHome(a, { name: "Bulma" }, new Date(2000));
    expect(newerHome(b, a)).toBe(true);
    expect(newerHome(a, b)).toBe(false);
  });
});

describe("DirAgentHomeStore", () => {
  test("writes the native layout and reads it back", async () => {
    const store = new DirAgentHomeStore(tmp());
    const { home, created } = await ensureAgentHome(store, SHENRON_AGENT_TEMPLATE, {
      agentId: "local",
    });
    expect(created).toBe(true);
    const dir = store.dirOf("local");
    for (const name of AGENT_HOME_DOCUMENTS) expect(existsSync(join(dir, name))).toBe(true);
    expect(existsSync(join(dir, "memory"))).toBe(true);
    expect(existsSync(join(dir, "skills"))).toBe(true);
    const state = JSON.parse(readFileSync(join(dir, ".aphrody/workspace-state.json"), "utf8"));
    expect(state).toMatchObject({ version: 1, setup_completed_at: home.createdAt });
    const read = await store.get("local");
    expect(read).toEqual(home);
    expect(
      (await ensureAgentHome(store, SHENRON_AGENT_TEMPLATE, { agentId: "local" })).created,
    ).toBe(false);
    expect(await store.put(updateAgentHome(home, {}, new Date(0)))).toBe("stale");
  });

  test("sign-in converts the local home and keeps the user's edits", async () => {
    const store = new DirAgentHomeStore(tmp());
    const { home } = await ensureAgentHome(
      store,
      SHENRON_AGENT_TEMPLATE,
      { agentId: "local" },
      new Date(1000),
    );
    await store.put(updateAgentHome(home, { preferences: ["spoilers interdits"] }, new Date(2000)));
    expect(store.moveSync("local", `discord:${ID}`)).toBe(true);
    const moved = store.readSync(`discord:${ID}`)!;
    const converted = await convertToDiscordHome(
      store,
      SHENRON_AGENT_TEMPLATE,
      {
        discordId: ID,
        name: "Kakarot",
        language: "en",
        avatarUrl: "https://cdn.discordapp.com/a.png",
      },
      new Date(3000),
    );
    expect(moved.profile.agentId).toBe(`discord:${ID}`);
    expect(converted.profile).toMatchObject({
      agentId: `discord:${ID}`,
      name: "Kakarot",
      language: "en",
      preferences: ["spoilers interdits"],
    });
    expect(store.readSync("local")).toBeNull();
  });
});

describe("PgAgentHomeStore", () => {
  test("the DDL is the migration 0020", () => {
    const migration = readFileSync(
      join(ROOT, "apps/site/src/db/migrations/0020_chat_agent_homes.sql"),
      "utf8",
    );
    expect(migration).toContain(agentHomesPgDdl("chat").trim());
  });
});
