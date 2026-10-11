// SPDX-License-Identifier: Apache-2.0
import { afterAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { LEXIQUE_FILE, planBackend, siblingBinary, VFS_FILE } from "../src/backend";
import { executableDir } from "../src/config";
import { testPaths } from "./support";

const root = mkdtempSync(join(tmpdir(), "shenron-backend-"));
afterAll(() => rmSync(root, { recursive: true, force: true }));

let counter = 0;
function setup() {
  const dir = join(root, `case-${++counter}`);
  return { dir, paths: testPaths(dir), payloadDir: join(dir, "payload") };
}

function touch(path: string, text = "x"): string {
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(path, text);
  return path;
}

const exe = (name: string) => (process.platform === "win32" ? `${name}.exe` : name);

describe("planBackend", () => {
  test("VFS: explicit, then SHENRON_HOME data, then the payload, then beside the executable", () => {
    const { dir, paths, payloadDir } = setup();
    const beside = touch(join(paths.exeDir, "vfs", VFS_FILE));
    expect(planBackend(paths, {}, { payloadDir }).env.SHENRON_VFS_DB).toBe(beside);
    const payload = touch(join(payloadDir, "vfs", VFS_FILE));
    expect(planBackend(paths, {}, { payloadDir }).env.SHENRON_VFS_DB).toBe(payload);
    const home = touch(join(paths.data, VFS_FILE));
    expect(planBackend(paths, {}, { payloadDir }).env.SHENRON_VFS_DB).toBe(home);
    const explicit = touch(join(dir, "other.sqlite"));
    expect(
      planBackend(paths, { SHENRON_VFS_DB: ` ${explicit} ` }, { payloadDir }).env.SHENRON_VFS_DB,
    ).toBe(explicit);
    // A missing explicit file falls back to the next candidate.
    expect(
      planBackend(paths, { SHENRON_VFS_DB: join(dir, "absent.sqlite") }, { payloadDir }).env
        .SHENRON_VFS_DB,
    ).toBe(home);
  });

  test("editor engine beside the executable, never in production; lexicon of the payload", () => {
    const { dir, paths, payloadDir } = setup();
    expect(planBackend(paths, {}).koharuSdk).toBe(null);
    const sdk = touch(join(paths.exeDir, "binaries", exe("koharu-sdk")));
    expect(planBackend(paths, {}).koharuSdk).toBe(sdk);
    const explicit = touch(join(dir, "sdk"));
    expect(planBackend(paths, { SHENRON_KOHARU_SDK_BIN: explicit }).koharuSdk).toBe(explicit);
    expect(planBackend(paths, { SHENRON_PROFILE: "production" }).koharuSdk).toBe(null);

    expect("SHENRON_LEXIQUE" in planBackend(paths, {}, { payloadDir }).env).toBe(false);
    const lexique = touch(join(payloadDir, "data", LEXIQUE_FILE), "[]");
    expect(planBackend(paths, {}, { payloadDir }).env.SHENRON_LEXIQUE).toBe(lexique);
    expect(
      planBackend(paths, { SHENRON_LEXIQUE: "/own.json" }, { payloadDir }).env.SHENRON_LEXIQUE,
    ).toBe("/own.json");
  });

  test("no VFS anywhere: the variable is dropped", () => {
    const { paths } = setup();
    const plan = planBackend(paths, { SHENRON_VFS_DB: "/nowhere/x.sqlite" });
    expect("SHENRON_VFS_DB" in plan.env).toBe(false);
  });

  test("data and CDN cache live under SHENRON_HOME; the process environment is not mutated", () => {
    const { paths } = setup();
    const env = { SHENRON_PROFILE: "desktop" };
    const plan = planBackend(paths, env);
    expect(plan.env.SHENRON_DATA_DIR).toBe(paths.data);
    expect(plan.env.SHENRON_VFS_CACHE).toBe(join(paths.cache, "vfs"));
    expect(plan.env.SHENRON_CHAT_BACKENDS).toBe("local,gemini-web");
    expect(plan.wiki).toBe(true);
    expect(env).toEqual({ SHENRON_PROFILE: "desktop" });
  });

  test("agent home template of the payload, outside production and without APHRODY_WORKSPACE", () => {
    const { paths, payloadDir } = setup();
    touch(join(payloadDir, "home", "SOUL.md"));
    const desktop = planBackend(paths, { SHENRON_PROFILE: "desktop" }, { payloadDir });
    expect(desktop.env.APHRODY_WORKSPACE).toBe(join(payloadDir, "home"));
    const explicit = planBackend(
      paths,
      { SHENRON_PROFILE: "desktop", APHRODY_WORKSPACE: "/srv/dbfr" },
      { payloadDir },
    );
    expect(explicit.env.APHRODY_WORKSPACE).toBe("/srv/dbfr");
    const production = planBackend(paths, { SHENRON_PROFILE: "production" }, { payloadDir });
    expect(production.env.APHRODY_WORKSPACE).toBeUndefined();
  });

  test("production: public VFS nodes only, no loopback owner, wiki on the site, chat order kept", () => {
    const { paths } = setup();
    const plan = planBackend(paths, { DATABASE_URL: "postgres://u@h/db" });
    expect(plan.env.SHENRON_VFS_PUBLIC_ONLY).toBe("1");
    expect(plan.env.SHENRON_LOCAL_OWNER).toBe("");
    expect(plan.env.SHENRON_CHAT_BACKENDS).toBeUndefined();
    expect(plan.wiki).toBe(false);
  });

  test("aphrody and shenron-mcp shipped beside the executable", () => {
    const { paths } = setup();
    expect(planBackend(paths, {}).env.APHRODY_BIN).toBeUndefined();
    const aphrody = touch(join(paths.exeDir, exe("aphrody")));
    const mcp = touch(join(paths.exeDir, "binaries", exe("shenron-mcp")));
    const plan = planBackend(paths, {});
    expect(plan.env.APHRODY_BIN).toBe(aphrody);
    expect(plan.env.SHENRON_MCP_BIN).toBe(mcp);
    expect(plan.mcpSidecar).toBe(mcp);
    expect(planBackend(paths, { APHRODY_BIN: "/opt/aphrody" }).env.APHRODY_BIN).toBe(
      "/opt/aphrody",
    );
  });
});

describe("executableDir", () => {
  test("uses the native desktop's absolute sidecar path over Bun's virtual compiled path", () => {
    const { dir } = setup();
    const binary = join(dir, "binaries", exe("shenron-server"));
    expect(executableDir({ SHENRON_SERVER_BIN: binary })).toBe(join(dir, "binaries"));
  });
});

describe("siblingBinary", () => {
  test("explicit file, then ./name, then ./binaries/name; directories are ignored", () => {
    const { dir, paths } = setup();
    expect(siblingBinary(paths, "tool")).toBeNull();
    mkdirSync(join(paths.exeDir, exe("tool")));
    const nested = touch(join(paths.exeDir, "binaries", exe("tool")));
    expect(siblingBinary(paths, "tool")).toBe(nested);
    const explicit = touch(join(dir, "explicit-tool"));
    expect(siblingBinary(paths, "tool", explicit)).toBe(explicit);
  });
});
