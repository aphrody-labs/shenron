#!/usr/bin/env bun
// SPDX-License-Identifier: Apache-2.0
/**
 * Persistent Next dev server of the site (Turbopack), detached from any interactive session.
 *
 *   bun scripts/dev/dev-server.ts install   register the user scheduled task "ShenronSiteDev" (logon + now)
 *   bun scripts/dev/dev-server.ts start     run the task now (supervisor started by Task Scheduler)
 *   bun scripts/dev/dev-server.ts stop      stop the supervisor and its children (PID file var/dev/dev-server.pid)
 *   bun scripts/dev/dev-server.ts restart
 *   bun scripts/dev/dev-server.ts status    PID, URL, last log lines
 *   bun scripts/dev/dev-server.ts run       supervisor in the foreground (what the task executes)
 *
 * The supervisor restarts `next-bun dev` on exit, listens on 127.0.0.1 only and injects the private
 * DBXV2 environment into the child process only: DBXV2_TOKEN is read from the git-ignored
 * var/dbxv2/token.line, never printed, never written to a log. DBXV2_SERVER_URL targets the private
 * factory server over the WireGuard mesh; when the mesh is unreachable the supervisor opens an
 * `ssh -N -L` tunnel through the `vps` alias instead. Runbook: docs/development/dev-server.md.
 */
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
  appendFileSync,
} from "node:fs";
import { join, resolve } from "node:path";

const ROOT = resolve(import.meta.dir, "../..");
const VAR = join(ROOT, "var/dev");
const PID_FILE = join(VAR, "dev-server.pid");
const LOG = join(VAR, "dev-server.log");
const TASK = "ShenronSiteDev";
const PORT = Number(process.env.SHENRON_DEV_PORT ?? 3000);
const MESH_URL = process.env.DBXV2_MESH_URL ?? "http://10.200.77.1:8788";
const TUNNEL_PORT = 18788;

const log = (m: string) => appendFileSync(LOG, `${new Date().toISOString()} ${m}\n`);

function readToken(): string {
  const file = join(ROOT, "var/dbxv2/token.line");
  if (!existsSync(file)) return "";
  return readFileSync(file, "utf8")
    .trim()
    .replace(/^DBXV2_TOKEN=/, "");
}

/** Throwaway admin token of the local dev server, kept in the git-ignored var/dev. */
function adminToken(): string {
  const file = join(VAR, "admin-token.txt");
  if (!existsSync(file))
    writeFileSync(
      file,
      crypto.randomUUID().replaceAll("-", "") + crypto.randomUUID().replaceAll("-", ""),
    );
  return readFileSync(file, "utf8").trim();
}

async function healthy(url: string): Promise<boolean> {
  try {
    const r = await fetch(`${url}/health`, { signal: AbortSignal.timeout(3000) });
    return r.ok;
  } catch {
    return false;
  }
}

const sh = (cmd: string[]) => Bun.spawnSync(cmd, { stdout: "pipe", stderr: "pipe" });
const out = (r: ReturnType<typeof sh>) => `${r.stdout.toString()}${r.stderr.toString()}`.trim();

function killTree(pid: number) {
  sh(["taskkill", "/PID", String(pid), "/T", "/F"]);
}

function readPid(): number | null {
  try {
    const n = Number(readFileSync(PID_FILE, "utf8").trim());
    return Number.isFinite(n) && n > 0 ? n : null;
  } catch {
    return null;
  }
}

function alive(pid: number): boolean {
  return out(sh(["tasklist", "/FI", `PID eq ${pid}`, "/NH"])).includes(String(pid));
}

async function run() {
  mkdirSync(VAR, { recursive: true });
  writeFileSync(PID_FILE, String(process.pid));
  let stopping = false;
  let tunnel: ReturnType<typeof Bun.spawn> | null = null;
  const cleanup = () => {
    stopping = true;
    if (tunnel) killTree(tunnel.pid);
    if (child?.pid) killTree(child.pid);
    rmSync(PID_FILE, { force: true });
  };
  process.on("SIGINT", () => (cleanup(), process.exit(0)));
  process.on("SIGTERM", () => (cleanup(), process.exit(0)));

  let child: ReturnType<typeof Bun.spawn> | null = null;
  while (!stopping) {
    let serverUrl = MESH_URL;
    if (!(await healthy(MESH_URL))) {
      serverUrl = `http://127.0.0.1:${TUNNEL_PORT}`;
      if (!tunnel || tunnel.exitCode !== null) {
        log(`mesh ${MESH_URL} unreachable, opening ssh tunnel on ${TUNNEL_PORT}`);
        tunnel = Bun.spawn(
          [
            "ssh",
            "-N",
            "-o",
            "ExitOnForwardFailure=yes",
            "-o",
            "ServerAliveInterval=30",
            "-L",
            `127.0.0.1:${TUNNEL_PORT}:10.200.77.1:8788`,
            "vps",
          ],
          { stdout: "ignore", stderr: "ignore" },
        );
        await Bun.sleep(3000);
      }
    }
    const env: Record<string, string> = {
      ...(process.env as Record<string, string>),
      NODE_ENV: "development",
      DBXV2_SERVER_URL: serverUrl,
      DBXV2_TOKEN: readToken(),
      DBXV2_DB_PATH: join(ROOT, "var/dbxv2/dbxv2.sqlite"),
      HOSTNAME: "127.0.0.1",
      SHENRON_ADMIN_TOKEN: adminToken(),
    };
    log(`starting next dev on 127.0.0.1:${PORT} (dbxv2 server ${serverUrl})`);
    child = Bun.spawn(["bun", "run", "dev", "-H", "127.0.0.1", "-p", String(PORT)], {
      cwd: join(ROOT, "apps/site"),
      env,
      stdout: "pipe",
      stderr: "pipe",
    });
    const pump = async (s: ReadableStream<Uint8Array>) => {
      for await (const c of s) appendFileSync(LOG, c);
    };
    await Promise.all([
      pump(child.stdout as ReadableStream<Uint8Array>),
      pump(child.stderr as ReadableStream<Uint8Array>),
      child.exited,
    ]);
    log(`next dev exited (${child.exitCode}); restart in 5 s`);
    if (!stopping) await Bun.sleep(5000);
  }
}

const cmd = process.argv[2] ?? "status";
if (cmd === "run") {
  await run();
} else if (cmd === "install") {
  const bun = process.execPath;
  const tr = `"${bun}" "${join(ROOT, "scripts/dev/dev-server.ts")}" run`;
  console.log(
    out(
      sh(["schtasks", "/Create", "/F", "/SC", "ONLOGON", "/RL", "LIMITED", "/TN", TASK, "/TR", tr]),
    ),
  );
} else if (cmd === "start") {
  console.log(out(sh(["schtasks", "/Run", "/TN", TASK])));
} else if (cmd === "stop" || cmd === "restart") {
  const pid = readPid();
  if (pid) killTree(pid);
  rmSync(PID_FILE, { force: true });
  console.log(pid ? `stopped ${pid}` : "not running");
  if (cmd === "restart") {
    await Bun.sleep(1500);
    console.log(out(sh(["schtasks", "/Run", "/TN", TASK])));
  }
} else {
  const pid = readPid();
  console.log(pid && alive(pid) ? `running pid=${pid} url=http://127.0.0.1:${PORT}` : "stopped");
  console.log(`log: ${LOG}`);
  if (existsSync(LOG)) console.log(readFileSync(LOG, "utf8").split("\n").slice(-12).join("\n"));
}
