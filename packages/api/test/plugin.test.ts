// SPDX-License-Identifier: Apache-2.0
import { describe, expect, test } from "bun:test";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  createPluginPort,
  findPluginFile,
  frontmatter,
  isPrivatePluginFile,
  pluginPublicOrigin,
  pluginIndex,
  readPluginBundle,
  renderPluginExport,
  renderPluginFile,
  resolvePluginRoot,
} from "../src/plugin";
import { createShenronApi } from "../src/server";
import { basePorts } from "./support/ports";

const REPO_PLUGIN = resolve(import.meta.dir, "..", "..", "..", "plugin");

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "shenron-plugin-"));
  await mkdir(join(root, ".claude-plugin"), { recursive: true });
  await mkdir(join(root, "skills", "canon"), { recursive: true });
  await mkdir(join(root, "agents"), { recursive: true });
  await writeFile(
    join(root, ".claude-plugin", "plugin.json"),
    JSON.stringify({ name: "shenron", version: "9.9.9", description: "Dragon Ball plugin" }),
  );
  await writeFile(
    join(root, "skills", "canon", "SKILL.md"),
    '---\nname: canon\ndescription: "Checks <canon> \\"verdicts\\""\n---\n\n# Canon\n\n```ts\nconst a = 1;\n```\n',
  );
  await writeFile(
    join(root, "agents", "wiki.md"),
    "---\nname: wiki\ndescription: Writes entries\n---\nBody",
  );
  await writeFile(join(root, "big.json"), JSON.stringify({ data: "x".repeat(40_000) }));
  await writeFile(join(root, ".gitignore"), "node_modules\n");
  return root;
}

describe("plugin bundle", () => {
  test("reads the manifest, skills, agents and every file but ignored ones", async () => {
    const root = await fixture();
    try {
      const bundle = await readPluginBundle(root);
      expect(bundle.version).toBe("9.9.9");
      expect(bundle.files.map((f) => f.path)).toEqual([
        ".claude-plugin/plugin.json",
        "agents/wiki.md",
        "big.json",
        "skills/canon/SKILL.md",
      ]);
      expect(bundle.entries).toEqual([
        { kind: "agent", name: "wiki", description: "Writes entries", path: "agents/wiki.md" },
        {
          kind: "skill",
          name: "canon",
          description: 'Checks <canon> "verdicts"',
          path: "skills/canon/SKILL.md",
        },
      ]);
      expect(bundle.sha256).toMatch(/^[0-9a-f]{64}$/);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("the fingerprint follows any change, the port re-reads after its TTL", async () => {
    const root = await fixture();
    try {
      const port = createPluginPort(root, { ttlMs: 0 });
      const before = await port.load();
      await writeFile(join(root, "agents", "wiki.md"), "---\nname: wiki\ndescription: New\n---\n");
      await Bun.sleep(1);
      const after = await port.load();
      expect(after.sha256).not.toBe(before.sha256);
      expect(after.entries.find((e) => e.name === "wiki")?.description).toBe("New");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("exports: Markdown fences survive backticks, large files stay as links unless full", async () => {
    const root = await fixture();
    try {
      const bundle = await readPluginBundle(root);
      const md = renderPluginExport(bundle, "md", { origin: "https://dragonballfr.com" }).body;
      expect(md).toContain("# Shenron plugin for Dragon Ball, version 9.9.9");
      expect(md).toContain("any Dragon Ball question");
      expect(md).toContain("````markdown\n---\nname: canon");
      expect(md).toContain("Not inlined");
      expect(md).not.toContain("x".repeat(40_000));
      const full = renderPluginExport(bundle, "md", { origin: "https://x.test", full: true });
      expect(full.body).toContain("x".repeat(40_000));

      const html = renderPluginExport(bundle, "html", { origin: "https://dragonballfr.com" });
      expect(html.contentType).toStartWith("text/html");
      expect(html.body).toContain('<html lang="en">');
      expect(html.body).toContain("Checks &lt;canon&gt;");
      expect(html.body).not.toContain("<canon>");

      const json = JSON.parse(
        renderPluginExport(bundle, "json", { origin: "https://a.test" }).body,
      );
      expect(json.formats.md).toBe("https://a.test/api/public/plugin/export/md");
      expect(json.contents.map((c: { path: string }) => c.path)).not.toContain("big.json");

      expect(
        renderPluginExport(bundle, "txt", { origin: "https://a.test" }).contentType,
      ).toStartWith("text/plain");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("single files: raw by extension, wrapped for md, html and json; unknown paths are not read", async () => {
    const root = await fixture();
    try {
      const bundle = await readPluginBundle(root);
      const file = findPluginFile(bundle, "/big.json")!;
      expect(renderPluginFile(file, "raw", "https://a.test").contentType).toStartWith(
        "application/json",
      );
      expect(renderPluginFile(file, "md", "https://a.test").body).toStartWith("# big.json");
      expect(findPluginFile(bundle, "../package.json")).toBeNull();
      expect(findPluginFile(bundle, ".gitignore")).toBeNull();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("frontmatter keeps unquoted and quoted values", () => {
    expect(frontmatter("---\nname: a\ndescription: 'b c'\n---\n")).toEqual({
      name: "a",
      description: "b c",
    });
    expect(frontmatter("# no header")).toEqual({});
  });

  test("the repository plugin is found from any app directory and indexes its skills", async () => {
    const appDir = resolve(import.meta.dir, "..", "..", "..", "apps", "site");
    expect(resolvePluginRoot({}, appDir)).toBe(REPO_PLUGIN);
    expect(resolvePluginRoot({ SHENRON_PLUGIN_DIR: "/nonexistent" }, appDir)).toBeNull();
    const bundle = await readPluginBundle(REPO_PLUGIN);
    const index = pluginIndex(bundle, "https://dragonballfr.com");
    expect(index.skills.map((s) => s.name)).toContain("dragon-ball");
    expect(index.agents.length).toBeGreaterThan(0);
  });
});

const archiver = (entries: Record<string, string>) =>
  new Bun.Archive(entries, { compress: "gzip", level: 9 }).bytes();

describe("plugin endpoints", () => {
  const api = createShenronApi(basePorts({ plugin: createPluginPort(REPO_PLUGIN, { archiver }) }), {
    service: "shenron-site",
  });

  test("index, exports in four formats and files, with a revalidating ETag", async () => {
    const index = await api.request("https://dragonballfr.com/api/public/plugin");
    expect(index.status).toBe(200);
    const body = (await index.json()) as { files: { path: string; url: string }[] };
    expect(body.files.some((f) => f.path === ".claude-plugin/plugin.json")).toBe(true);

    for (const [format, type] of [
      ["md", "text/markdown"],
      ["txt", "text/plain"],
      ["html", "text/html"],
      ["json", "application/json"],
    ] as const) {
      const res = await api.request(`https://dragonballfr.com/api/public/plugin/export/${format}`);
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toStartWith(type);
      const etag = res.headers.get("etag")!;
      const again = await api.request(
        `https://dragonballfr.com/api/public/plugin/export/${format}`,
        { headers: { "if-none-match": etag } },
      );
      expect(again.status).toBe(304);
    }
    expect((await api.request("/api/public/plugin/export/pdf")).status).toBe(400);

    const skill = await api.request(
      "/api/public/plugin/file?path=skills/dragon-ball/SKILL.md&format=json",
    );
    expect(skill.status).toBe(200);
    expect(((await skill.json()) as { text: string }).text).toContain("name: dragon-ball");
    expect((await api.request("/api/public/plugin/file?path=../CLAUDE.md")).status).toBe(404);
  });

  test("the archive is a gzipped tarball of the same files under shenron/, with the bundle ETag", async () => {
    const res = await api.request("https://dragonballfr.com/api/public/plugin/archive.tar.gz");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/gzip");
    const bundle = await readPluginBundle(REPO_PLUGIN);
    const etag = res.headers.get("etag")!;
    expect(etag).toBe(`"${bundle.sha256}"`);
    const files = await new Bun.Archive(await res.bytes()).files();
    const paths = [...files.keys()].filter((p) => !p.endsWith("/")).toSorted();
    expect(paths).toEqual(bundle.files.map((f) => `shenron/${f.path}`).toSorted());
    expect(paths).toContain("shenron/plugin.json");
    expect(paths).toContain("shenron/mcp_config.json");
    expect(await files.get("shenron/.claude-plugin/plugin.json")!.text()).toBe(
      bundle.files.find((f) => f.path === ".claude-plugin/plugin.json")!.text,
    );
    const again = await api.request("/api/public/plugin/archive.tar.gz", {
      headers: { "if-none-match": etag },
    });
    expect(again.status).toBe(304);
  });

  test("absolute links use the configured public origin, never the internal one", async () => {
    const site = createShenronApi(
      basePorts({
        plugin: createPluginPort(REPO_PLUGIN),
        publicOrigin: "https://dragonballfr.com/",
      }),
      { service: "shenron-site" },
    );
    const res = await site.request("https://localhost:5011/api/public/plugin");
    const text = await res.text();
    expect(text).not.toContain("localhost");
    const body = JSON.parse(text) as {
      formats: Record<string, string>;
      archive: string;
      skills: { url: string }[];
    };
    expect(body.formats.json).toBe("https://dragonballfr.com/api/public/plugin/export/json");
    expect(body.archive).toBe("https://dragonballfr.com/api/public/plugin/archive.tar.gz");
    expect(body.skills.every((s) => s.url.startsWith("https://dragonballfr.com/"))).toBe(true);
    const md = await site.request("https://localhost:5011/api/public/plugin/export/md");
    expect(await md.text()).not.toContain("localhost");
  });

  test("without a configured origin: forwarded headers only behind a loopback proxy", () => {
    const behind = new Request("https://localhost:5011/api/public/plugin", {
      headers: { "x-forwarded-host": "dragonballfr.com", "x-forwarded-proto": "https" },
    });
    expect(pluginPublicOrigin(behind)).toBe("https://dragonballfr.com");
    expect(pluginPublicOrigin(behind, "https://example.org")).toBe("https://example.org");
    const direct = new Request("https://dragonballfr.com/api/public/plugin", {
      headers: { "x-forwarded-host": "evil.example" },
    });
    expect(pluginPublicOrigin(direct)).toBe("https://dragonballfr.com");
    const local = new Request("http://127.0.0.1:4000/api/public/plugin");
    expect(pluginPublicOrigin(local)).toBe("http://127.0.0.1:4000");
    const spoofed = new Request("http://127.0.0.1:4000/", {
      headers: { "x-forwarded-host": "bad host/<x>" },
    });
    expect(pluginPublicOrigin(spoofed)).toBe("http://127.0.0.1:4000");
  });

  test("private file names are never served", () => {
    for (const name of [
      ".env",
      ".env.local",
      "id_ed25519",
      "bot.db",
      "x.sqlite",
      "a.pem",
      "s.local.md",
    ])
      expect(isPrivatePluginFile(name)).toBe(true);
    for (const name of ["plugin.json", "mcp_config.json", "SKILL.md", "faits.json", "canon.js"])
      expect(isPrivatePluginFile(name)).toBe(false);
  });

  test("without a plugin port the routes are not claimed", () => {
    const bare = createShenronApi(basePorts(), { service: "shenron-site" });
    expect(bare.handles("/api/public/plugin")).toBe(false);
    const noArchiver = createShenronApi(basePorts({ plugin: createPluginPort(REPO_PLUGIN) }), {
      service: "shenron-site",
    });
    expect(noArchiver.handles("/api/public/plugin")).toBe(true);
    expect(noArchiver.handles("/api/public/plugin/archive.tar.gz")).toBe(false);
  });
});
