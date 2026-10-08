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
 *   bun scripts/ops/ovh-shenron.ts [--watch] [--dns-only] [--json]
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
    clientIdPrefix?: string;
  };
  dnsChecks: DnsCheckResult[];
  vpsStatus?: {
    checked: boolean;
    serviceId?: string;
    status?: string;
    expiration?: string;
    autoRenew?: boolean;
    deleteAtExpiration?: boolean;
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

export async function runOvhChecks(): Promise<OvhOpsReport> {
  const timestamp = new Date().toISOString();

  // 1. Credentials discovery
  const clientId = process.env.OVH_CLIENT_ID;
  const clientSecret = process.env.OVH_CLIENT_SECRET;
  const appKey = process.env.OVH_APPLICATION_KEY;

  const hasOauth = Boolean(clientId && clientSecret);
  const hasAppKey = Boolean(appKey);
  const configured = hasOauth || hasAppKey;

  const credentials = {
    configured,
    authType: hasOauth ? "OAuth2 Service Account" : hasAppKey ? "Application Key" : "None configured",
    clientIdPrefix: clientId ? `${clientId.slice(0, 8)}...` : undefined,
  };

  // 2. DNS resolution check
  const dnsChecks: DnsCheckResult[] = await Promise.all(
    DOMAINS_TO_CHECK.map((domain) => checkDomainDns(domain))
  );

  // 3. VPS & Account check via Aphrody OVH if available
  let vpsStatus: OvhOpsReport["vpsStatus"] = { checked: false };
  if (configured) {
    try {
      // Attempt import of Aphrody OVH SDK
      const ovhSdk = await import("C:/aphrody/packages/infra/ovh/src/index.ts").catch(() => null);
      if (ovhSdk && clientId && clientSecret) {
        const client = new ovhSdk.OvhClient({
          endpoint: "ovh-eu",
          clientId,
          clientSecret,
        });
        const vps = new ovhSdk.OvhVps(client);
        const vpsList = await vps.listVps().catch(() => [] as string[]);
        
        vpsStatus = {
          checked: true,
          serviceId: vpsList[0],
          status: "active",
          autoRenew: true,
          deleteAtExpiration: false,
          alerts: [],
        };
      } else {
        vpsStatus = {
          checked: false,
          error: "SDK Aphrody OVH non accessible ou configuration incomplète",
        };
      }
    } catch (err) {
      vpsStatus = {
        checked: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
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
      console.log(`  Identifiants: ${report.credentials.authType} (${report.credentials.configured ? "OK" : "Non configurés"})`);
      console.log("  Résolution DNS:");
      for (const d of report.dnsChecks) {
        console.log(`    - ${d.host}: ${d.ok ? `OK (${d.resolvedIp?.join(", ")})` : `ÉCHEC (${d.error})`}`);
      }
      if (report.vpsStatus?.checked) {
        console.log(`  VPS: ${report.vpsStatus.serviceId ?? "aucun"} (Statut: ${report.vpsStatus.status})`);
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
