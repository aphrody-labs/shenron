// SPDX-License-Identifier: Apache-2.0
import { describe, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  aotBun,
  aotRequested,
  bytecodeOrderFiles,
  chooseCompileMode,
  compileModeFlags,
  compileTuning,
  foreignRuntime,
  helpMentionsAot,
  helpMentionsFlag,
  hostTarget,
  shippedLocales,
  trimRequested,
  type BuildFlagSupport,
} from "./compile-mode";

describe("compile mode", () => {
  test("a native target compiles ahead of time", () => {
    expect(chooseCompileMode({ target: "linux-x64", aot: true, host: "linux-x64" })).toEqual({
      mode: "aot",
    });
    expect(chooseCompileMode({ target: "windows-x64", aot: true, host: "windows-x64" }).mode).toBe(
      "aot",
    );
  });

  test("--aot cannot cross-compile: a foreign target keeps the bytecode bundle", () => {
    expect(chooseCompileMode({ target: "linux-x64", aot: true, host: "windows-x64" })).toEqual({
      mode: "bytecode",
      reason: "--aot cannot cross-compile to linux-x64",
    });
    expect(chooseCompileMode({ target: "linux-x64-musl", aot: true, host: "linux-x64" }).mode).toBe(
      "bytecode",
    );
  });

  test("AOT disabled falls back to bytecode", () => {
    expect(chooseCompileMode({ target: "linux-x64", aot: false, host: "linux-x64" })).toEqual({
      mode: "bytecode",
      reason: "aot disabled",
    });
  });

  test("another embedded runtime gets neither AOT nor a bytecode cache it cannot read", () => {
    expect(
      chooseCompileMode({
        target: "linux-x64",
        aot: true,
        host: "linux-x64",
        compileBun: "/opt/other/bun",
        execPath: "/usr/bin/bun",
      }).mode,
    ).toBe("bundle");
  });

  test("SHENRON_COMPILE_BUN naming the running Bun is not foreign", () => {
    expect(foreignRuntime(process.execPath)).toBe(false);
    expect(foreignRuntime(undefined)).toBe(false);
    expect(foreignRuntime("  ")).toBe(false);
  });

  test("flags of each mode", () => {
    expect(compileModeFlags("aot")).toEqual(["--aot"]);
    expect(compileModeFlags("aot", { codeFromDisk: true })).toEqual([
      "--aot",
      "--aot-allow-code-from-disk",
    ]);
    expect(compileModeFlags("bytecode")).toEqual(["--bytecode", "--format=esm"]);
    expect(compileModeFlags("bundle")).toEqual([]);
  });

  test("--no-aot and SHENRON_AOT=0 turn AOT off", () => {
    expect(aotRequested([], {})).toBe(true);
    expect(aotRequested(["--no-aot"], {})).toBe(false);
    expect(aotRequested([], { SHENRON_AOT: "0" })).toBe(false);
  });

  test("host targets", () => {
    expect(hostTarget("win32", "x64")).toBe("windows-x64");
    expect(hostTarget("linux", "x64")).toBe("linux-x64");
    expect(hostTarget("linux", "arm64")).toBeNull();
    expect(hostTarget("darwin", "x64")).toBeNull();
  });
});

describe("aotBun", () => {
  test("only an AOT compile uses SHENRON_AOT_BUN", () => {
    const env = { SHENRON_AOT_BUN: "/opt/bun-aot/bin/bun" };
    expect(aotBun("aot", env, "/usr/bin/bun")).toBe("/opt/bun-aot/bin/bun");
    expect(aotBun("bytecode", env, "/usr/bin/bun")).toBe("/usr/bin/bun");
    expect(aotBun("aot", {}, "/usr/bin/bun")).toBe("/usr/bin/bun");
    expect(aotBun("aot", { SHENRON_AOT_BUN: "  " }, "/usr/bin/bun")).toBe("/usr/bin/bun");
  });
});

describe("helpMentionsAot", () => {
  test("reads the --aot flag from the build help", () => {
    expect(helpMentionsAot("      --aot                Compile JavaScript to machine code\n")).toBe(
      true,
    );
    expect(helpMentionsAot("      --bytecode           Use a bytecode cache\n")).toBe(false);
    expect(helpMentionsAot("      --aot-allow-code-from-disk   With --aot: let import()\n")).toBe(
      false,
    );
  });
});

const HELP = `
      --bytecode-order=<val>   With --compile --bytecode: lay the bytecode out by order file(s)
      --aot                    Compile JavaScript and TypeScript to machine code at build time
      --trim                   Remove the Bun and Node.js APIs your code never calls
      --trim-locales=<val>     Keep only these locales, such as en,de-AT. Implies --trim
      --aot-allow-code-from-disk   With --aot: let import() load code from disk
`;

describe("helpMentionsFlag", () => {
  test("--trim is not --trim-locales, and the reverse", () => {
    expect(helpMentionsFlag(HELP, "trim")).toBe(true);
    expect(helpMentionsFlag(HELP, "trim-locales")).toBe(true);
    expect(helpMentionsFlag("      --trim-locales=<val>   Keep only these locales\n", "trim")).toBe(
      false,
    );
    expect(helpMentionsFlag("      --trim   Remove the APIs\n", "trim-locales")).toBe(false);
  });

  test("--bytecode-order is not --bytecode", () => {
    expect(helpMentionsFlag(HELP, "bytecode-order")).toBe(true);
    expect(helpMentionsFlag("      --bytecode   Use a bytecode cache\n", "bytecode-order")).toBe(
      false,
    );
    expect(helpMentionsFlag("      --bytecode-depth=<val>   Levels\n", "bytecode-order")).toBe(
      false,
    );
  });

  test("a stable Bun help without the canary flags lists none of them", () => {
    const stable =
      "      --bytecode-order=<val>   lay out\n      --compile-jit-policy=<val>   JIT\n";
    expect(helpMentionsFlag(stable, "bytecode-order")).toBe(true);
    expect(helpMentionsFlag(stable, "trim")).toBe(false);
    expect(helpMentionsAot(stable)).toBe(false);
  });
});

describe("shippedLocales", () => {
  test("the bot ships its dictionaries, the server the site locales as well", () => {
    expect(shippedLocales("bot")).toEqual(["en", "fr", "ja"]);
    expect(shippedLocales("server")).toEqual(["en", "fr", "ja"]);
  });

  test("a locale added to the bot dictionaries is shipped", () => {
    const root = mkdtempSync(join(tmpdir(), "locales-"));
    try {
      mkdirSync(join(root, "apps/bot/src/locales"), { recursive: true });
      for (const name of ["fr.json", "de.json", "README.md"])
        writeFileSync(join(root, "apps/bot/src/locales", name), "{}");
      expect(shippedLocales("bot", root)).toEqual(["de", "fr"]);
      expect(shippedLocales("server", root)).toEqual(["de", "en", "fr", "ja"]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("trimRequested", () => {
  test("opt-in, with the former name still honoured", () => {
    expect(trimRequested({})).toBe(false);
    expect(trimRequested({ SHENRON_TRIM: "1" })).toBe(true);
    expect(trimRequested({ SHENRON_AOT_TRIM: "1" })).toBe(true);
    expect(trimRequested({ SHENRON_TRIM: "0" })).toBe(false);
  });
});

describe("bytecodeOrderFiles", () => {
  test("only an existing file is used, resolved from the root", () => {
    const root = mkdtempSync(join(tmpdir(), "order-"));
    try {
      writeFileSync(join(root, "bot.order"), "a\n");
      const env = { SHENRON_BOT_BYTECODE_ORDER: "bot.order, gone.order" };
      expect(bytecodeOrderFiles("bot", env, root)).toEqual({
        found: [join(root, "bot.order")],
        missing: [join(root, "gone.order")],
      });
      expect(bytecodeOrderFiles("server", env, root)).toEqual({ found: [], missing: [] });
      expect(bytecodeOrderFiles("bot", {}, root)).toEqual({ found: [], missing: [] });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("compileTuning", () => {
  const all: BuildFlagSupport = { aot: true, trim: true, trimLocales: true, bytecodeOrder: true };
  const none: BuildFlagSupport = {
    aot: false,
    trim: false,
    trimLocales: false,
    bytecodeOrder: false,
  };
  const base = { bun: "bun", locales: ["en", "fr", "ja"] } as const;

  test("nothing is added unless asked for", () => {
    expect(compileTuning({ ...base, product: "bot", mode: "aot", support: all, env: {} })).toEqual({
      flags: [],
      notes: [],
    });
  });

  test("--trim and --trim-locales from the shipped locales, in every mode", () => {
    const env = { SHENRON_TRIM: "1" };
    for (const mode of ["aot", "bytecode", "bundle"] as const)
      expect(compileTuning({ ...base, product: "bot", mode, support: all, env }).flags).toEqual([
        "--trim",
        "--trim-locales=en,fr,ja",
      ]);
  });

  test("a Bun without --trim-locales keeps --trim alone", () => {
    const env = { SHENRON_TRIM: "1" };
    const support = { ...all, trimLocales: false };
    expect(
      compileTuning({ ...base, product: "bot", mode: "bytecode", support, env }).flags,
    ).toEqual(["--trim"]);
  });

  test("a Bun without --trim says so and adds nothing", () => {
    const result = compileTuning({
      ...base,
      product: "bot",
      mode: "bytecode",
      support: none,
      env: { SHENRON_TRIM: "1" },
    });
    expect(result.flags).toEqual([]);
    expect(result.notes).toEqual(["trim skipped: bun has no --trim"]);
  });

  test("another embedded runtime gets neither trim nor a bytecode order", () => {
    const root = mkdtempSync(join(tmpdir(), "foreign-"));
    try {
      writeFileSync(join(root, "s.order"), "a\n");
      const result = compileTuning({
        ...base,
        product: "server",
        mode: "bytecode",
        support: all,
        compileBun: join(root, "other-bun"),
        root,
        env: { SHENRON_TRIM: "1", SHENRON_SERVER_BYTECODE_ORDER: "s.order" },
      });
      expect(result.flags).toEqual([]);
      expect(result.notes).toHaveLength(2);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("--bytecode-order only for a bytecode compile with an existing file", () => {
    const root = mkdtempSync(join(tmpdir(), "tuning-"));
    try {
      writeFileSync(join(root, "s.order"), "a\n");
      const env = { SHENRON_SERVER_BYTECODE_ORDER: "s.order" };
      const request = { ...base, product: "server", root, env } as const;
      expect(compileTuning({ ...request, mode: "bytecode", support: all }).flags).toEqual([
        `--bytecode-order=${join(root, "s.order")}`,
      ]);
      expect(compileTuning({ ...request, mode: "aot", support: all }).flags).toEqual([]);
      expect(compileTuning({ ...request, mode: "bundle", support: all }).flags).toEqual([]);
      expect(compileTuning({ ...request, mode: "bytecode", support: none }).notes).toEqual([
        "bytecode order skipped: bun has no --bytecode-order",
      ]);
      const missing = compileTuning({
        ...base,
        product: "server",
        mode: "bytecode",
        support: all,
        root,
        env: { SHENRON_SERVER_BYTECODE_ORDER: "absent.order" },
      });
      expect(missing.flags).toEqual([]);
      expect(missing.notes).toEqual([
        `bytecode order skipped: ${join(root, "absent.order")} does not exist`,
      ]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("the flags do not depend on the target: cross-compile and Windows compile alike", () => {
    const env = { SHENRON_TRIM: "1" };
    const native = compileTuning({ ...base, product: "bot", mode: "bytecode", support: all, env });
    expect(native.flags).toEqual(["--trim", "--trim-locales=en,fr,ja"]);
    expect(chooseCompileMode({ target: "windows-x64", aot: true, host: "linux-x64" }).mode).toBe(
      "bytecode",
    );
  });
});
