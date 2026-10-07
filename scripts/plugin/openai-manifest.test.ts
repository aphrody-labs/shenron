import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";

const root = new URL("../../", import.meta.url);
const readJson = async <T>(path: string): Promise<T> =>
  JSON.parse(await readFile(new URL(path, root), "utf8")) as T;

describe("portable OpenAI plugin package", () => {
  test("declares the portable package, remote MCP, and local repo marketplace", async () => {
    const plugin = await readJson<{
      $schema: string;
      name: string;
      version: string;
      extensions: { "com.openai": { onboardingSkill: string; review: unknown } };
    }>("plugin/openai/plugin.json");
    const mcp = await readJson<{
      mcpServers: Record<string, { type: string; url: string }>;
    }>("plugin/openai/mcp.json");
    const marketplace = await readJson<{
      plugins: {
        name: string;
        source: { source: string; path: string };
        policy: { installation: string; authentication: string };
      }[];
    }>(".agents/plugins/marketplace.json");

    expect(plugin.$schema).toContain("agent-plugins.org/schemas/1.0.0/plugin.schema.json");
    expect(plugin.name).toBe("shenron");
    expect(plugin.version).toBe("1.4.0");
    expect(plugin.extensions["com.openai"].onboardingSkill).toBe("./skills/dragon-ball/SKILL.md");
    expect(plugin.extensions["com.openai"].review).toBeDefined();
    expect(mcp.mcpServers.shenron).toEqual({
      type: "streamable-http",
      url: "https://dragonballfr.com/mcp",
    });
    expect(marketplace.plugins[0]).toMatchObject({
      name: "shenron",
      source: { source: "local", path: "./plugin/openai" },
      policy: { installation: "AVAILABLE", authentication: "ON_INSTALL" },
    });
  });

  test("review cases and skills reference real public MCP tools", async () => {
    const plugin = await readJson<{
      extensions: {
        "com.openai": {
          review: {
            test_cases: {
              positive: { tools_triggered: string }[];
              negative: { tools_triggered?: string }[];
            };
          };
        };
      };
    }>("plugin/openai/plugin.json");
    const source = await readFile(new URL("crates/shenron-mcp/src/lib.rs", root), "utf8");
    const registered = new Set(
      [...source.matchAll(/name = "(dragonball\.[^"]+)"/g)].map((match) => match[1]),
    );
    const review = plugin.extensions["com.openai"].review.test_cases;
    expect(review.positive).toHaveLength(5);
    expect(review.negative).toHaveLength(3);
    for (const name of review.positive.flatMap((testCase) =>
      (testCase.tools_triggered ?? "").split(/[,\s]+/).filter(Boolean),
    )) {
      expect(registered.has(name)).toBe(true);
    }

    const skills = ["dragon-ball", "dragon-ball-canon", "dragon-ball-japonais"];
    for (const skill of skills) {
      const text = await readFile(new URL(`plugin/openai/skills/${skill}/SKILL.md`, root), "utf8");
      expect(text.startsWith(`---\nname: ${skill}\ndescription: `)).toBe(true);
      expect(text.length).toBeGreaterThan(100);
    }
    const researchSkill = await readFile(
      new URL("plugin/openai/skills/dragon-ball/SKILL.md", root),
      "utf8",
    );
    expect(researchSkill).toContain("Do not use Fandom as an authority.");
  });
});
