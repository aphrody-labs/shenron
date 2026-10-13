// SPDX-License-Identifier: Apache-2.0
import { checkAlias, ENV_ALIASES, envFirst, type EnvSource } from "@aphrody/shenron-config/env";

/** Resolve the canonical shared credentials before the bot validates its historical fields. */
export function botApiEnvironment(source: EnvSource): Record<string, string | undefined> {
  const resolved = { ...source };
  for (const names of [ENV_ALIASES.adminToken, ENV_ALIASES.actingUserSecret]) {
    const issue = checkAlias(source, names);
    if (issue) throw new Error(`Environment alias mismatch: ${names.join(", ")}`);
    resolved[names[1]] = envFirst(source, names)?.value;
  }
  return resolved;
}
