// SPDX-License-Identifier: Apache-2.0
/** Explicit CPU-only native integration; fails when its host artifacts are not qualified. */
import { expect, test } from "bun:test";
import { openAphrodyPython } from "../../src/runtime/python";

test("real fork aliases and the complete lazy Aphrody SDK share the Shenron Bun PID", async () => {
  const source = process.env.SHENRON_APHRODY_PYTHON_SOURCE;
  if (!source) throw new Error("Set the selected qualified SHENRON_APHRODY_PYTHON_SOURCE");
  const builtin = "bun:python";
  const buv = "buv:python";
  const pyjs = "pyjs:python";
  const [python, b, p] = await Promise.all([import(builtin), import(buv), import(pyjs)]);
  expect(b.Python).toBe(python.Python);
  expect(p.Python).toBe(python.Python);
  await using sdk = await openAphrodyPython({ sourceRoots: [source] });
  expect(sdk.info()).toMatchObject({ pid: process.pid, nativeInProcess: true });
  expect(await sdk.read("aphrody", "__version__")).toBe("0.1.0");
  const exports = await sdk.exports();
  expect(exports).toContain("AphrodyClient");
  expect(exports).toContain("DoclingExtractor");
  const result = await sdk.invoke("aphrody.command_guard", "normalize_command", ["café🐍\u0000"]);
  expect(result).toBe("café🐍");
  await using guard = await sdk.construct("aphrody", "CommandGuard");
  // Construction exercises a real SDK class without command execution or provider import.
  expect(guard).toBeDefined();
  expect(await guard.call("verify_command", ["bun --version"])).toEqual([true, ""]);
  const pytsFile = `${import.meta.dir}/fixtures/native-sdk.pyts`;
  const pytsModule = await import(pytsFile);
  expect(await pytsModule.normalize(source)).toEqual({ pid: process.pid, value: "PyJS café🐍" });
}, 30000);
