import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";

async function cli(entry: string, args: string[], env: Record<string, string> = {}) {
  const child = Bun.spawn([process.execPath, entry, ...args], {
    cwd: join(import.meta.dir, ".."),
    env: { ...process.env, DATABASE_URL: "", SHENRON_PG_ENV: "", ...env },
    stdout: "pipe",
    stderr: "pipe",
    windowsHide: true,
  });
  const [stdout, stderr, exit] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  return { stdout, stderr, exit };
}

describe("standalone wiki replica CLI", () => {
  test("shares the source script help without requiring Discord", async () => {
    const [standalone, source] = await Promise.all([
      cli("src/entry-standalone.ts", ["--replica-sync", "--help"]),
      cli("scripts/sync-neon-to-sqlite.ts", ["--help"]),
    ]);
    expect(standalone.exit).toBe(0);
    expect(source.exit).toBe(0);
    expect(standalone.stdout).toBe(source.stdout);
    expect(standalone.stdout).toContain("WIKI_EDITORIAL");
  });

  test("rejects business tables before opening databases", async () => {
    const response = await cli("src/entry-standalone.ts", [
      "--replica-sync",
      "--dry-run",
      "--tables",
      "users,guild_settings",
    ]);
    expect(response.exit).toBe(2);
    expect(response.stderr).toContain("tables hors WIKI_EDITORIAL");
  });

  test("a missing replica is refused without creating a new database", async () => {
    const path = join(import.meta.dir, `missing-replica-${crypto.randomUUID()}.db`);
    const response = await cli("src/entry-standalone.ts", ["--replica-sync", "--dry-run"], {
      DATABASE_PATH: path,
      DATABASE_URL: "postgres://fixture:fixture@127.0.0.1:1/fixture",
    });
    expect(response.exit).toBe(1);
    const receipt = JSON.parse(response.stdout);
    expect(receipt.dryRun).toBe(true);
    expect(receipt.ok).toBe(false);
    expect(receipt.error).toContain("réplica introuvable");
    expect(existsSync(path)).toBe(false);
    expect(response.stdout).not.toContain("postgres://");
  });
});
