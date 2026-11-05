// SPDX-License-Identifier: Apache-2.0
import { describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  acceptFix,
  addedLines,
  changedSince,
  restoreSnapshot,
  worktreeSnapshot,
  agentPrompt,
  auditEdit,
  countByTool,
  dedupe,
  diffFindings,
  parseClippyJson,
  parseOxfmtList,
  parseOxlintJson,
  parseRustfmt,
  parseTsc,
  planRound,
  sh,
  type Finding,
} from "./fix-loop";

const f = (over: Partial<Finding>): Finding => ({
  tool: "oxlint",
  file: "a.ts",
  line: 1,
  col: 1,
  code: "x/y",
  message: "m",
  severity: "warning",
  ...over,
});

describe("parsers", () => {
  test("oxlint json", () => {
    const text = `{ "diagnostics": [{"message": "Use toSorted","code": "unicorn(no-array-sort)","severity": "warning","help": "mutates","filename": "scripts/a.ts","labels": [{"span": {"offset": 5,"length": 4,"line": 7,"column": 76}}]},
{"message": "shadow","code": "eslint(no-shadow)","severity": "error","filename": "b.ts","labels": []}] }`;
    const out = parseOxlintJson(text);
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({
      tool: "oxlint",
      file: "scripts/a.ts",
      line: 7,
      col: 76,
      code: "unicorn/no-array-sort",
      severity: "warning",
      help: "mutates",
    });
    expect(out[1]).toMatchObject({ code: "eslint/no-shadow", severity: "error", line: 0 });
    expect(parseOxlintJson("garbage")).toEqual([]);
  });

  test("tsc both dialects, with workspace prefix", () => {
    const text = [
      "src/zz.ts(1,14): error TS2322: Type 'string' is not assignable to type 'number'.",
      "lib/q.ts:4:9 - error TS2339: Property 'nope' does not exist.",
      "Found 2 errors in 2 files, checked 195 files [820.29ms]",
    ].join("\n");
    const out = parseTsc(text, "packages/api");
    expect(out.map((x) => [x.file, x.line, x.col, x.code])).toEqual([
      ["packages/api/src/zz.ts", 1, 14, "TS2322"],
      ["packages/api/lib/q.ts", 4, 9, "TS2339"],
    ]);
  });

  test("oxfmt list ignores summary lines", () => {
    const text =
      "Checking formatting...\n\nscripts/dev/i18n-parity-check.ts (0ms)\napps/x/y.tsx (12ms)\n\nFormat issues found in above 2 files.\nFinished in 196ms on 4031 files using 12 threads.";
    expect(parseOxfmtList(text).map((x) => x.file)).toEqual([
      "scripts/dev/i18n-parity-check.ts",
      "apps/x/y.tsx",
    ]);
  });

  test("rustfmt diff, relative to root", () => {
    const text =
      "Diff in /repo/crates/a/src/lib.rs:12:\n fn x() {}\nDiff in /repo/crates/a/src/lib.rs:40:\n-a\n+b\nDiff in src/old.rs at line 3:";
    const out = parseRustfmt(text, "/repo");
    expect(out.map((x) => [x.file, x.line])).toEqual([
      ["crates/a/src/lib.rs", 12],
      ["crates/a/src/lib.rs", 40],
      ["src/old.rs", 3],
    ]);
  });

  test("clippy json keeps primary spans and drops summaries", () => {
    const lines = [
      JSON.stringify({ reason: "compiler-artifact" }),
      JSON.stringify({
        reason: "compiler-message",
        message: {
          level: "error",
          message: "needless borrow",
          code: { code: "clippy::needless_borrow" },
          spans: [
            {
              file_name: "/repo/crates/a/src/lib.rs",
              line_start: 9,
              column_start: 5,
              is_primary: true,
            },
          ],
          children: [{ level: "help", message: "remove &" }],
        },
      }),
      JSON.stringify({
        reason: "compiler-message",
        message: {
          level: "error",
          message: "aborting due to 1 previous error",
          code: null,
          spans: [],
        },
      }),
      "not json",
    ].join("\n");
    const out = parseClippyJson(lines, "/repo");
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      tool: "clippy",
      file: "crates/a/src/lib.rs",
      line: 9,
      code: "clippy::needless_borrow",
      help: "remove &",
    });
  });
});

describe("planner", () => {
  const findings = [
    f({ tool: "oxfmt", file: "fmt.ts", code: "format" }),
    f({ file: "a.ts", code: "r1" }),
    f({ file: "a.ts", code: "r2" }),
    f({ file: "b.ts", code: "r3" }),
    f({ tool: "tsc", file: "c.ts", code: "TS1" }),
    f({ tool: "rustfmt", file: "d.rs", code: "fmt" }),
    f({ tool: "clippy", file: "e.rs", code: "clippy::x" }),
  ];

  test("formatters stay mechanical, agent batches ordered by size", () => {
    const p = planRound(findings, { unresolved: new Set(), budget: 10 });
    expect(p.mechanical.oxfmt).toEqual(["fmt.ts"]);
    expect(p.mechanical.rustfmt).toEqual(["d.rs"]);
    expect(p.mechanical.clippyFix).toBe(true);
    expect(p.agent.map((b) => b.file)).toEqual(["a.ts", "b.ts", "c.ts", "e.rs"]);
    expect(p.agent[0]!.findings).toHaveLength(2);
  });

  test("budget, unresolved and skip are honored", () => {
    const p = planRound(findings, {
      unresolved: new Set(["a.ts"]),
      budget: 2,
      skip: (x) => x === "c.ts",
    });
    expect(p.agent.map((b) => b.file)).toEqual(["b.ts", "e.rs"]);
    expect(planRound(findings, { unresolved: new Set(), budget: 0 }).agent).toEqual([]);
  });

  test("acceptFix needs fewer findings and nothing new", () => {
    const before = [f({ code: "r1" }), f({ code: "r2" })];
    expect(acceptFix(before, [f({ code: "r2", line: 99 })])).toBe(true);
    expect(acceptFix(before, before)).toBe(false);
    expect(acceptFix(before, [f({ code: "r2" }), f({ code: "NEW" })].slice(0, 1).concat([]))).toBe(
      true,
    );
    expect(acceptFix(before, [f({ code: "NEW" })])).toBe(false);
  });

  test("diffFindings counts duplicates as a multiset", () => {
    const d = diffFindings([f({}), f({})], [f({}), f({ code: "z" })]);
    expect(d.added).toHaveLength(1);
    expect(d.fixed).toBe(1);
    expect(countByTool(findings)).toMatchObject({ oxlint: 3, oxfmt: 1, tsc: 1 });
  });
});

describe("edit audit", () => {
  test("flags other files and added suppressions", () => {
    const diff =
      "--- a/a.ts\n+++ b/a.ts\n@@ -1 +1,2 @@\n-let x\n+// oxlint-disable-next-line no-shadow\n+let y";
    const r = auditEdit(["a.ts"], ["a.ts", "package.json"], diff);
    expect(r.outOfScope).toEqual(["package.json"]);
    expect(r.suppressions).toEqual(["// oxlint-disable-next-line no-shadow"]);
    expect(auditEdit(["a.ts"], ["a.ts"], "+let y").outOfScope).toEqual([]);
  });

  test("works against a real temp git repo", async () => {
    const dir = mkdtempSync(join(tmpdir(), "fix-loop-"));
    writeFileSync(join(dir, "a.ts"), "let a = 1;\n");
    writeFileSync(join(dir, "b.ts"), "let b = 1;\n");
    await sh("git init -q && git add -A && git -c user.email=t@t -c user.name=t commit -qm i", dir);
    writeFileSync(join(dir, "a.ts"), "let a = 2; // @ts-ignore\n");
    writeFileSync(join(dir, "b.ts"), "let b = 2;\n");
    const changed = (await sh("git diff --name-only", dir)).out.split("\n").filter(Boolean);
    const diff = (await sh("git diff -U0 -- a.ts", dir)).out;
    const r = auditEdit(["a.ts"], changed, diff);
    expect(r.outOfScope).toEqual(["b.ts"]);
    expect(r.suppressions).toHaveLength(1);
    await sh("git checkout -- a.ts b.ts", dir);
    expect((await sh("git status --porcelain", dir)).out).toBe("");
  });

  test("prompt carries findings, rule text and the source", () => {
    const p = agentPrompt(
      { file: "a.ts", findings: [f({ line: 3, col: 2, help: "use toSorted" })] },
      "const x = 1;",
    );
    expect(p).toContain("line 3:2 [oxlint x/y] m (rule text: use toSorted)");
    expect(p).toContain("const x = 1;");
    expect(p).toContain("never add suppression comments");
  });
});

describe("dedupe", () => {
  test("drops the same finding reported by several workspaces", () => {
    const a = f({ tool: "tsc", file: "apps/site/x.ts", line: 4, col: 2, code: "TS1" });
    expect(dedupe([a, { ...a }, { ...a, line: 5 }])).toHaveLength(2);
  });
});

describe("snapshot and added lines", () => {
  test("addedLines is a multiset difference", () => {
    expect(addedLines("a\nb\nb", "a\nb\nc\nb\nb")).toEqual(["c", "b"]);
  });

  test("restore keeps earlier uncommitted work and reverts only agent edits", async () => {
    const dir = mkdtempSync(join(tmpdir(), "fix-loop-snap-"));
    writeFileSync(join(dir, "a.ts"), "let a = 1;\n");
    writeFileSync(join(dir, "b.ts"), "let b = 1;\n");
    await sh("git init -q && git add -A && git -c user.email=t@t -c user.name=t commit -qm i", dir);
    writeFileSync(join(dir, "a.ts"), "let a = 2; // mechanical\n");
    const snap = await worktreeSnapshot(dir);
    expect([...snap.keys()]).toEqual(["a.ts"]);
    writeFileSync(join(dir, "a.ts"), "let a = 3;\n");
    writeFileSync(join(dir, "b.ts"), "let b = 9;\n");
    writeFileSync(join(dir, "new.ts"), "x\n");
    expect((await changedSince(dir, snap)).toSorted()).toEqual(["a.ts", "b.ts", "new.ts"]);
    await restoreSnapshot(dir, snap, ["a.ts", "b.ts", "new.ts"]);
    expect(readFileSync(join(dir, "a.ts"), "utf8")).toBe("let a = 2; // mechanical\n");
    expect(readFileSync(join(dir, "b.ts"), "utf8")).toBe("let b = 1;\n");
    expect(existsSync(join(dir, "new.ts"))).toBe(false);
  });
});
