// SPDX-License-Identifier: Apache-2.0
/** Ephemeral PostgreSQL qualification; never opens a product database. */
import { mkdtemp, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { createBunSql } from "@shenron/db/bun-sql";

const root = join(import.meta.dir, "../../..");
const candidates = [
  Bun.which("postgres"),
  ...new Bun.Glob("/usr/lib/postgresql/*/bin/postgres").scanSync(),
].filter((p): p is string => !!p);
const binary = process.env.SHENRON_POSTGRES_BIN ?? candidates.toSorted().at(-1);
if (!binary)
  throw new Error(
    "PostgreSQL provider missing: set SHENRON_POSTGRES_BIN to its installed postgres executable",
  );
const directory = await mkdtemp(join(tmpdir(), "shenron-theme-fixture-"));
let child: Bun.Subprocess<"ignore", "ignore", "pipe"> | undefined;
let drain: Promise<void> | undefined;
let pool: ReturnType<typeof createBunSql> | undefined;
try {
  const init = Bun.spawn(
    [
      join(dirname(binary), "initdb"),
      "-D",
      join(directory, "data"),
      "--no-locale",
      "--encoding=UTF8",
      "--auth=trust",
      "--username=fixture",
      "--no-sync",
    ],
    {
      env: { PATH: process.env.PATH, HOME: process.env.HOME },
      stdout: "ignore",
      stderr: "pipe",
    },
  );
  const initLog = new Response(init.stderr).text();
  if ((await init.exited) !== 0)
    throw new Error(`PostgreSQL fixture initialization failed: ${await initLog}`);
  await initLog;
  const listener = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: () => new Response() });
  const port = listener.port;
  await listener.stop(true);
  const ready = Promise.withResolvers<void>();
  let log = "";
  child = Bun.spawn(
    [
      binary,
      "-D",
      join(directory, "data"),
      "-h",
      "127.0.0.1",
      "-p",
      String(port),
      "-k",
      directory,
      "-F",
    ],
    {
      env: { PATH: process.env.PATH, HOME: process.env.HOME, LC_MESSAGES: "C" },
      stdin: "ignore",
      stdout: "ignore",
      stderr: "pipe",
    },
  );
  drain = (async () => {
    for await (const chunk of child!.stderr) {
      log = (log + new TextDecoder().decode(chunk)).slice(-16384);
      if (log.includes("ready to accept connections")) ready.resolve();
    }
  })();
  const timeout = setTimeout(
    () => ready.reject(new Error(`PostgreSQL fixture startup timeout: ${log}`)),
    10000,
  );
  void child.exited.then(() => ready.reject(new Error(`PostgreSQL fixture exited: ${log}`)));
  try {
    await ready.promise;
  } finally {
    clearTimeout(timeout);
  }
  const base = `postgres://fixture@127.0.0.1:${port}`;
  pool = createBunSql({
    url: base + "/postgres",
    max: 1,
    applicationName: "shenron-theme-fixture-bootstrap",
  });
  await pool.unsafe("create database shenron_theme_fixture");
  await pool.close();
  pool = undefined;
  const test = Bun.spawn(
    [
      process.execPath,
      "test",
      "test/site-theme.pg.test.ts",
      "test/favorites.pg.test.ts",
      "test/home.pg.test.ts",
      "test/chronology.pg.test.ts",
      "test/page-banners.pg.test.ts",
    ],
    {
      cwd: join(root, "packages/api"),
      env: { ...process.env, SHENRON_THEME_PG_URL: base + "/shenron_theme_fixture" },
      stdout: "inherit",
      stderr: "inherit",
    },
  );
  const code = await test.exited;
  if (code !== 0) throw new Error(`PostgreSQL theme qualification failed (${code})`);
} finally {
  try {
    await pool?.close();
  } finally {
    if (child) {
      child.kill("SIGINT");
      const forced = setTimeout(() => child!.kill("SIGKILL"), 3000);
      await child.exited;
      clearTimeout(forced);
      await drain;
    }
    await rm(directory, { recursive: true, force: true });
  }
}
