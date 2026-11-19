// SPDX-License-Identifier: Apache-2.0
import { expect, test } from "bun:test";
import { firstRevision, parseService, probeCommand, resolveHost } from "./active-release.ts";

const SCRIPT = `${import.meta.dir}/active-release.ts`;
const REVISION = "0123456789abcdef0123456789abcdef01234567";

async function run(argument: string[], env: Record<string, string>) {
  const child = Bun.spawn(["bun", SCRIPT, ...argument], {
    env: { ...process.env, SHENRON_DEPLOY_TARGET: "local", ...env },
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  return { stdout, stderr, code };
}

test("service defaults to site and rejects anything but site or bot", () => {
  expect(parseService(undefined)).toBe("site");
  expect(parseService("")).toBe("site");
  expect(parseService("bot")).toBe("bot");
  expect(parseService("redis")).toBeUndefined();
});

test("host aliases follow the SHENRON_*_HOST overrides", () => {
  expect(resolveHost("bunos", {})).toBe("cdn");
  expect(resolveHost("vps", { SHENRON_VPS_HOST: "v1" })).toBe("v1");
  expect(resolveHost("prod", { SHENRON_PROD_HOST: "p1" })).toBe("p1");
  expect(resolveHost("fr2", {})).toBe("fr2");
});

test("probe reads the container tag, then the per-service and shared .env tags", () => {
  const probe = probeCommand("bot");
  expect(probe).toContain("shenron-bot");
  expect(probe).toContain("s/^SHENRON_BOT_TAG=//p; s/^SHENRON_IMAGE_TAG=//p");
  expect(probe).toContain("${SHENRON_ROOT:-$(docker inspect");
});

test("only a line that is exactly a 40-hex commit counts", () => {
  expect(firstRevision(`latest\n${REVISION}0\n${REVISION}\n${"f".repeat(40)}\n`)).toBe(REVISION);
  expect(firstRevision("latest\n")).toBe("");
});

test("prints the first revision of the probe output and exits 0", async () => {
  const result = await run([], {
    SHENRON_ACTIVE_COMMAND: `printf 'tag\\n${REVISION}\\n${"a".repeat(40)}\\n'`,
  });
  expect(result).toEqual({ stdout: `${REVISION}\n`, stderr: "", code: 0 });
});

test("prints nothing and exits 0 when no revision is found or the probe fails", async () => {
  const none = await run(["bot"], { SHENRON_ACTIVE_COMMAND: "echo latest" });
  expect(none).toEqual({ stdout: "", stderr: "", code: 0 });
  const failing = await run([], { SHENRON_ACTIVE_COMMAND: "exit 7" });
  expect(failing).toEqual({ stdout: "", stderr: "", code: 0 });
  const empty = await run([], { SHENRON_ACTIVE_COMMAND: "" });
  expect(empty).toEqual({ stdout: "", stderr: "", code: 0 });
});

test("an unknown service exits 64 with a message on stderr", async () => {
  const result = await run(["redis"], { SHENRON_ACTIVE_COMMAND: "echo unused" });
  expect(result).toEqual({ stdout: "", stderr: "unknown service: redis\n", code: 64 });
});
