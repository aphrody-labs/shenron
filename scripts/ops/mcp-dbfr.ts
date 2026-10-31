#!/usr/bin/env bun
// SPDX-License-Identifier: Apache-2.0
/**
 * Launches the local `shenron-mcp` (stdio) against the production APIs of dbfr.
 *
 *   bun scripts/ops/mcp-dbfr.ts [--host dbfr] [--container aphrody-site-1]
 *   claude mcp add shenron-dbfr -- bun scripts/ops/mcp-dbfr.ts
 *
 * The admin token is read over SSH from the environment of the running site container at each
 * start and handed to the child process only: nothing is written to disk and nothing is printed.
 * Writes go through the authorized Shenron APIs (the MCP tools are dry runs unless `apply` is set),
 * never through a direct database connection.
 */
const args = process.argv.slice(2);
const flag = (name: string, fallback: string) => {
  const at = args.indexOf(`--${name}`);
  return at >= 0 && args[at + 1] ? args[at + 1] : fallback;
};
const host = flag("host", "dbfr");
const container = flag("container", "aphrody-site-1");
const KEYS = ["SHENRON_ADMIN_TOKEN", "SHENRON_API_ADMIN_TOKEN", "DBFR_TOKEN"] as const;

const read = Bun.spawnSync(
  [
    "ssh",
    "-o",
    "BatchMode=yes",
    "-o",
    "ConnectTimeout=15",
    host,
    `docker inspect -f '{{range .Config.Env}}{{println .}}{{end}}' ${container}`,
  ],
  { stderr: "pipe" },
);
if (read.exitCode !== 0) {
  console.error(`mcp-dbfr: cannot read the ${container} environment on ${host}`);
  process.exit(1);
}

const env: Record<string, string> = { ...(process.env as Record<string, string>) };
for (const line of read.stdout.toString().split("\n")) {
  const at = line.indexOf("=");
  const key = line.slice(0, at);
  if (at > 0 && (KEYS as readonly string[]).includes(key)) env[key] = line.slice(at + 1);
}
if (!KEYS.some((key) => env[key])) {
  console.error("mcp-dbfr: no admin token found in the container environment");
  process.exit(1);
}
env.SHENRON_API_URL ??= "https://bot.dragonballfr.com";

const child = Bun.spawn(["shenron-mcp"], {
  env,
  stdin: "inherit",
  stdout: "inherit",
  stderr: "inherit",
});
process.exit(await child.exited);
