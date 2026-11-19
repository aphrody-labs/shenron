#!/usr/bin/env bun
// SPDX-License-Identifier: Apache-2.0
/**
 * Print the revision production actually runs, read-only, for SHENRON_DEPLOY_TARGET.
 *
 *   bun scripts/deploy/active-release.ts [site|bot]      (default: site)
 *
 * Order: the image tag of the running container (what serves traffic), then the per-service tag,
 * then SHENRON_IMAGE_TAG of the .env in the compose project directory of that container (or
 * $SHENRON_ROOT on the target). $SHENRON_ROOT/current is never used: it only names
 * the static release directory of the gateway and lagged the image until 2026-11-03 (audit
 * surface-2026-11-05 E2). SHENRON_ACTIVE_COMMAND replaces the probe; empty prints nothing.
 * Prints nothing (exit 0) when no revision is found, e.g. on a first install.
 * Exit 64 on an unknown service.
 */
import { $ } from "bun";

const SERVICES = ["site", "bot"] as const;
export type Service = (typeof SERVICES)[number];

export function parseService(argument: string | undefined): Service | undefined {
  const name = argument || "site";
  return SERVICES.find((service) => service === name);
}

export function resolveHost(name: string, env: Record<string, string | undefined>): string {
  switch (name) {
    case "vps":
      return env.SHENRON_VPS_HOST || "vps";
    case "cdn":
    case "bunos":
      return env.SHENRON_CDN_HOST || "cdn";
    case "prod":
      return env.SHENRON_PROD_HOST || "prod";
    default:
      return name;
  }
}

/** Shell script run on the target: the running container first, then the compose project .env. */
export function probeCommand(service: Service): string {
  const upper = service.toUpperCase();
  const label = '{{index .Config.Labels "com.docker.compose.project.working_dir"}}';
  return [
    `docker inspect -f '{{.Config.Image}}' shenron-${service} 2>/dev/null | sed -n 's/.*://p'`,
    `root=\${SHENRON_ROOT:-$(docker inspect -f '${label}' shenron-${service} 2>/dev/null)}`,
    `[ -z "$root" ] || sed -n 's/^SHENRON_${upper}_TAG=//p; s/^SHENRON_IMAGE_TAG=//p' "$root/.env" 2>/dev/null`,
  ].join("\n");
}

/** First line that is exactly a 40-hex commit id, or an empty string. */
export function firstRevision(output: string): string {
  return output.split("\n").find((line) => /^[0-9a-f]{40}$/.test(line)) ?? "";
}

export async function activeRelease(
  service: Service,
  env: Record<string, string | undefined>,
): Promise<string> {
  const target = env.SHENRON_DEPLOY_TARGET || `ssh:${env.SHENRON_DEPLOY_HOST || "prod"}`;
  const command = env.SHENRON_ACTIVE_COMMAND ?? probeCommand(service);
  if (command === "") return "";
  const host = target.startsWith("ssh:") ? resolveHost(target.slice(4), env) : undefined;
  // A failing probe means "no revision found": a first install has no container yet.
  const result = host
    ? await $`ssh -o ConnectTimeout=15 -o BatchMode=yes ${host} ${command}`.nothrow().quiet()
    : await $`bash -c ${command}`.nothrow().quiet();
  process.stderr.write(result.stderr);
  return firstRevision(result.stdout.toString());
}

async function main(argv: string[]): Promise<number> {
  const service = parseService(argv[0]);
  if (!service) {
    console.error(`unknown service: ${argv[0]}`);
    return 64;
  }
  const revision = await activeRelease(service, process.env);
  if (revision) console.log(revision);
  return 0;
}

if (import.meta.main) process.exit(await main(process.argv.slice(2)));
