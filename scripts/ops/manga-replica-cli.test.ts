// SPDX-License-Identifier: Apache-2.0
import { expect, test } from "bun:test";
import { join } from "node:path";
import { tmpdir } from "node:os";
const cli = join(import.meta.dir, "../../apps/bot/scripts/sync-neon-to-sqlite.ts");
async function invoke(path: string, args: string[], env: Record<string, string> = {}) {
  const child = Bun.spawn([process.execPath, path, ...args], {
    env: {
      PATH: process.env.PATH,
      DATABASE_URL: "postgres://invalid:invalid@127.0.0.1:1/should_not_connect",
      ...env,
    },
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  return { stdout, stderr, code };
}
test("the canonical replica CLI exposes the specialized manga owner without opening a database", async () => {
  const result = await invoke(cli, ["--manga-search", "--help"]);
  expect(result.code).toBe(0);
  expect(result.stdout).toContain("--manga-search");
  expect(result.stdout).toContain("Default: read-only");
  expect(result.stderr).not.toContain("ECONNREFUSED");
});
test("the manga owner rejects ambiguous modes and generic table replacement before any connection", async () => {
  for (const args of [
    ["--manga-search", "--apply", "--dry-run"],
    ["--manga-search", "--tables", "db_manga_pages"],
  ]) {
    const result = await invoke(cli, args);
    expect(result.code).toBe(2);
    expect(result.stdout).toContain('"ok":false');
    expect(result.stderr).not.toContain("ECONNREFUSED");
  }
});
test("legacy Markdown ingest cannot write implicitly or with apply", async () => {
  const legacy = join(import.meta.dir, "../../apps/bot/scripts/ingest-manga-db.ts");
  const replica = join(tmpdir(), `shenron-disabled-ingest-${crypto.randomUUID()}.db`);
  for (const args of [[], ["--apply"], ["--dry-run", "--apply"]]) {
    const result = await invoke(legacy, args, { DATABASE_PATH: replica });
    expect(result.code).not.toBe(0);
    expect(result.stderr).toContain("Legacy manga ingest writes are disabled");
    expect(result.stderr).not.toContain("ENOENT");
    expect(await Bun.file(replica).exists()).toBe(false);
  }
});

test("the manga replica owner defaults to read-only and never creates a missing database", async () => {
  const replica = join(tmpdir(), `shenron-missing-manga-replica-${crypto.randomUUID()}.db`);
  const result = await invoke(cli, ["--manga-search"], { DATABASE_PATH: replica });
  expect(result.code).toBe(1);
  expect(result.stdout).toContain('"dryRun":true');
  expect(await Bun.file(replica).exists()).toBe(false);
  expect(result.stderr).not.toContain("ECONNREFUSED");
});
