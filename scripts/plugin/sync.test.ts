// SPDX-License-Identifier: Apache-2.0
import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { syncPortable } from "./sync";

test("portable sync detects drift without writing, preserves metadata, and converges", async () => {
  const root = await mkdtemp(join(tmpdir(), "shenron-sync-"));
  try {
    const write = (path: string, value: unknown) =>
      Bun.write(join(root, path), JSON.stringify(value));
    await write("plugin/.claude-plugin/plugin.json", { version: "1.4.4" });
    await write("plugin/openai/plugin.json", { version: "old", review: { retained: true } });
    await write("plugin/openai/mcp.json", {
      mcpServers: { shenron: { type: "streamable-http", url: "old" } },
    });
    await write("plugin/source-of-truth.json", {
      version: 1,
      sources: [{ root: ".", evidence: ["proof.json"] }],
      knowledge: [],
    });
    await Bun.write(join(root, "plugin/reference.md"), "# Reference\n");
    expect(await syncPortable(root, true)).toHaveLength(3);
    expect((await Bun.file(join(root, "plugin/openai/plugin.json")).json()).version).toBe("old");
    expect(await syncPortable(root, false)).toHaveLength(3);
    expect(await syncPortable(root, false)).toEqual([]);
    expect(await syncPortable(root, true)).toEqual([]);
    const manifest = await Bun.file(join(root, "plugin/openai/plugin.json")).json();
    expect(manifest).toEqual({ version: "1.4.4", review: { retained: true } });
    expect(
      (await Bun.file(join(root, "plugin/openai/mcp.json")).json()).mcpServers.shenron,
    ).toEqual({ type: "streamable-http", url: "https://dragonballfr.com/mcp" });
    const registry = await Bun.file(join(root, "plugin/source-of-truth.json")).json();
    expect(registry.knowledge).toEqual(["reference.md"]);
    expect(registry.sources).toEqual([{ root: ".", evidence: ["proof.json"] }]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
