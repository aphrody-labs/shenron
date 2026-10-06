// SPDX-License-Identifier: Apache-2.0
/**
 * Creation and sign-in conversion of agent homes over any {@link AgentHomeStore}.
 * Runtime class: `pure` (store and template injected).
 */
import {
  type AgentHomeProfileInput,
  type AgentHomeSnapshot,
  type AgentHomeStore,
  type AgentHomeTemplate,
  convertLocalHome,
  instantiateAgentHome,
  LOCAL_AGENT_ID,
  newerHome,
} from "./types";

/** The home of `input.agentId`, created from the template when it does not exist. */
export async function ensureAgentHome(
  store: AgentHomeStore,
  template: AgentHomeTemplate,
  input: AgentHomeProfileInput,
  now: Date = new Date(),
): Promise<{ home: AgentHomeSnapshot; created: boolean }> {
  const existing = await store.get(input.agentId);
  if (existing) return { home: existing, created: false };
  const home = instantiateAgentHome(template, input, now);
  // A concurrent writer may have created it meanwhile: the stored one wins then.
  if ((await store.put(home)) === "stale")
    return { home: (await store.get(input.agentId)) ?? home, created: false };
  return { home, created: true };
}

/**
 * Sign-in of an anonymous install: the `local` home becomes `discord:<user_id>`. The base is
 * the newer of the `local` home and an existing Discord home (an earlier sign-in, a moved
 * directory, a copy pulled from the cloud); the user's own fields are kept and the Discord
 * facts fill the rest. Without either, the Discord home is created from the template. The
 * `local` home itself is left to the caller (the desktop moves or removes its directory).
 */
export async function convertToDiscordHome(
  store: AgentHomeStore,
  template: AgentHomeTemplate,
  discord: Omit<AgentHomeProfileInput, "agentId"> & { discordId: string },
  now: Date = new Date(),
): Promise<AgentHomeSnapshot> {
  const { discordId, ...facts } = discord;
  const agentId = `discord:${discordId}`;
  const local = await store.get(LOCAL_AGENT_ID);
  const existing = await store.get(agentId);
  if (!local && !existing)
    return (await ensureAgentHome(store, template, { ...facts, agentId }, now)).home;
  const base = local && (!existing || newerHome(local, existing)) ? local : existing!;
  const converted = convertLocalHome(base, discord, now);
  await store.put(converted);
  return converted;
}
