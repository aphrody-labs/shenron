#!/usr/bin/env bun
// SPDX-License-Identifier: Apache-2.0
/** Upload a verified SQLite snapshot through Aphrody SSH, then invoke Shenron's atomic receiver. */
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { inspectOcrResults } from "./_ocr-results-db";
import {
  runAphrodyCli,
  type CliResult,
  type NativeCommandExecutor,
} from "../../packages/pipeline/src/aphrody/cli.ts";

export interface OcrResultsTransferOptions {
  host?: string;
  repository?: string;
  /** In-process command seam for tests; production always uses Aphrody's native FFI. */
  nativeExecutor?: NativeCommandExecutor;
}

export async function transferOcrResults(
  snapshot: string,
  options: OcrResultsTransferOptions = {},
): Promise<string> {
  const localPath = resolve(snapshot);
  const localReport = inspectOcrResults(localPath, "quick");
  if (!localReport.ok) {
    throw new Error(
      `OCR snapshot rejected before transfer: ${localReport.messages.slice(0, 3).join(" | ")}`,
    );
  }

  const host = options.host ?? "dbfr";
  if (host !== "dbfr" && host !== "vps") throw new Error("--host must be dbfr or vps");
  const repository = options.repository ?? "shenron";
  if (
    repository.startsWith("/") ||
    !/^[A-Za-z0-9._/-]+$/.test(repository) ||
    repository.split("/").includes("..")
  ) {
    throw new Error("--repository must be a relative path without parent traversal");
  }
  const cli = (sshArgs: string[]) =>
    runAphrodyCli(sshArgs, {
      timeoutMs: 10 * 60_000,
      ...(options.nativeExecutor ? { nativeExecutor: options.nativeExecutor } : {}),
    });

  function checked(
    result: CliResult,
    operation: string,
  ): Extract<CliResult, { kind: "exit"; ok: true }> {
    if (result.kind !== "exit" || !result.ok) {
      const detail =
        result.kind === "exit"
          ? result.stderr || result.stdout
          : result.kind === "not_found"
            ? result.message
            : result.kind === "timeout"
              ? `timeout after ${result.timeoutMs} ms`
              : result.error;
      throw new Error(`Aphrody SSH ${operation} failed: ${detail}`);
    }
    return result;
  }

  // Query the target home through the owner CLI; SFTP paths are absolute and do not expand '~'.
  const homeResult = checked(
    await cli([
      "exec",
      "--host",
      host,
      "--cmd",
      'printf \'%s\\n\' "$HOME"; test -d "$HOME/.aphrody/ocr"',
    ]),
    "remote OCR directory check",
  );
  const remoteHome = homeResult.stdout.trim();
  if (!remoteHome.startsWith("/") || remoteHome.includes("\n") || remoteHome.includes("\r")) {
    throw new Error("Aphrody SSH returned an invalid remote home directory");
  }
  const transferId = randomUUID();
  const remoteUpload = `${remoteHome}/.aphrody/ocr/results.db.upload.${transferId}`;
  checked(
    await cli(["sftp", "--host", host, "--path", remoteUpload, "--put", localPath]),
    "snapshot upload",
  );

  const quote = (value: string) => `'${value.replaceAll("'", "'\\''")}'`;
  const receiverCommand = `cd -- ${quote(repository)} && bun scripts/ops/recoit-ocr-results.ts --depuis ${quote(remoteUpload)}`;
  const received = checked(
    await cli(["exec", "--host", host, "--cmd", receiverCommand]),
    "atomic OCR reception",
  );
  return received.stdout;
}

function option(args: string[], name: string, fallback?: string): string | undefined {
  const index = args.indexOf(name);
  if (index === -1) return fallback;
  if (args.indexOf(name, index + 1) !== -1) throw new Error(`${name} may only be specified once`);
  const value = args[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${name} requires a value`);
  return value;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const allowedOptions = new Set(["--snapshot", "--host", "--repository"]);
  for (let index = 0; index < args.length; index++) {
    const name = args[index]!;
    if (!allowedOptions.has(name)) throw new Error(`unknown argument: ${name}`);
    if (!args[index + 1] || args[index + 1]!.startsWith("--"))
      throw new Error(`${name} requires a value`);
    index++;
  }
  const snapshot = option(args, "--snapshot");
  if (!snapshot) {
    throw new Error(
      "usage: bun envoie-ocr-results.ts --snapshot <results.snapshot.db> [--host dbfr] [--repository shenron]",
    );
  }
  const stdout = await transferOcrResults(snapshot, {
    host: option(args, "--host", "dbfr"),
    repository: option(args, "--repository", "shenron"),
  });
  process.stdout.write(stdout);
}

if (import.meta.main) {
  try {
    await main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
