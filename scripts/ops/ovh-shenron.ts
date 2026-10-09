#!/usr/bin/env bun
// SPDX-License-Identifier: Apache-2.0
/**
 * OVHcloud Operations & Monitoring for Shenron (dragonballfr.com).
 *
 * Checks:
 *   - OVH API credentials & authentication (OAuth2 service account or application keys)
 *   - DNS resolution for dragonballfr.com, bot.dragonballfr.com, cdn.dragonballfr.com, mcp.dragonballfr.com
 *   - VPS renewal status, expiration alert threshold and auto-renewal policies
 *
 * Usage:
 *   bun scripts/ops/ovh-shenron.ts [--watch] [--json]
 */

import { lookup } from "node:dns/promises";

export interface DnsCheckResult {
  host: string;
  resolvedIp?: string[];
  ok: boolean;
  error?: string;
}

export interface OvhOpsReport {
  timestamp: string;
  credentials: {
    configured: boolean;
    authType: string;
  };
  dnsChecks: DnsCheckResult[];
  vpsStatus?: {
    checked: boolean;
    status?: string;
    alerts?: string[];
    error?: string;
  };
}

const DOMAINS_TO_CHECK = [
  "dragonballfr.com",
  "bot.dragonballfr.com",
  "cdn.dragonballfr.com",
  "mcp.dragonballfr.com",
];

export async function checkDomainDns(hostname: string): Promise<DnsCheckResult> {
  try {
    const res = await lookup(hostname);
    return {
      host: hostname,
      resolvedIp: [res.address],
      ok: true,
    };
  } catch (err) {
    return {
      host: hostname,
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

async function runAphrodyOvh(args: string[]): Promise<{ code: number; stdout: string }> {
  try {
    const proc = Bun.spawn(["aphrody", "ovh", ...args], {
      stdout: "pipe",
      stderr: "ignore",
    });
    const [stdout, code] = await Promise.all([new Response(proc.stdout).text(), proc.exited]);
    return { code, stdout };
  } catch {
    return { code: 127, stdout: "" };
  }
}

export async function runOvhChecks(): Promise<OvhOpsReport> {
  const timestamp = new Date().toISOString();
  const auth = await runAphrodyOvh(["auth", "status", "--json"]);
  const credentials = {
    configured: auth.code === 0,
    authType: auth.code === 0 ? "Aphrody OVH credentials" : "Unavailable",
  };

  const dnsChecks: DnsCheckResult[] = await Promise.all(
    DOMAINS_TO_CHECK.map((domain) => checkDomainDns(domain)),
  );

  let vpsStatus: OvhOpsReport["vpsStatus"] = { checked: false };
  if (credentials.configured) {
    const watch = await runAphrodyOvh(["services", "watch", "--days", "14"]);
    if (watch.code === 0) {
      vpsStatus = { checked: true, status: "healthy", alerts: [] };
    } else if (watch.code === 1) {
      vpsStatus = {
        checked: true,
        status: "alerts",
        alerts: ["Aphrody OVH reports services requiring attention."],
      };
    } else {
      vpsStatus = {
        checked: false,
        error: "Aphrody OVH service check failed; details were withheld.",
      };
    }
  } else {
    vpsStatus = {
      checked: false,
      error: "Aphrody OVH credentials or CLI are unavailable.",
    };
  }

  return {
    timestamp,
    credentials,
    dnsChecks,
    vpsStatus,
  };
}

async function main() {
  const isWatch = process.argv.includes("--watch");
  const isJson = process.argv.includes("--json");

  const runOnce = async () => {
    const report = await runOvhChecks();
    if (isJson) {
      console.log(JSON.stringify(report, null, 2));
    } else {
      console.log(`[OVH Ops ${report.timestamp}]`);
      console.log(
        `  Identifiants: ${report.credentials.authType} (${report.credentials.configured ? "OK" : "Non configurés"})`,
      );
      console.log("  Résolution DNS:");
      for (const d of report.dnsChecks) {
        console.log(
          `    - ${d.host}: ${d.ok ? `OK (${d.resolvedIp?.join(", ")})` : `ÉCHEC (${d.error})`}`,
        );
      }
      if (report.vpsStatus?.checked) {
        console.log(`  Services OVH: ${report.vpsStatus.status ?? "inconnu"}`);
      }
    }
  };

  await runOnce();

  if (isWatch) {
    console.log("--> Surveillance continue OVH activée (intervalle: 300s)...");
    setInterval(async () => {
      try {
        await runOnce();
      } catch (e) {
        console.error("Erreur cycle surveillance OVH:", e);
      }
    }, 300_000);
  }
}

if (import.meta.main) {
  await main();
}
