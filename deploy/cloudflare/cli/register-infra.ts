// SPDX-License-Identifier: Apache-2.0
import { mkdir, rename, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { digest } from "./cloudflare-ops";
const root = resolve(process.argv[process.argv.indexOf("--root") + 1] ?? ".");
const stage = import.meta.dir;
const backup = resolve(
  process.env.HOME ?? ".",
  ".local/state/aphrody/cloudflare/infra-registration",
);
await mkdir(backup, { recursive: true, mode: 0o700 });
const files = [
  "tools/config/service-catalog.json",
  "tools/config/scheduler-policy.json",
  "tools/config/production-topology.json",
];
const serviceEntries = [
  {
    id: "shenron-cloudflared",
    application: "shenron",
    kind: "cloudflare-tunnel",
    runtime: "native",
    unit: "shenron-cloudflared.service",
    health: "http://127.0.0.1:20243/ready",
    port: 20243,
    host: "dbfr",
    public: false,
    sourceRepo: "shenron",
    note: "Remote-managed tunnel f2ddf195-5d19-4321-8b12-259c7c57659b; token via systemd LoadCredential; no DNS cutover by this service.",
  },
  {
    id: "shenron-cloudflare-audit",
    application: "shenron",
    kind: "read-only-audit",
    runtime: "bun",
    unit: "shenron-cloudflare-audit.service",
    host: "dbfr",
    public: false,
    sourceRepo: "shenron",
    note: "Daily RO reconciliation via shenron-cloudflare-audit.timer; unavailable auth is persisted as failed, never a successful sync.",
  },
  {
    id: "shenron-cloudflare-s3-renew",
    application: "shenron",
    kind: "credential-renewal",
    runtime: "bun",
    unit: "shenron-cloudflare-s3-renew.service",
    host: "dbfr",
    public: false,
    sourceRepo: "shenron",
    note: "Temporary one-hour R2 object credentials for shenron-cdn prefixes _objects/ and _migration/; no corpus, DNS or worker mutation.",
  },
];
for (const name of files) {
  const path = resolve(root, name);
  const text = await readFile(path, "utf8");
  const data = JSON.parse(text);
  await Bun.write(backup + "/" + name.split("/").at(-1) + "." + digest(text) + ".before", text);
  if (name.includes("service-catalog")) {
    for (const entry of serviceEntries) {
      const existing = data.services.find((item: { id: string }) => item.id === entry.id);
      if (entry.id === "shenron-cloudflare-audit" && existing?.status === "on-demand")
        delete existing.status;
      if (existing && JSON.stringify(existing) !== JSON.stringify(entry))
        throw new Error("Owned service contract diverged: " + entry.id);
      if (!existing) data.services.push(entry);
    }
    // The oneshot itself must not be enabled as a boot workload; its timer owns execution.
    const boot = {
      host: "dbfr",
      kind: "systemd",
      unit: "shenron-cloudflare-audit.service",
      hold: "oneshot driven by daily read-only timer",
    };
    const timer = { host: "dbfr", kind: "systemd", unit: "shenron-cloudflare-audit.timer" };
    for (const entry of [
      boot,
      timer,
      {
        host: "dbfr",
        kind: "systemd",
        unit: "shenron-cloudflare-s3-renew.service",
        hold: "oneshot driven by scoped credential renewal timer",
      },
      { host: "dbfr", kind: "systemd", unit: "shenron-cloudflare-s3-renew.timer" },
    ]) {
      const existing = data.boot.entries.find(
        (item: { unit: string; host: string }) =>
          item.unit === entry.unit && item.host === entry.host,
      );
      if (existing && JSON.stringify(existing) !== JSON.stringify(entry))
        throw new Error("Boot entry diverged");
      if (!existing) data.boot.entries.push(entry);
    }
    const task = {
      host: "local",
      kind: "scheduledTask",
      name: "Shenron R2 S3 scoped renewal",
      triggers: ["every:10m", "atLogon"],
      principal: "user",
      runLevel: "limited",
      periodic: true,
      execute: "pwsh.exe",
      arguments:
        '-NoLogo -NoProfile -NonInteractive -File "%USERPROFILE%\\.aphrody\\tools\\cloudflare-cli\\s3-profile.ps1" -Action renew -Apply -BunExe "C:/shenron/var/runtimes/bun-1.4.4-current-ae5a09dc/bun.exe"',
      timeLimitMinutes: 3,
      description:
        "Renew one-hour Shenron R2 S3 object credentials scoped to shenron-cdn _objects/ and _migration/, protected by DPAPI CurrentUser.",
    };
    const current = data.boot.entries.find((v: { name?: string }) => v.name === task.name);
    if (current && JSON.stringify(current) !== JSON.stringify(task))
      throw new Error("Windows renewal boot contract diverged");
    if (!current) data.boot.entries.push(task);
  } else if (name.includes("production-topology")) {
    const ports = data.hosts.dbfr.network.internalOnly;
    if (!ports.includes(20243)) ports.push(20243);
  } else {
    const entry = {
      id: "shenron-cloudflare-audit",
      host: "dbfr",
      cadence: "daily",
      priority: "low",
      unit: "shenron-cloudflare-audit.timer",
      owns: ["shenron-cloudflare-read-only-reconciliation"],
      mutationPolicy: "read-only; no DNS, worker deploy, R2 copy or tunnel config mutation",
    };
    for (const scheduled of [
      entry,
      {
        id: "shenron-cloudflare-s3-renew",
        host: "dbfr",
        cadence: "every-10-minutes",
        priority: "low",
        unit: "shenron-cloudflare-s3-renew.timer",
        owns: ["shenron-scoped-r2-s3-credential"],
        mutationPolicy:
          "temporary scoped credential renewal only; no DNS, worker deploy, R2 objects or tunnel mutation",
      },
    ]) {
      const existing = data.timers.find((item: { id: string }) => item.id === scheduled.id);
      if (existing && JSON.stringify(existing) !== JSON.stringify(scheduled))
        throw new Error("Scheduler entry diverged");
      if (!existing) data.timers.push(scheduled);
    }
  }
  const output =
    JSON.stringify(data) === JSON.stringify(JSON.parse(text))
      ? text
      : JSON.stringify(data, null, 2) + "\n";
  await Bun.write(backup + "/" + name.split("/").at(-1) + ".proposed", output);
  console.log(
    JSON.stringify({
      path,
      before_sha256: digest(text),
      after_sha256: digest(output),
      apply: process.argv.includes("--apply"),
    }),
  );
  if (process.argv.includes("--apply")) {
    if ((await readFile(path, "utf8")) !== text) throw new Error("Concurrent catalogue writer");
    await Bun.write(path + ".cloudflare.tmp", output);
    await rename(path + ".cloudflare.tmp", path);
  }
}
if (process.argv.includes("--apply")) {
  for (const unit of [
    "shenron-cloudflared.service",
    "shenron-cloudflare-audit.service",
    "shenron-cloudflare-audit.timer",
    "shenron-cloudflare-s3-renew.service",
    "shenron-cloudflare-s3-renew.timer",
  ]) {
    const destination = resolve(root, "tools/config/host/systemd/shenron", unit);
    const source = await readFile(resolve(stage, unit), "utf8");
    const previous = await readFile(destination, "utf8").catch(() => undefined);
    if (previous !== undefined && previous !== source)
      throw new Error("Unit source already exists and differs");
    await Bun.write(destination, source);
  }
}
