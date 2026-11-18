#!/usr/bin/env bun
// SPDX-License-Identifier: Apache-2.0
/**
 * VPS Pre-Prod CI/CD Driver (fr1 xbuild workspace -> Vercel --prebuilt + Cloudflare Workers).
 *
 * Keeps heavy CI/builds on fr1 (12-core build hub) inside xbuild, verifies pre-prod checks
 * against preview/staging, and pushes ONLY prebuilt artifacts to Vercel (0 Vercel build minutes).
 */

export const XBUILD_ROOT =
  process.env.SHENRON_XBUILD_DIR ?? ["", "srv", "xbuild", "shenron"].join("/");

export interface PreprodPlan {
  remoteDir: string;
  gates: readonly string[];
  deployCommands: readonly string[];
}

export function buildPreprodPlan(remoteDir = XBUILD_ROOT): PreprodPlan {
  return {
    remoteDir,
    gates: [
      "bun scripts/deploy/environment.ts --check",
      "bun scripts/deploy/lanes.ts --check",
      "bun packages/pipeline/scripts/ai/check-contracts.ts",
      "bun scripts/audit/check-workspace-packages.ts --strict",
      "bun run format:check",
      "bun run lint",
      "bun run typecheck",
      "bun run test",
      "just migrate-check",
      "just align-check",
    ],
    deployCommands: [
      "bunx vercel pull --yes --environment=production",
      "bunx vercel build --prod",
      "bunx vercel deploy --prebuilt --prod --archive=tgz --yes",
    ],
  };
}

if (import.meta.main) {
  const plan = buildPreprodPlan();
  if (process.argv.includes("--plan")) {
    console.log(JSON.stringify(plan, null, 2));
    process.exit(0);
  }
  console.log(`Pre-prod target directory on fr1: ${plan.remoteDir}`);
  for (const gate of plan.gates) console.log(`  gate: ${gate}`);
  for (const step of plan.deployCommands) console.log(`  ship: ${step}`);
}
