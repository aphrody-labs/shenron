#!/usr/bin/env bun
// SPDX-License-Identifier: Apache-2.0
/**
 * Run a command and record its wall time, peak RSS and exit code as one JSON line.
 *
 * Usage: bun scripts/build/measure.ts [--out <file.jsonl>] [--label <name>] -- <command...>
 * Output and errors of the command are inherited; the record goes to stderr and, with
 * --out, is appended to the JSONL file (comparable before/after measurements).
 */
import { appendFileSync } from "node:fs";

const args = process.argv.slice(2);
const split = args.indexOf("--");
if (split < 0 || split === args.length - 1) {
  console.error("usage: bun scripts/build/measure.ts [--out file] [--label name] -- <command...>");
  process.exit(64);
}
const options = args.slice(0, split);
const command = args.slice(split + 1);
const option = (name: string) => {
  const index = options.indexOf(name);
  return index >= 0 ? options[index + 1] : undefined;
};
const started = performance.now();
const child = Bun.spawn(command, { stdio: ["inherit", "inherit", "inherit"], env: process.env });
const code = await child.exited;
const usage = child.resourceUsage();
const record = {
  label: option("--label") ?? command.join(" "),
  at: new Date().toISOString(),
  exitCode: code,
  wallMs: Math.round(performance.now() - started),
  // Bun reports maxRSS in bytes.
  maxRssMiB: usage ? Math.round(usage.maxRSS / 1048576) : null,
  userCpuMs: usage ? Math.round(Number(usage.cpuTime.user) / 1000) : null,
  systemCpuMs: usage ? Math.round(Number(usage.cpuTime.system) / 1000) : null,
};
console.error(JSON.stringify(record));
const out = option("--out");
if (out) appendFileSync(out, `${JSON.stringify(record)}\n`);
process.exit(code);
