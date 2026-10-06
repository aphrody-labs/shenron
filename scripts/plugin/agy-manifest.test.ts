import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { agyDrift, agyManifests } from "./agy-manifest";
import { RACINE } from "./build-references";

describe("agy manifests of the plugin", () => {
  test("plugin.json and mcp_config.json follow .claude-plugin/plugin.json", async () => {
    expect(await agyDrift()).toEqual([]);
  });

  test("same version as the Claude manifest, public HTTP MCP, Claude stdio MCP kept", async () => {
    const out = await agyManifests();
    const claude = await Bun.file(join(RACINE, "plugin/.claude-plugin/plugin.json")).json();
    const agy = JSON.parse(out["plugin/plugin.json"]!);
    expect(agy.version).toBe(claude.version);
    expect(agy.name).toBe(claude.name);
    expect(JSON.parse(out["plugin/mcp_config.json"]!).mcpServers.shenron.serverUrl).toMatch(
      /^https:\/\/[^/]+\/mcp$/,
    );
    const mcp = await Bun.file(join(RACINE, "plugin/.mcp.json")).json();
    expect(mcp.mcpServers.shenron.command).toBe("shenron-mcp");
  });
});
