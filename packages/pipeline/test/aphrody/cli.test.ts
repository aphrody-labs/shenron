// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "bun:test";
import {
  aphrodyDoctor,
  aphrodyGitInspect,
  runAphrodyCommand,
} from "../../src/aphrody/native-commands";
import { nativeFixture } from "./native-fixture";

const nativeExecutor = nativeFixture(
  "commands",
  `
const [cmd,...rest]=process.argv.slice(2);
if(cmd==="doctor") console.log(JSON.stringify({verdict:"OK",args:rest}));
else if(cmd==="git") console.log(JSON.stringify({head:"abc123",repo:rest[1]}));
else if(cmd==="fail") {console.error("boom");process.exit(3);}
else if(cmd==="sleep") await Bun.sleep(20_000);
else if(cmd==="text") console.log("not json at all");
`,
);

describe("native Aphrody command adapter", () => {
  it("preserves doctor and Git contracts through the native port", async () => {
    const doctor = await aphrodyDoctor({ nativeExecutor });
    if (doctor.kind !== "exit" || !doctor.ok) throw new Error("expected native success");
    expect(doctor.data).toEqual({ verdict: "OK", args: ["--json"] });
    const git = await aphrodyGitInspect("some-repo", { nativeExecutor });
    if (git.kind !== "exit" || !git.ok) throw new Error("expected native success");
    expect(git.data).toEqual({ head: "abc123", repo: "some-repo" });
  });
  it("classifies native failures, deadlines and invalid output", async () => {
    expect(await runAphrodyCommand(["fail"], { nativeExecutor, json: true })).toMatchObject({
      kind: "exit",
      ok: false,
      code: 3,
      stderr: "boom\n",
    });
    expect(await runAphrodyCommand(["sleep"], { nativeExecutor, timeoutMs: 300 })).toMatchObject({
      kind: "timeout",
      timeoutMs: 300,
    });
    expect(await runAphrodyCommand(["text"], { nativeExecutor, json: true })).toMatchObject({
      kind: "invalid_json",
      stdout: "not json at all\n",
    });
  });
  it("rejects cancellation and invalid budgets before executing", async () => {
    let called = false;
    const owner = async () => {
      called = true;
      return { code: 0, stdout: "{}", stderr: "" };
    };
    const controller = new AbortController();
    controller.abort(new Error("caller cancelled"));
    await expect(
      runAphrodyCommand(["doctor"], { nativeExecutor: owner, signal: controller.signal }),
    ).rejects.toThrow("caller cancelled");
    await expect(
      runAphrodyCommand(["doctor"], { nativeExecutor: owner, timeoutMs: 0 }),
    ).rejects.toThrow("uint32");
    expect(called).toBe(false);
  });
  it("never restores a process fallback for a retired binary override", async () => {
    expect(
      await runAphrodyCommand(["doctor"], { bin: "/missing/aphrody", nativeExecutor }),
    ).toMatchObject({ kind: "not_found", message: expect.stringContaining("retired") });
  });
});
