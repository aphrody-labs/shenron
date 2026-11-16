// SPDX-License-Identifier: Apache-2.0
/** Read-only Shenron access to Shenron's canonical infrastructure inventory. */
import { runShenronCli, type ShenronCliOptions, type CliResult } from "./cli";

export interface ShenronInfraTargetCheck {
  target: string;
  status: string;
  ok: boolean;
}

export interface ShenronInfraCheck {
  targets: ShenronInfraTargetCheck[];
  raw: string;
  success: boolean;
}

/** Read configured targets and their cataloged services (`shenron infra status --json`). */
export function shenronInfraStatus(
  options: Omit<ShenronCliOptions, "json"> = {},
): Promise<CliResult<Record<string, unknown>>> {
  return runShenronCli<Record<string, unknown>>(["infra", "status", "--json"], {
    ...options,
    json: true,
  });
}

/** Check SSH connectivity/topology for configured hosts (`shenron infra check`). */
export async function shenronInfraCheck(
  options: Omit<ShenronCliOptions, "json"> = {},
): Promise<CliResult<ShenronInfraCheck>> {
  const result = await runShenronCli(["infra", "check"], options);
  if (result.kind !== "exit" || !result.ok) return result;
  const targets = result.stdout.split(/\r?\n/).flatMap((line) => {
    const match = /^\s*\*\s*([^:]+):\s*(.*?)\s*$/.exec(line);
    if (!match) return [];
    const status = match[2]!;
    return [{ target: match[1]!.trim(), status, ok: status.toLowerCase() === "ok" }];
  });
  return {
    ...result,
    data: { targets, raw: result.stdout, success: result.code === 0 },
  };
}
