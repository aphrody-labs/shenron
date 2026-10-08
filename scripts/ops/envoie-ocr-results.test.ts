// SPDX-License-Identifier: Apache-2.0
import { Database } from "bun:sqlite";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import type { NativeCommandExecutor } from "../../packages/pipeline/src/aphrody/cli.ts";
import { transferOcrResults } from "./envoie-ocr-results";

let temporaryDirectory: string;
let commands: string[][];

beforeEach(() => {
  temporaryDirectory = mkdtempSync(join(tmpdir(), "shenron-ocr-sender-"));
  commands = [];
});

afterEach(() => rmSync(temporaryDirectory, { recursive: true, force: true }));

function validSnapshot(path: string): void {
  const db = new Database(path);
  db.exec(`
    CREATE TABLE ocr_pages (status TEXT NOT NULL);
    CREATE TABLE ocr_blocks (id INTEGER PRIMARY KEY);
    INSERT INTO ocr_pages (status) VALUES ('done');
    INSERT INTO ocr_blocks DEFAULT VALUES;
  `);
  db.close();
}

function fakeNativeExecutor(remoteHome = "/home/ocr user's home"): NativeCommandExecutor {
  return async (args) => {
    const call = [...args];
    commands.push(call);
    if (call[0] === "sftp") return { code: 0, stdout: "", stderr: "" };
    if (call[0] === "exec" && call.includes("--cmd")) {
      const command = call[call.indexOf("--cmd") + 1]!;
      if (command.startsWith("printf")) return { code: 0, stdout: `${remoteHome}\n`, stderr: "" };
      if (command.includes("recoit-ocr-results.ts"))
        return { code: 0, stdout: '{"ok":true}\n', stderr: "" };
    }
    return { code: 1, stdout: "", stderr: "unexpected native Aphrody command" };
  };
}

describe("envoie-ocr-results", () => {
  it("rejects a corrupt snapshot before invoking Aphrody SSH", async () => {
    const snapshot = join(temporaryDirectory, "corrupt.db");
    writeFileSync(snapshot, "not sqlite");

    await expect(
      transferOcrResults(snapshot, { nativeExecutor: fakeNativeExecutor() }),
    ).rejects.toThrow("OCR snapshot rejected before transfer");
    expect(commands).toHaveLength(0);

    const wrongSchema = join(temporaryDirectory, "wrong-schema.db");
    const db = new Database(wrongSchema);
    db.exec("CREATE TABLE unrelated (id INTEGER PRIMARY KEY)");
    db.close();
    await expect(
      transferOcrResults(wrongSchema, { nativeExecutor: fakeNativeExecutor() }),
    ).rejects.toThrow("missing tables: ocr_pages, ocr_blocks");
    expect(commands).toHaveLength(0);
  });

  it("uploads to a unique path before invoking the atomic receiver through native FFI", async () => {
    const snapshot = join(temporaryDirectory, "results.snapshot.db");
    validSnapshot(snapshot);
    const executor = fakeNativeExecutor();

    expect(await transferOcrResults(snapshot, { nativeExecutor: executor })).toContain('"ok":true');
    expect(await transferOcrResults(snapshot, { nativeExecutor: executor })).toContain('"ok":true');

    expect(commands).toHaveLength(6);
    const uploadedPaths = [0, 1].map((attempt) => {
      const offset = attempt * 3;
      expect(commands[offset]?.[0]).toBe("exec");
      expect(commands[offset + 1]?.[0]).toBe("sftp");
      expect(commands[offset + 2]?.[0]).toBe("exec");
      const upload = commands[offset + 1]![commands[offset + 1]!.indexOf("--path") + 1]!;
      expect(upload).toMatch(
        /^\/home\/ocr user's home\/\.aphrody\/ocr\/results\.db\.upload\.[0-9a-f-]{36}$/i,
      );
      expect(commands[offset + 1]).toContain(snapshot);
      const receiverCommand = commands[offset + 2]![commands[offset + 2]!.indexOf("--cmd") + 1]!;
      expect(receiverCommand).toContain(`--depuis '${upload.replaceAll("'", "'\\''")}'`);
      expect(receiverCommand).toContain("scripts/ops/recoit-ocr-results.ts");
      return upload;
    });
    expect(uploadedPaths[0]).not.toBe(uploadedPaths[1]);
    expect(readFileSync(snapshot).length).toBeGreaterThan(0);
  });
});
