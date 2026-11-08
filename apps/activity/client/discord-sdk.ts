// SPDX-License-Identifier: Apache-2.0
/** `ActivitySdk` over the real Embedded App SDK (docs/products/bot-discord-refonte.md §3.3). */
import { DiscordSDK } from "@discord/embedded-app-sdk";
import type { ActivitySdk } from "./sdk";

/** `identify` for the roster, `guilds.members.read` for the guild nickname. Nothing else. */
export const SCOPES = ["identify", "guilds.members.read"] as const;

export function createDiscordSdk(clientId: string, apiBase: string): ActivitySdk {
  const sdk = new DiscordSDK(clientId);
  return {
    kind: "discord",
    instanceId: sdk.instanceId,
    guildId: sdk.guildId,
    channelId: sdk.channelId ?? null,
    apiBase,
    async ready() {
      await sdk.ready();
      // Mobile clients may otherwise render the canvas-free UI without hardware acceleration.
      void sdk.commands.encourageHardwareAcceleration().catch(() => {});
    },
    async authorize() {
      const { code } = await sdk.commands.authorize({
        client_id: clientId,
        response_type: "code",
        state: "",
        prompt: "none",
        scope: [...SCOPES],
      });
      return code;
    },
    async authenticate(accessToken) {
      await sdk.commands.authenticate({ access_token: accessToken });
    },
    async locale() {
      try {
        return (await sdk.commands.userSettingsGetLocale()).locale;
      } catch {
        return null;
      }
    },
    async invite() {
      try {
        await sdk.commands.openInviteDialog();
      } catch {
        // Missing permission to invite: the button does nothing rather than showing an error.
      }
    },
  };
}
