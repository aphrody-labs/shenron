// SPDX-License-Identifier: Apache-2.0
/** Salon admin du lab IA : logique partagée dans `@aphrody/shenron-api/admin-lab`. */
import "server-only";
import { discordFetch, DiscordRESTError } from "@aphrody/discord-kit/rest";
import { ChannelError, DiscordChannel } from "@aphrody/messaging";
import { createAdminLab } from "@aphrody/shenron-api/admin-lab";

export type { AdminLabMessageOptions } from "@aphrody/shenron-api/admin-lab";

const lab = createAdminLab({
  discordFetch,
  createChannel: (opts) => new DiscordChannel(opts),
  httpStatus: (e) =>
    e instanceof DiscordRESTError
      ? e.status
      : e instanceof ChannelError
        ? ((e.cause as { status?: number } | undefined)?.status ?? e.code)
        : undefined,
});

export const { sendAdminLabMessage, getAdminLabRecentMessages } = lab;
