import { expect, test } from "bun:test";
import {
  chmodSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { copyRuntimeDirectory, copyRuntimeFile } from "./bot-runtime-assets";

test("sealed runtime payloads remain readable outside their build UID under a restrictive umask", () => {
  const root = mkdtempSync(join(tmpdir(), "shenron-runtime-permissions-"));
  const previousUmask = process.umask(0o077);
  try {
    const source = join(root, "source");
    const output = join(root, "output");
    mkdirSync(source);
    mkdirSync(output);
    writeFileSync(join(source, "binding.node"), "native fixture bytes");
    writeFileSync(join(output, "binding.node"), "old restrictive file");
    chmodSync(join(output, "binding.node"), 0o600);
    copyRuntimeFile(join(source, "binding.node"), join(output, "binding.node"));
    mkdirSync(join(source, "migrations", "meta"), { recursive: true });
    writeFileSync(join(source, "migrations", "0000.sql"), "select 1;");
    writeFileSync(join(source, "migrations", "meta", "journal.json"), "{}");
    copyRuntimeDirectory(join(source, "migrations"), join(output, "migrations"));
    expect(readFileSync(join(output, "binding.node"), "utf8")).toBe("native fixture bytes");
    expect(readFileSync(join(output, "migrations", "0000.sql"), "utf8")).toBe("select 1;");
    if (process.platform !== "win32") {
      expect(statSync(join(output, "binding.node")).mode & 0o777).toBe(0o644);
      expect(statSync(join(output, "migrations")).mode & 0o777).toBe(0o755);
      expect(statSync(join(output, "migrations", "meta")).mode & 0o777).toBe(0o755);
      expect(statSync(join(output, "migrations", "0000.sql")).mode & 0o777).toBe(0o644);
      expect(statSync(join(output, "migrations", "meta", "journal.json")).mode & 0o777).toBe(0o644);
    }
  } finally {
    process.umask(previousUmask);
    rmSync(root, { recursive: true, force: true });
  }
});
