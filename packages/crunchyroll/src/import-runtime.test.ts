// SPDX-License-Identifier: Apache-2.0
import { afterEach, describe, expect, test } from "bun:test";
import { rmSync } from "node:fs";
import { join, resolve } from "node:path";

const roots: string[] = [];
const childCode = `
  import { configureImportedRuntime } from "./packages/crunchyroll/src/import-runtime";
  import { CrunchyrollClient } from "./packages/crunchyroll/src/client";
  for (const key of ["CRUNCHYROLL_COOKIES_FILE", "CRUNCHYROLL_TOKEN_FILE", "CRUNCHYROLL_BACKEND_ARCHIVE", "CRUNCHYROLL_IMPORT_FILE", "CRUNCHYROLL_BROWSER_PROFILE", "BUN_VIDEO_CRUNCHYROLL_ACCESS_TOKEN", "CRUNCHYROLL_BEARER_TOKEN", "BUN_VIDEO_CRUNCHYROLL_ACCOUNT_ID"]) delete process.env[key];
  try {
    await configureImportedRuntime(Bun.argv[1]);
    const client = new CrunchyrollClient();
    console.log(JSON.stringify({
      configured: true,
      cookiesFile: process.env.CRUNCHYROLL_COOKIES_FILE,
      importFile: process.env.CRUNCHYROLL_IMPORT_FILE,
      backendFile: process.env.CRUNCHYROLL_BACKEND_ARCHIVE,
      profile: process.env.CRUNCHYROLL_BROWSER_PROFILE,
      sessionFile: process.env.CRUNCHYROLL_TOKEN_FILE ?? null,
      hasCookies: client.hasCookies(),
      hasToken: !!client.getBearerToken(),
      usesImportedToken: client.getBearerToken() === "fake-import-token",
      usesLiveToken: client.getBearerToken() === "fake-live-token"
    }));
  } catch (error) {
    console.log(JSON.stringify({ configured: false, error: error instanceof Error ? error.message : "failed" }));
  }
`;

async function fixture() {
  const home = resolve(
    import.meta.dir,
    "../../../var/reports/crunchyroll-runtime-tests",
    crypto.randomUUID(),
  );
  roots.push(home);
  const root = join(home, "imports", "fixture-id");
  await Bun.write(join(home, "import.json"), JSON.stringify({ schemaVersion: 1, root }));
  await Bun.write(
    join(root, "cookies.json"),
    JSON.stringify([
      {
        name: "session",
        value: "fake-cookie",
        url: "https://www.crunchyroll.com/",
        path: "/",
        secure: true,
        httpOnly: true,
        expires: Date.now() / 1000 + 3600,
      },
    ]),
  );
  await Bun.write(join(root, "ai.json"), "{}");
  await Bun.write(join(root, "backend.json"), "{}");
  return { home, root };
}

async function execute(home: string) {
  const child = Bun.spawn([process.execPath, "-e", childCode, home], {
    cwd: resolve(import.meta.dir, "../../.."),
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, exit] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  expect(exit).toBe(0);
  expect(stderr).toBe("");
  expect(stdout).not.toContain("fake-import-token");
  expect(stdout).not.toContain("fake-live-token");
  expect(stdout).not.toContain("fake-cookie");
  return JSON.parse(stdout) as Record<string, unknown>;
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { force: true, recursive: true });
});

describe("imported Crunchyroll runtime", () => {
  test("loads private file paths and accepts normalized URL cookies without a token", async () => {
    const { home, root } = await fixture();
    const result = await execute(home);
    expect(result).toMatchObject({
      configured: true,
      cookiesFile: join(root, "cookies.json"),
      importFile: join(root, "ai.json"),
      backendFile: join(root, "backend.json"),
      profile: join(home, "browser-profile"),
      sessionFile: null,
      hasCookies: true,
      hasToken: false,
    });
  });

  test("falls back to the fresh imported session when the live session is expired", async () => {
    const { home, root } = await fixture();
    await Bun.write(
      join(root, "session.json"),
      JSON.stringify({ accessToken: "fake-import-token", expiresAt: Date.now() + 3600000 }),
    );
    await Bun.write(
      join(home, "live-session.json"),
      JSON.stringify({ accessToken: "fake-live-token", expiresAt: Date.now() - 60000 }),
    );
    expect(await execute(home)).toMatchObject({
      configured: true,
      sessionFile: join(root, "session.json"),
      hasToken: true,
      usesImportedToken: true,
      usesLiveToken: false,
    });
  });

  test("prefers a fresh live session over the imported session", async () => {
    const { home, root } = await fixture();
    await Bun.write(
      join(root, "session.json"),
      JSON.stringify({ accessToken: "fake-import-token", expiresAt: Date.now() + 3600000 }),
    );
    await Bun.write(
      join(home, "live-session.json"),
      JSON.stringify({ accessToken: "fake-live-token", expiresAt: Date.now() + 3600000 }),
    );
    expect(await execute(home)).toMatchObject({
      configured: true,
      sessionFile: join(home, "live-session.json"),
      hasToken: true,
      usesLiveToken: true,
      usesImportedToken: false,
    });
  });

  test("rejects a pointer escaping imports and the imports directory itself", async () => {
    const { home } = await fixture();
    for (const root of [join(home, "elsewhere"), join(home, "imports")]) {
      await Bun.write(join(home, "import.json"), JSON.stringify({ schemaVersion: 1, root }));
      expect(await execute(home)).toEqual({
        configured: false,
        error: "Invalid Crunchyroll import location",
      });
    }
  });
});
