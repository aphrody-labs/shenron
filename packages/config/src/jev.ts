// SPDX-License-Identifier: Apache-2.0
import type { EnvSource } from "./env";

/** Credential values remain in the backend environment; settings only expose readiness. */
export function resolveJev(env: EnvSource): { enabled: boolean; credentialPresent: boolean } {
  const credentialPresent = Boolean(env.TYPESAFE_API_KEY?.trim());
  return {
    enabled: env.SHENRON_JEV === "off" ? false : env.SHENRON_JEV === "on" || credentialPresent,
    credentialPresent,
  };
}
