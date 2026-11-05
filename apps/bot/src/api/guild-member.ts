// SPDX-License-Identifier: Apache-2.0
/**
 * guild-member.ts — résolution d'un membre de la guilde de production depuis
 * n'importe quel client persona (ClientMap), pour l'API REST et l'activité.
 */
import type { GuildMember } from "discord.js";
import { Client } from "discordx";
import { container } from "tsyringe";
import { env } from "~/lib/env";

/** Résout un GuildMember depuis n'importe quel client persona ayant la guilde. */
export async function resolveMember(userId: string): Promise<GuildMember | null> {
  const clients = container.resolve<Map<string, Client>>("ClientMap");
  for (const client of clients.values()) {
    const guild = client.guilds.cache.get(env.GUILD_ID);
    if (!guild) continue;
    const member = await guild.members.fetch(userId).catch(() => null);
    if (member) return member;
  }
  return null;
}
