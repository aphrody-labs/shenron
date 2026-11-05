#!/usr/bin/env bun
// SPDX-License-Identifier: Apache-2.0
/**
 * Automated lint / typecheck / format fix loop.
 *
 *   bun scripts/ops/fix-loop.ts [--remote vps] [--report-only] [--agent auto|claude-agent-sdk|opencode|yolo-ai|none]
 *                               [--rounds 5] [--agent-budget 40] [--commit] [--push] [--only oxlint,oxfmt,tsc,rustfmt,clippy] [--install]
 *
 * 1. Runs the repo checks (oxlint JSON, oxfmt file list, tsc per workspace, rustfmt per member,
 *    cargo clippy JSON) and parses them into structured findings.
 * 2. Mechanical fixes first (oxfmt write, oxlint --fix, rustfmt per member, cargo clippy --fix).
 * 3. Remaining findings go to an agent backend, one batch per file, edit scope restricted to that
 *    file and verified with git. A fix is kept only when that file's findings dropped and nothing
 *    new appeared; otherwise the file is reverted and recorded as unresolved.
 * 4. Writes var/reports/fix-loop-<timestamp>.json and a markdown summary, and (with --commit /
 *    --push) commits per logical group and pushes to main after a rebase.
 *
 * `--remote <ssh host>` re-runs this script inside the host checkout (default ~/shenron-fix, after
 * `git pull`), so checks, cargo and the agent SDK never run on the local machine.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";

export type Tool = "oxlint" | "oxfmt" | "tsc" | "rustfmt" | "clippy";
export type Finding = {
  tool: Tool;
  file: string;
  line: number;
  col: number;
  code: string;
  message: string;
  severity: "error" | "warning";
  help?: string;
};

const toPosix = (p: string) => p.replaceAll("\\", "/").replace(/^\.\//, "");

// ---------------------------------------------------------------- parsers

/** oxlint / `bun lint --format json`: `{ diagnostics: [{ message, code, severity, help, filename, labels: [{ span }] }] }`. */
export function parseOxlintJson(text: string): Finding[] {
  const start = text.indexOf("{");
  if (start < 0) return [];
  let data: { diagnostics?: any[] };
  try {
    data = JSON.parse(text.slice(start, text.lastIndexOf("}") + 1));
  } catch {
    return [];
  }
  return (data.diagnostics ?? []).map((d) => {
    const span = d.labels?.[0]?.span ?? {};
    // `unicorn(no-array-sort)` -> `unicorn/no-array-sort`
    const code = String(d.code ?? "").replace(/^([\w-]+)\((.+)\)$/, "$1/$2");
    return {
      tool: "oxlint" as const,
      file: toPosix(String(d.filename ?? "")),
      line: Number(span.line ?? 0),
      col: Number(span.column ?? 0),
      code,
      message: String(d.message ?? ""),
      severity: d.severity === "error" ? ("error" as const) : ("warning" as const),
      help: d.help ? String(d.help) : undefined,
    };
  });
}

/** tsc / `bun check`: `src/a.ts(1,14): error TS2322: msg` or `src/a.ts:1:14 - error TS2322: msg`. */
export function parseTsc(text: string, cwdPrefix = ""): Finding[] {
  const out: Finding[] = [];
  const re =
    /^(?<file>[^\s(][^():]*?)(?:\((?<l1>\d+),(?<c1>\d+)\)|:(?<l2>\d+):(?<c2>\d+))(?::| -) (?<sev>error|warning) (?<code>TS\d+): (?<msg>.*)$/;
  for (const raw of text.split(/\r?\n/)) {
    const m = re.exec(raw.trim());
    if (!m?.groups) continue;
    const g = m.groups;
    out.push({
      tool: "tsc",
      file: toPosix(join(cwdPrefix, g.file!)),
      line: Number(g.l1 ?? g.l2),
      col: Number(g.c1 ?? g.c2),
      code: g.code!,
      message: g.msg!,
      severity: g.sev === "warning" ? "warning" : "error",
    });
  }
  return out;
}

/** oxfmt `--check`: the unformatted files are listed as `path (12ms)` lines. */
export function parseOxfmtList(text: string): Finding[] {
  const out: Finding[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const m = /^(\S.*?) \(\d+(?:\.\d+)?m?s\)$/.exec(raw.trim());
    if (!m || /^(Finished|Checking)/.test(m[1]!)) continue;
    out.push({
      tool: "oxfmt",
      file: toPosix(m[1]!),
      line: 0,
      col: 0,
      code: "format",
      message: "file is not formatted",
      severity: "error",
    });
  }
  return out;
}

/** rustfmt `--check`: `Diff in /abs/path/file.rs:12:` (or the older `Diff in file.rs at line 12:`). */
export function parseRustfmt(text: string, root = ""): Finding[] {
  const out: Finding[] = [];
  const re = /^Diff in (.+?)(?::(\d+):| at line (\d+):)\s*$/;
  for (const raw of text.split(/\r?\n/)) {
    const m = re.exec(raw);
    if (!m) continue;
    let file = toPosix(m[1]!);
    const base = toPosix(root).replace(/\/$/, "");
    if (base && file.startsWith(`${base}/`)) file = file.slice(base.length + 1);
    out.push({
      tool: "rustfmt",
      file,
      line: Number(m[2] ?? m[3]),
      col: 0,
      code: "fmt",
      message: "rustfmt diff",
      severity: "error",
    });
  }
  return out;
}

/** `cargo clippy --message-format=json`: one JSON object per line, `compiler-message` carries the diagnostic. */
export function parseClippyJson(text: string, root = ""): Finding[] {
  const out: Finding[] = [];
  const base = toPosix(root).replace(/\/$/, "");
  for (const raw of text.split(/\r?\n/)) {
    if (!raw.startsWith("{")) continue;
    let obj: any;
    try {
      obj = JSON.parse(raw);
    } catch {
      continue;
    }
    if (obj.reason !== "compiler-message") continue;
    const msg = obj.message;
    if (!msg || (msg.level !== "warning" && msg.level !== "error")) continue;
    const span = (msg.spans ?? []).find((s: any) => s.is_primary) ?? msg.spans?.[0];
    if (!span) continue; // "N warnings emitted" / "aborting due to" summaries
    let file = toPosix(String(span.file_name));
    if (base && file.startsWith(`${base}/`)) file = file.slice(base.length + 1);
    out.push({
      tool: "clippy",
      file,
      line: Number(span.line_start),
      col: Number(span.column_start),
      code: String(msg.code?.code ?? msg.level),
      message: String(msg.message),
      severity: msg.level === "error" ? "error" : "warning",
      help:
        (msg.children ?? [])
          .filter((c: any) => c.level === "help")
          .map((c: any) => c.message)
          .join("; ") || undefined,
    });
  }
  return out;
}

// ---------------------------------------------------------------- planner

const identity = (f: Finding) => `${f.tool}|${f.file}|${f.code}|${f.message}`;

/** Several workspaces type-check the same shared file: keep one finding per location and rule. */
export function dedupe(findings: Finding[]): Finding[] {
  const seen = new Set<string>();
  return findings.filter((f) => {
    const key = `${identity(f)}|${f.line}|${f.col}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function countByFile(findings: Finding[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const f of findings) map.set(f.file, (map.get(f.file) ?? 0) + 1);
  return map;
}

export function countByTool(findings: Finding[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const f of findings) out[f.tool] = (out[f.tool] ?? 0) + 1;
  return out;
}

/** Multiset difference of finding identities (line numbers are ignored: edits move them). */
export function diffFindings(before: Finding[], after: Finding[]) {
  const pool = new Map<string, number>();
  for (const f of before) pool.set(identity(f), (pool.get(identity(f)) ?? 0) + 1);
  const added: Finding[] = [];
  for (const f of after) {
    const left = pool.get(identity(f)) ?? 0;
    if (left > 0) pool.set(identity(f), left - 1);
    else added.push(f);
  }
  const fixedCount = before.length - (after.length - added.length);
  return { added, fixed: fixedCount };
}

/** Keep a fix only if the file's finding count dropped and no new finding appeared. */
export function acceptFix(beforeFile: Finding[], afterFile: Finding[]): boolean {
  const { added } = diffFindings(beforeFile, afterFile);
  return afterFile.length < beforeFile.length && added.length === 0;
}

export type AgentBatch = { file: string; findings: Finding[] };
export type Plan = {
  mechanical: { oxfmt: string[]; oxlintFix: string[]; rustfmt: string[]; clippyFix: boolean };
  agent: AgentBatch[];
};

/** Which files an agent may take: not already unresolved, not generated/vendored, not formatting-only. */
export function planRound(
  findings: Finding[],
  opts: { unresolved: Set<string>; budget: number; skip?: (file: string) => boolean },
): Plan {
  const files = (tool: Tool) => [
    ...new Set(findings.filter((f) => f.tool === tool).map((f) => f.file)),
  ];
  const byFile = new Map<string, Finding[]>();
  for (const f of findings) {
    if (f.tool === "oxfmt" || f.tool === "rustfmt") continue; // purely mechanical
    if (opts.unresolved.has(f.file) || opts.skip?.(f.file)) continue;
    byFile.set(f.file, [...(byFile.get(f.file) ?? []), f]);
  }
  const agent = [...byFile.entries()]
    .toSorted((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]))
    .slice(0, Math.max(0, opts.budget))
    .map(([file, fs]) => ({ file, findings: fs }));
  return {
    mechanical: {
      oxfmt: files("oxfmt"),
      oxlintFix: files("oxlint"),
      rustfmt: files("rustfmt"),
      clippyFix: findings.some((f) => f.tool === "clippy"),
    },
    agent,
  };
}

const SUPPRESSION =
  /(oxlint-disable|eslint-disable|@ts-ignore|@ts-expect-error|@ts-nocheck|#!?\[(allow|expect)\(|rustfmt::skip)/;

/** Out-of-scope paths and added suppressions in an agent edit. `changed` = `git diff --name-only`, `diff` = unified diff. */
export function auditEdit(
  allowed: string[],
  changed: string[],
  diff: string,
): { outOfScope: string[]; suppressions: string[] } {
  const ok = new Set(allowed.map(toPosix));
  const outOfScope = changed.map(toPosix).filter((f) => f && !ok.has(f));
  const suppressions = diff
    .split("\n")
    .filter((l) => l.startsWith("+") && !l.startsWith("+++") && SUPPRESSION.test(l))
    .map((l) => l.slice(1).trim());
  return { outOfScope, suppressions };
}

export function agentPrompt(batch: AgentBatch, source: string): string {
  const list = batch.findings
    .map(
      (f) =>
        `- line ${f.line}:${f.col} [${f.tool} ${f.code}] ${f.message}${f.help ? ` (rule text: ${f.help})` : ""}`,
    )
    .join("\n");
  return [
    `Fix every finding below in the single file ${batch.file}. You may only Read and Edit that file.`,
    "Rules: make the smallest correct change; keep behavior; never add suppression comments (no eslint-disable, oxlint-disable, @ts-ignore, @ts-expect-error, #[allow]); do not touch config files or other files; do not reformat unrelated code.",
    "When done reply with one short line.",
    "",
    "Findings:",
    list,
    "",
    `Current content of ${batch.file}:`,
    "```",
    source.length > 60_000 ? `${source.slice(0, 60_000)}\n/* truncated */` : source,
    "```",
  ].join("\n");
}

// ---------------------------------------------------------------- process helpers

/** Optional prefix for heavy cargo runs, e.g. `flock -w 3000 ~/build/locks/heavy.lock` on the shared build host. */
const CARGO_WRAP = process.env.FIX_LOOP_CARGO_WRAP ?? "";

const PATH_PREFIX =
  'export PATH="$HOME/.bun/bin:$HOME/.local/bin:$HOME/.cargo/bin:$PATH"; export NEXT_TELEMETRY_DISABLED=1;';

export type Run = { code: number; out: string; err: string };

export async function sh(command: string, cwd: string, timeoutMs = 1_200_000): Promise<Run> {
  const child = Bun.spawn(["bash", "-c", `${PATH_PREFIX} ${command}`], {
    cwd,
    stdout: "pipe",
    stderr: "pipe",
    stdin: "ignore",
    env: { ...process.env, CARGO_TERM_COLOR: "never", NO_COLOR: "1" },
  });
  const timer = setTimeout(() => child.kill(), timeoutMs);
  const [out, err, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  clearTimeout(timer);
  return { code, out, err };
}

const q = (s: string) => `'${s.replaceAll("'", `'\\''`)}'`;

// ---------------------------------------------------------------- checks

type Workspace = { cwd: string; args: string[] };

const existing = (root: string, names: string[]) => names.filter((n) => existsSync(join(root, n)));

export async function checkLint(root: string, files?: string[]): Promise<Finding[]> {
  const dirs = files ?? existing(root, ["apps", "packages", "scripts", "src"]);
  if (!dirs.length) return [];
  const cfg = existsSync(join(root, ".oxlintrc.json")) ? "-c .oxlintrc.json" : "";
  const r = await sh(`bun lint --no-script ${cfg} --format json ${dirs.map(q).join(" ")}`, root);
  return parseOxlintJson(r.out);
}

export async function checkFormat(root: string, files?: string[]): Promise<Finding[]> {
  if (files && !files.length) return [];
  const cmd = files
    ? `bun scripts/testing/native-quality.ts fmt --check ${files.map(q).join(" ")}`
    : "bun run format:check";
  const r = await sh(cmd, root);
  return parseOxfmtList(`${r.out}\n${r.err}`);
}

async function tsWorkspaces(root: string): Promise<Workspace[]> {
  const gates = join(root, "scripts/testing/workspace-gates.ts");
  if (existsSync(gates)) {
    const r = await sh(
      `bun -e 'import {workspaceCommands} from "./scripts/testing/workspace-gates"; console.log(JSON.stringify(workspaceCommands(process.cwd(),"typecheck")))'`,
      root,
    );
    try {
      return JSON.parse(r.out.trim().split("\n").pop()!);
    } catch {
      /* fall through */
    }
  }
  return [{ cwd: root, args: ["bun", "run", "typecheck"] }];
}

export async function checkTsc(root: string, only?: string[]): Promise<Finding[]> {
  const spaces = (await tsWorkspaces(root)).filter(
    (w) => !only || only.some((f) => toPosix(f).startsWith(toPosix(relative(root, w.cwd)))),
  );
  const out: Finding[] = [];
  for (const w of spaces) {
    const args = w.args[0] === "bun" && w.args[1] === "check" ? ["bun", "check"] : w.args;
    const r = await sh(args.map(q).join(" "), w.cwd);
    out.push(...parseTsc(`${r.out}\n${r.err}`, relative(root, w.cwd)));
  }
  return dedupe(out);
}

export type Member = {
  name: string;
  dir: string;
  manifest: string;
  edition: string;
  files: string[];
};

/** Crates found from tracked Cargo.toml files (works when path dependencies are missing, unlike `cargo metadata`). */
export async function rustMembers(root: string): Promise<Member[]> {
  const tracked = (await sh("git ls-files -- '*Cargo.toml' '*.rs'", root)).out
    .split("\n")
    .filter(Boolean);
  const manifests = tracked.filter((f) => f.endsWith("Cargo.toml"));
  const rootToml = existsSync(join(root, "Cargo.toml"))
    ? (Bun.TOML.parse(readFileSync(join(root, "Cargo.toml"), "utf8")) as any)
    : {};
  const wsEdition = rootToml.workspace?.package?.edition ?? "2024";
  const members: Member[] = [];
  for (const m of manifests) {
    let toml: any;
    try {
      toml = Bun.TOML.parse(readFileSync(join(root, m), "utf8"));
    } catch {
      continue;
    }
    if (!toml.package?.name) continue;
    const ed = toml.package.edition;
    members.push({
      name: String(toml.package.name),
      manifest: toPosix(m),
      dir: toPosix(dirname(m)) === "." ? "" : toPosix(dirname(m)),
      edition: typeof ed === "string" ? ed : wsEdition,
      files: [],
    });
  }
  const bySpecificity = members.toSorted((x, y) => y.dir.length - x.dir.length);
  for (const f of tracked.filter((x) => x.endsWith(".rs"))) {
    const owner = bySpecificity.find((m) => m.dir === "" || f.startsWith(`${m.dir}/`));
    if (owner) owner.files.push(toPosix(f));
  }
  return members.filter((m) => m.files.length);
}

export function rustfmtCommand(root: string, m: Member, check: boolean): string {
  const cfg = existsSync(join(root, "rustfmt.toml")) ? `--config-path ${q(root)}` : "";
  return `rustfmt ${check ? "--check" : ""} --edition ${m.edition} ${cfg} ${m.files.map(q).join(" ")}`;
}

export async function checkRustfmt(root: string, members: Member[], only?: string[]) {
  const out: Finding[] = [];
  for (const m of members) {
    if (only && !only.some((f) => toPosix(f).startsWith(`${m.dir}/`) || m.dir === "")) continue;
    const r = await sh(rustfmtCommand(root, m, true), root);
    out.push(
      ...parseRustfmt(
        `${r.out}
${r.err}`,
        root,
      ),
    );
  }
  return out;
}

export async function checkClippy(root: string, pkg?: string): Promise<Finding[]> {
  if (!existsSync(join(root, "Cargo.toml"))) return [];
  const scope = pkg ? `-p ${q(pkg)}` : "--workspace";
  const r = await sh(
    `${CARGO_WRAP} cargo clippy ${scope} --all-targets --message-format=json -- -D warnings`,
    root,
    3_000_000,
  );
  return parseClippyJson(r.out, root);
}

export type CheckSet = Tool[];

export async function runChecks(root: string, tools: CheckSet, members: Member[]) {
  const all: Finding[] = [];
  const jobs: Promise<Finding[]>[] = [];
  if (tools.includes("oxlint")) jobs.push(checkLint(root));
  if (tools.includes("oxfmt")) jobs.push(checkFormat(root));
  if (tools.includes("tsc")) jobs.push(checkTsc(root));
  if (tools.includes("rustfmt")) jobs.push(checkRustfmt(root, members));
  // clippy last: it saturates the cores, run it alone after the cheap checks
  for (const f of await Promise.all(jobs)) all.push(...f);
  if (tools.includes("clippy")) all.push(...(await checkClippy(root)));
  return all;
}

async function recheck(root: string, tool: Tool, file: string, members: Member[]) {
  switch (tool) {
    case "oxlint":
      return checkLint(root, [file]);
    case "oxfmt":
      return checkFormat(root, [file]);
    case "tsc":
      return checkTsc(root, [file]);
    case "rustfmt":
      return checkRustfmt(root, members, [file]);
    case "clippy": {
      const m = members.find((x) => x.files.includes(file));
      return checkClippy(root, m?.name);
    }
  }
}

// ---------------------------------------------------------------- agent backends

export type FixResult = { ok: boolean; reason: string };
export interface Backend {
  name: string;
  probe(): Promise<FixResult>;
  fix(root: string, batch: AgentBatch, prompt: string): Promise<FixResult>;
}

const TURNS = 10;
const TIMEOUT_MS = 300_000;

function claudeSdkBackend(sdkDir: string, model?: string): Backend {
  let mod: any;
  const load = async () => {
    if (mod) return mod;
    if (!existsSync(join(sdkDir, "node_modules/@anthropic-ai/claude-agent-sdk"))) {
      mkdirSync(sdkDir, { recursive: true });
      const r = await sh(
        `cd ${q(sdkDir)} && [ -f package.json ] || echo '{"name":"fix-loop-sdk","private":true}' > package.json; bun add @anthropic-ai/claude-agent-sdk@0.3.318`,
        sdkDir,
      );
      if (r.code !== 0) throw new Error(`bun add failed: ${r.err.slice(-300)}`);
    }
    mod = await import(join(sdkDir, "node_modules/@anthropic-ai/claude-agent-sdk/sdk.mjs")).catch(
      () => import(join(sdkDir, "node_modules/@anthropic-ai/claude-agent-sdk")),
    );
    return mod;
  };
  const run = async (cwd: string, prompt: string, target: string | null, turns: number) => {
    const sdk = await load();
    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), TIMEOUT_MS);
    const claudeBin = (await sh("command -v claude", cwd)).out.trim();
    let final = "";
    let isError = false;
    try {
      for await (const message of sdk.query({
        prompt,
        options: {
          cwd,
          model,
          maxTurns: turns,
          abortController: abort,
          settingSources: [],
          mcpServers: {},
          extraArgs: { "strict-mcp-config": null, "disable-slash-commands": null },
          permissionMode: "default",
          pathToClaudeCodeExecutable: claudeBin || undefined,
          disallowedTools: [
            "Bash",
            "Write",
            "NotebookEdit",
            "WebFetch",
            "WebSearch",
            "Task",
            "Agent",
            "Glob",
            "Grep",
          ],
          // Only Read/Edit of the one target file is ever approved; everything else is denied.
          canUseTool: async (name: string, input: Record<string, unknown>) => {
            const path = String(input.file_path ?? input.path ?? "");
            if (
              target &&
              (name === "Read" || name === "Edit") &&
              resolve(cwd, path) === resolve(cwd, target)
            )
              return { behavior: "allow", updatedInput: input };
            return {
              behavior: "deny",
              message: `only Read/Edit of ${target ?? "nothing"} is allowed`,
            };
          },
        },
      })) {
        if (message.type === "result") {
          isError = message.is_error === true || message.subtype !== "success";
          final = String(message.result ?? message.subtype ?? "");
        }
      }
    } finally {
      clearTimeout(timer);
    }
    return { isError, final };
  };
  return {
    name: "claude-agent-sdk",
    async probe() {
      try {
        const r = await run(tmpDir(), "Reply with the single word OK.", null, 1);
        return r.isError
          ? { ok: false, reason: `SDK call failed: ${r.final.slice(0, 200)}` }
          : { ok: true, reason: "authenticated" };
      } catch (e) {
        return { ok: false, reason: `SDK unavailable: ${(e as Error).message.slice(0, 200)}` };
      }
    },
    async fix(root, batch, prompt) {
      try {
        const r = await run(root, prompt, batch.file, TURNS);
        return { ok: !r.isError, reason: r.final.slice(0, 200) };
      } catch (e) {
        return { ok: false, reason: (e as Error).message.slice(0, 200) };
      }
    },
  };
}

function tmpDir() {
  const d = join(process.env.TMPDIR ?? "/tmp", "fix-loop-probe");
  mkdirSync(d, { recursive: true });
  return d;
}

function opencodeBackend(): Backend {
  return {
    name: "opencode",
    async probe() {
      const w = await sh("command -v opencode", tmpDir());
      if (w.code !== 0) return { ok: false, reason: "opencode is not installed on this host" };
      const r = await sh(
        "timeout 90 opencode run 'Reply with the single word OK.'",
        tmpDir(),
        100_000,
      );
      return r.code === 0 && /OK/.test(r.out)
        ? { ok: true, reason: "authenticated" }
        : {
            ok: false,
            reason: `opencode probe failed (exit ${r.code}): ${(r.err || r.out).slice(0, 200)}`,
          };
    },
    async fix(root, batch, prompt) {
      const r = await sh(
        `timeout ${TIMEOUT_MS / 1000} opencode run ${q(prompt)}`,
        root,
        TIMEOUT_MS + 10_000,
      );
      return { ok: r.code === 0, reason: (r.out || r.err).slice(-200) };
    },
  };
}

function yoloAiBackend(dir: string): Backend {
  const script = join(dir, "scripts/claude.ts");
  return {
    name: "yolo-ai",
    async probe() {
      if (!existsSync(script))
        return {
          ok: false,
          reason: `yolo-ai not found at ${dir} (clone aphrody-labs/yolo-ai there)`,
        };
      if (!process.env.ANTHROPIC_API_KEY)
        return { ok: false, reason: "yolo-ai scripts/claude.ts needs ANTHROPIC_API_KEY (unset)" };
      const r = await sh(
        `cd ${q(dir)} && bun scripts/claude.ts 'Reply with the single word OK.'`,
        dir,
        90_000,
      );
      return r.code === 0 && /OK/.test(r.out)
        ? { ok: true, reason: "authenticated" }
        : { ok: false, reason: (r.err || r.out).slice(0, 200) };
    },
    // yolo-ai has no edit tool: ask for the full file in one fenced block and write the target file ourselves.
    async fix(root, batch, prompt) {
      const ask = `${prompt}\n\nReply with ONLY the complete corrected file content inside one \`\`\` fenced block.`;
      const r = await sh(`cd ${q(dir)} && bun scripts/claude.ts ${q(ask)}`, dir, TIMEOUT_MS);
      const m = /```[\w-]*\n([\s\S]*?)\n```\s*$/.exec(r.out.trim());
      if (r.code !== 0 || !m) return { ok: false, reason: "no fenced file in the reply" };
      writeFileSync(join(root, batch.file), `${m[1]}\n`);
      return { ok: true, reason: "file rewritten" };
    },
  };
}

export async function chooseBackend(
  want: string,
  opts: { sdkDir: string; yoloAiDir: string; model?: string },
): Promise<{ backend?: Backend; probes: Record<string, FixResult> }> {
  const order = ["claude-agent-sdk", "opencode", "yolo-ai"];
  const list = want === "auto" ? order : [want, ...order.filter((x) => x !== want)];
  const make = (n: string): Backend =>
    n === "claude-agent-sdk"
      ? claudeSdkBackend(opts.sdkDir, opts.model)
      : n === "opencode"
        ? opencodeBackend()
        : yoloAiBackend(opts.yoloAiDir);
  const probes: Record<string, FixResult> = {};
  for (const n of list) {
    const b = make(n);
    probes[n] = await b.probe();
    if (probes[n]!.ok) return { backend: b, probes };
  }
  return { probes };
}

// ---------------------------------------------------------------- loop

type Options = {
  root: string;
  tools: Tool[];
  agent: string;
  rounds: number;
  budget: number;
  reportOnly: boolean;
  commit: boolean;
  push: boolean;
  sdkDir: string;
  yoloAiDir: string;
  model?: string;
};

const git = (root: string, args: string) => sh(`git ${args}`, root);

/** Dirty files (modified or untracked) with their current content, so an agent batch can be undone without losing earlier mechanical fixes. */
export async function worktreeSnapshot(root: string): Promise<Map<string, string>> {
  const names = new Set<string>();
  for (const cmd of ["diff --name-only", "ls-files -o --exclude-standard"])
    for (const n of (await git(root, cmd)).out.split("\n")) if (n) names.add(toPosix(n));
  const snap = new Map<string, string>();
  for (const n of names)
    if (existsSync(join(root, n))) snap.set(n, readFileSync(join(root, n), "utf8"));
  return snap;
}

export async function changedSince(root: string, snap: Map<string, string>): Promise<string[]> {
  const now = await worktreeSnapshot(root);
  const out: string[] = [];
  for (const [n, c] of now) if (snap.get(n) !== c) out.push(n);
  for (const n of snap.keys()) if (!now.has(n)) out.push(n);
  return out;
}

export async function restoreSnapshot(root: string, snap: Map<string, string>, files: string[]) {
  for (const f of files) {
    const before = snap.get(f);
    if (before !== undefined) writeFileSync(join(root, f), before);
    else if ((await git(root, `ls-files --error-unmatch -- ${q(f)}`)).code === 0)
      await git(root, `checkout -- ${q(f)}`);
    else await sh(`rm -f ${q(f)}`, root);
  }
}

/** Lines of `next` that are not in `prev` (multiset), for the suppression audit. */
export function addedLines(prev: string, next: string): string[] {
  const pool = new Map<string, number>();
  for (const l of prev.split("\n")) pool.set(l, (pool.get(l) ?? 0) + 1);
  const out: string[] = [];
  for (const l of next.split("\n")) {
    const n = pool.get(l) ?? 0;
    if (n > 0) pool.set(l, n - 1);
    else out.push(l);
  }
  return out;
}

const GENERATED = /(^|\/)(node_modules|vendor|target|dist|wasm|generated|examples)\//;

async function commitGroup(o: Options, label: string, message: string, log: string[]) {
  const status = await git(o.root, "status --porcelain");
  if (!status.out.trim()) return null;
  await git(o.root, "add -A");
  const body = `${message}\n\nCo-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`;
  const r = await sh(`git commit -q -m ${q(body)} && git rev-parse HEAD`, o.root);
  log.push(`commit ${label}: ${r.out.trim() || r.err.trim()}`);
  return r.code === 0 ? r.out.trim() : null;
}

export async function main(argv: string[]): Promise<number> {
  const arg = (name: string, def?: string) => {
    const i = argv.indexOf(`--${name}`);
    return i >= 0 ? argv[i + 1] : def;
  };
  const flag = (name: string) => argv.includes(`--${name}`);

  const remote = arg("remote");
  if (remote) {
    const dir = arg("remote-dir", "shenron-fix");
    const rest = argv.filter(
      (a, i) =>
        a !== "--remote" &&
        argv[i - 1] !== "--remote" &&
        a !== "--remote-dir" &&
        argv[i - 1] !== "--remote-dir",
    );
    const script = `${PATH_PREFIX} cd "$HOME/${dir}" && git pull -q --rebase origin main && bun scripts/ops/fix-loop.ts ${rest.map(q).join(" ")}`;
    const child = Bun.spawn(["ssh", "-o", "BatchMode=yes", remote, "bash", "-s"], {
      stdin: new Blob([script]),
      stdout: "inherit",
      stderr: "inherit",
    });
    return await child.exited;
  }

  const root = resolve(arg("root", process.cwd())!);
  const home = process.env.HOME ?? "/tmp";
  const all: Tool[] = ["oxlint", "oxfmt", "tsc", "rustfmt", "clippy"];
  const o: Options = {
    root,
    tools: (arg("only")?.split(",") as Tool[] | undefined) ?? all,
    agent: arg("agent", "auto")!,
    rounds: Number(arg("rounds", "5")),
    budget: Number(arg("agent-budget", "40")),
    reportOnly: flag("report-only"),
    commit: flag("commit"),
    push: flag("push"),
    sdkDir: arg("sdk-dir", join(home, ".fix-loop-sdk"))!,
    yoloAiDir: arg("yolo-ai-dir", join(home, "yolo-ai"))!,
    model: arg("model"),
  };
  const log: string[] = [];
  const say = (s: string) => {
    log.push(s);
    console.log(s);
  };
  const members = o.tools.some((t) => t === "rustfmt" || t === "clippy")
    ? await rustMembers(root)
    : [];
  const sha0 = (await git(root, "rev-parse HEAD")).out.trim();

  say(`fix-loop root=${root} HEAD=${sha0} tools=${o.tools.join(",")} reportOnly=${o.reportOnly}`);
  if (flag("install"))
    say(`install: exit ${(await sh("bun install --frozen-lockfile", root)).code}`);
  const baseline = await runChecks(root, o.tools, members);
  say(`baseline: ${JSON.stringify(countByTool(baseline))} total=${baseline.length}`);

  const mechanical: Record<string, { before: number; after: number }> = {};
  const agentFixed: { file: string; backend: string; fixed: number }[] = [];
  const unresolved = new Map<string, { reason: string; findings: Finding[] }>();
  const commits: string[] = [];
  let backendName = "none";
  let probes: Record<string, FixResult> = {};
  let current = baseline;
  let agentCalls = 0;

  if (!o.reportOnly && baseline.length) {
    // ---- mechanical
    const plan = planRound(baseline, { unresolved: new Set(), budget: 0 });
    const step = async (label: string, tool: Tool, cmd: string | null, message: string) => {
      if (!cmd) return;
      const before = current.filter((f) => f.tool === tool).length;
      if (!before) return;
      const r = await sh(cmd, root);
      say(`mechanical ${label}: exit ${r.code}`);
      const after = await runChecks(root, [tool], members);
      mechanical[label] = { before, after: after.length };
      current = [...current.filter((f) => f.tool !== tool), ...after];
      const fresh = diffFindings(
        baseline.filter((f) => f.tool === tool),
        after,
      ).added;
      if (fresh.length) say(`  warning: ${fresh.length} new ${tool} findings after ${label}`);
      if (o.commit && after.length < before && !fresh.length) {
        const sha = await commitGroup(
          o,
          label,
          `${message} (${tool}: ${before} -> ${after.length} findings)`,
          log,
        );
        if (sha) commits.push(sha);
      }
    };
    await step(
      "oxfmt-write",
      "oxfmt",
      plan.mechanical.oxfmt.length
        ? `bun scripts/testing/native-quality.ts fmt ${plan.mechanical.oxfmt.map(q).join(" ")}`
        : null,
      "style: oxfmt write on unformatted files",
    );
    await step(
      "oxlint-fix",
      "oxlint",
      plan.mechanical.oxlintFix.length
        ? `bun lint --no-script --fix ${existsSync(join(root, ".oxlintrc.json")) ? "-c .oxlintrc.json" : ""} ${plan.mechanical.oxlintFix.map(q).join(" ")}`
        : null,
      "fix(lint): apply oxlint autofixes",
    );
    await step(
      "cargo-fmt",
      "rustfmt",
      members.length && plan.mechanical.rustfmt.length
        ? members
            .filter((m) => plan.mechanical.rustfmt.some((f) => m.files.includes(f)))
            .map((m) => rustfmtCommand(root, m, false))
            .join(" ; ")
        : null,
      "style(rust): rustfmt per member",
    );
    await step(
      "clippy-fix",
      "clippy",
      plan.mechanical.clippyFix
        ? `${CARGO_WRAP} cargo clippy --fix --allow-dirty --allow-staged --workspace --all-targets`
        : null,
      "fix(rust): cargo clippy --fix machine-applicable suggestions",
    );

    // ---- agent
    for (
      let round = 1;
      round <= o.rounds && current.length && agentCalls < o.budget && o.agent !== "none";
      round++
    ) {
      const p = planRound(current, {
        unresolved: new Set(unresolved.keys()),
        budget: o.budget - agentCalls,
        skip: (f) => GENERATED.test(f),
      });
      if (!p.agent.length) break;
      if (backendName === "none") {
        const chosen = await chooseBackend(o.agent, {
          sdkDir: o.sdkDir,
          yoloAiDir: o.yoloAiDir,
          model: o.model,
        });
        probes = chosen.probes;
        if (!chosen.backend) {
          say(`no agent backend usable: ${JSON.stringify(probes)}`);
          for (const b of p.agent)
            unresolved.set(b.file, { reason: "no agent backend available", findings: b.findings });
          break;
        }
        backendName = chosen.backend.name;
        say(`agent backend: ${backendName}`);
        (o as any)._backend = chosen.backend;
      }
      const backend: Backend = (o as any)._backend;
      say(`round ${round}: ${p.agent.length} file batches, ${current.length} findings`);
      for (const batch of p.agent) {
        agentCalls++;
        const tool = batch.findings[0]!.tool;
        const source = readFileSync(join(root, batch.file), "utf8");
        const snap = await worktreeSnapshot(root);
        const res = await backend.fix(root, batch, agentPrompt(batch, source));
        // The agent edits in its own style: format only the target file so oxfmt/rustfmt stay green.
        if (/\.(ts|tsx|js|jsx|json)$/.test(batch.file) && o.tools.includes("oxfmt"))
          await sh(`bun scripts/testing/native-quality.ts fmt ${q(batch.file)}`, root);
        else if (batch.file.endsWith(".rs"))
          await sh(
            `rustfmt --edition ${members.find((x) => x.files.includes(batch.file))?.edition ?? "2024"} ${existsSync(join(root, "rustfmt.toml")) ? `--config-path ${q(root)}` : ""} ${q(batch.file)}`,
            root,
          );
        const changed = await changedSince(root, snap);
        const added = addedLines(
          snap.get(batch.file) ?? source,
          existsSync(join(root, batch.file)) ? readFileSync(join(root, batch.file), "utf8") : "",
        );
        const audit = auditEdit(
          [batch.file],
          changed,
          added.map((l) => "+" + l).join(String.fromCharCode(10)),
        );
        let verdict = "";
        if (audit.outOfScope.length) verdict = `out-of-scope edits: ${audit.outOfScope.join(", ")}`;
        else if (audit.suppressions.length) verdict = `added suppression: ${audit.suppressions[0]}`;
        else if (!changed.includes(batch.file)) verdict = `agent made no change: ${res.reason}`;
        if (!verdict) {
          const after = await recheck(root, tool, batch.file, members);
          const beforeFile = current.filter((f) => f.tool === tool && f.file === batch.file);
          const afterFile = after.filter((f) => f.file === batch.file);
          if (
            acceptFix(beforeFile, afterFile) ||
            (afterFile.length < beforeFile.length &&
              diffFindings(beforeFile, afterFile).added.length === 0)
          ) {
            agentFixed.push({
              file: batch.file,
              backend: backendName,
              fixed: beforeFile.length - afterFile.length,
            });
            current = [
              ...current.filter((f) => !(f.tool === tool && f.file === batch.file)),
              ...afterFile,
            ];
            say(`  kept ${batch.file}: ${beforeFile.length} -> ${afterFile.length}`);
            continue;
          }
          verdict = `no improvement (${beforeFile.length} -> ${afterFile.length}) or new findings`;
        }
        // revert everything the agent touched
        await restoreSnapshot(root, snap, changed.length ? changed : [batch.file]);
        unresolved.set(batch.file, { reason: verdict, findings: batch.findings });
        say(`  reverted ${batch.file}: ${verdict}`);
      }
      if (o.commit) {
        const n = agentFixed.length;
        const sha = await commitGroup(
          o,
          `agent-r${round}`,
          `fix: ${n} file(s) fixed by ${backendName} (lint/typecheck/clippy findings ${baseline.length} -> ${current.length})`,
          log,
        );
        if (sha) commits.push(sha);
      }
    }
    current = await runChecks(root, o.tools, members);
    if (o.push && o.commit && commits.length) {
      const bad = diffFindings(baseline, current).added;
      if (bad.length) say(`push skipped: ${bad.length} findings were introduced`);
      else {
        const r = await sh(
          "git pull -q --rebase origin main && git push -q origin HEAD:main && git rev-parse HEAD",
          root,
        );
        say(`push: exit ${r.code} ${r.code === 0 ? r.out.trim() : r.err.trim().slice(-200)}`);
      }
    }
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const report = {
    timestamp: stamp,
    root,
    startSha: sha0,
    endSha: (await git(root, "rev-parse HEAD")).out.trim(),
    reportOnly: o.reportOnly,
    tools: o.tools,
    before: { total: baseline.length, byTool: countByTool(baseline) },
    after: { total: current.length, byTool: countByTool(current) },
    mechanical,
    agent: { requested: o.agent, used: backendName, probes, calls: agentCalls, fixed: agentFixed },
    unresolved: [...unresolved.entries()].map(([file, v]) => ({
      file,
      reason: v.reason,
      findings: v.findings.length,
    })),
    remaining: current,
    commits,
    log,
  };
  const dir = join(root, "var/reports");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `fix-loop-${stamp}.json`), JSON.stringify(report, null, 2));
  writeFileSync(
    join(dir, `fix-loop-${stamp}.md`),
    [
      `# fix-loop ${stamp}`,
      `- before: ${JSON.stringify(report.before.byTool)} (${report.before.total})`,
      `- after: ${JSON.stringify(report.after.byTool)} (${report.after.total})`,
      `- mechanical: ${JSON.stringify(mechanical)}`,
      `- agent: ${backendName}, ${agentCalls} calls, ${agentFixed.length} files fixed`,
      `- unresolved: ${report.unresolved.map((u) => `${u.file} (${u.reason})`).join("; ") || "none"}`,
      `- commits: ${commits.join(", ") || "none"}`,
    ].join("\n"),
  );
  say(`report: var/reports/fix-loop-${stamp}.json`);
  say(`after: ${JSON.stringify(report.after.byTool)} total=${current.length}`);
  return current.length === 0 ? 0 : 1;
}

if (import.meta.main) process.exit(await main(process.argv.slice(2)));
