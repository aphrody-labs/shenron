import { afterAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// La garde agit au chargement (process.exit) : on l'exerce dans des processus séparés.
const GUARD = join(import.meta.dir, "../src/db/wiki-write-guard.ts");
const dir = mkdtempSync(join(tmpdir(), "wiki-write-guard-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

const env = { ...process.env };
delete env.ALLOW_SQLITE_WIKI_WRITE;

function probe(name: string): string {
  const file = join(dir, name);
  writeFileSync(file, `import ${JSON.stringify(GUARD)};\nconsole.log("loaded");\n`);
  return file;
}

describe("wiki-write-guard", () => {
  test("un script de seed lancé directement est refusé", () => {
    const run = Bun.spawnSync([process.execPath, probe("seed-probe.ts")], { env });
    expect(run.exitCode).toBe(1);
    expect(run.stderr.toString()).toContain("ALLOW_SQLITE_WIKI_WRITE");
  });

  test("le runtime src/index.ts est exempté", () => {
    const src = join(dir, "src");
    mkdirSync(src, { recursive: true });
    writeFileSync(
      join(src, "index.ts"),
      `import ${JSON.stringify(GUARD)};\nconsole.log("loaded");\n`,
    );
    const run = Bun.spawnSync([process.execPath, join(src, "index.ts")], { env });
    expect(run.exitCode).toBe(0);
    expect(run.stdout.toString()).toContain("loaded");
  });

  test("le reverse-sync scripts/sync-neon-to-sqlite.ts est exempté, sans override", () => {
    const script = join(import.meta.dir, "../scripts/sync-neon-to-sqlite.ts");
    const run = Bun.spawnSync([process.execPath, script, "--help"], { env, cwd: dir });
    expect(run.stderr.toString()).not.toContain("ALLOW_SQLITE_WIKI_WRITE");
    expect(run.exitCode).toBe(0);
    expect(run.stdout.toString()).toContain("bun scripts/sync-neon-to-sqlite.ts");
  });

  test("un homonyme du reverse-sync hors du bot reste refusé", () => {
    const scripts = join(dir, "apps", "bot", "scripts");
    mkdirSync(scripts, { recursive: true });
    const file = join(scripts, "sync-neon-to-sqlite.ts");
    writeFileSync(file, `import ${JSON.stringify(GUARD)};\nconsole.log("loaded");\n`);
    const run = Bun.spawnSync([process.execPath, file], { env });
    expect(run.exitCode).toBe(1);
    expect(run.stderr.toString()).toContain("ALLOW_SQLITE_WIKI_WRITE");
  });

  test("l'exécutable compilé (shenron-bot) est exempté", () => {
    const outfile = join(dir, "compiled-probe");
    const build = Bun.spawnSync([
      process.execPath,
      "build",
      "--compile",
      probe("compiled-probe.ts"),
      "--outfile",
      outfile,
    ]);
    expect(build.exitCode).toBe(0);
    const run = Bun.spawnSync([outfile], { env });
    expect(run.stderr.toString()).not.toContain("ALLOW_SQLITE_WIKI_WRITE");
    expect(run.exitCode).toBe(0);
    expect(run.stdout.toString()).toContain("loaded");
  }, 60_000);
});
