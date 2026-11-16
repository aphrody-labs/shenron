// SPDX-License-Identifier: Apache-2.0
import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  DirAgentHomeStore,
  instantiateAgentHome,
  SHENRON_AGENT_TEMPLATE,
} from "@shenron/db/agent-homes";
import { agentHomeFromDir, homeUserNote } from "../src/chat/home";
import { systemPrompt } from "../src/chat/engine";

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("per-user agent home of the chat", () => {
  test("a user's home adds their name and language to the persona", () => {
    const root = mkdtempSync(join(tmpdir(), "shenron-api-home-"));
    dirs.push(root);
    const store = new DirAgentHomeStore(root);
    const agentId = "discord:123456789012345678";
    store.writeSync(
      instantiateAgentHome(SHENRON_AGENT_TEMPLATE, {
        agentId,
        name: "Bulma",
        language: "ja",
        preferences: ["pas de spoilers"],
      }),
    );
    const home = agentHomeFromDir(store.dirOf(agentId));
    expect(home.persona?.tone).toContain("solennel");
    expect(home.user).toMatchObject({ name: "Bulma", language: "ja" });
    const prompt = systemPrompt("shenron", "desktop", home, false);
    expect(prompt).toContain('Address the user as "Bulma".');
    expect(prompt).toContain("Answer in Japanese");
    expect(prompt).toContain('"pas de spoilers"');
  });

  test("the public template has no user", () => {
    const home = agentHomeFromDir(join(import.meta.dir, "../../../templates/agent-home"));
    expect(home.user).toBeNull();
    expect(homeUserNote(null)).toBe("");
  });
});
