// SPDX-License-Identifier: Apache-2.0
/**
 * `/arena`: opens the Arène Shenron Activity (the multiplayer Budokai quiz) in the member's voice
 * channel (docs/products/bot-discord-refonte.md §7, lot A3).
 *
 * Two doors lead to the same launch:
 *
 *  - the `/arena` slash command;
 *  - the Primary Entry Point command of the application (the "Launch" entry of the App Launcher
 *    and of the voice panel). While its handler is `DISCORD_LAUNCH_ACTIVITY` (portal default,
 *    phase 1) Discord opens the Activity itself and the bot never sees the interaction. Once the
 *    handler is switched to `APP_HANDLER` (phase 2, `PATCH /applications/{id}/commands/{id}` with
 *    `handler: 1`) the interaction reaches `onEntryPoint` below. discordx never routes such an
 *    interaction (its `executeInteraction` returns early on `isPrimaryEntryPointCommand()`), which
 *    is why this is a plain `interactionCreate` listener and not a `@Slash`.
 *
 * Until the application is verified and the Activity enabled in the developer portal, the launch is
 * closed by the `activity.enabled` setting (off by default): the member gets an ephemeral
 * "coming soon" answer instead of a launch Discord would not honour. A launch Discord refuses gets
 * the same answer. Everything visible goes through the dictionaries (`arena.*`).
 */
import type { CommandInteraction, PrimaryEntryPointCommandInteraction } from "discord.js";
import { Bot, Discord, Guard, On, Slash, type ArgsOf } from "discordx";
import { inject, injectable } from "tsyringe";
import { GuildOnly } from "~/guards/GuildOnly";
import { discordLocalizations, interactionLang, t } from "~/lib/i18n";
import { logger } from "~/lib/logger";
import { SettingsService } from "~/services/SettingsService";
import { card, notice, reply } from "~/ui";

/** Setting that opens the launch (`false` until the owner has verified the application). */
export const ARENA_LAUNCH_SETTING = "activity.enabled";

export type ArenaLaunchOutcome = "launched" | "soon" | "voice_required";

export interface ArenaLaunchDeps {
  settings: Pick<SettingsService, "getBool">;
}

type ArenaInteraction = CommandInteraction | PrimaryEntryPointCommandInteraction;

/** Voice channel the member is in (`null` when none, or when the voice state is not cached). */
function voiceChannelId(interaction: ArenaInteraction): string | null {
  return interaction.guild?.voiceStates.cache.get(interaction.user.id)?.channelId ?? null;
}

/** The ephemeral "coming soon" answer: what the member sees while the Activity is not open. */
function comingSoon(interaction: ArenaInteraction) {
  const lang = interactionLang(interaction);
  return reply(
    interaction,
    card({
      accent: "games",
      title: t(lang, "arena.soon.title"),
      lines: [t(lang, "arena.soon.body")],
    }),
  );
}

/**
 * Launches the Activity for the member who ran the command. Answers (ephemeral) when the launch is
 * closed, when the member is in a guild but in no voice channel, or when Discord refuses it; on
 * success Discord opens the Activity and the bot sends nothing more.
 */
export async function launchArena(
  interaction: ArenaInteraction,
  deps: ArenaLaunchDeps,
): Promise<ArenaLaunchOutcome> {
  const lang = interactionLang(interaction);
  if (!(await deps.settings.getBool(ARENA_LAUNCH_SETTING, false))) {
    await comingSoon(interaction);
    return "soon";
  }
  // The Arena is played together, in voice. In a DM (entry point only) there is no channel to check.
  if (interaction.guildId && voiceChannelId(interaction) === null) {
    await reply(interaction, notice(lang, "info", "arena.voice.required"));
    return "voice_required";
  }
  try {
    await interaction.launchActivity();
    return "launched";
  } catch (err) {
    // No Activity configured for the application, or not verified yet: the REST call is refused.
    logger.warn({ err, userId: interaction.user.id }, "arena: Discord refused the Activity launch");
    await comingSoon(interaction);
    return "soon";
  }
}

@Discord()
@Bot("shenron")
@injectable()
export class ArenaCommand {
  constructor(@inject(SettingsService) private settings: SettingsService) {}

  @Slash({
    name: "arena",
    nameLocalizations: discordLocalizations("arena.command.name"),
    description: t("en", "arena.command.description"),
    descriptionLocalizations: discordLocalizations("arena.command.description"),
  })
  @Guard(GuildOnly)
  async arena(interaction: CommandInteraction) {
    await launchArena(interaction, { settings: this.settings });
  }

  /** Primary Entry Point with the `APP_HANDLER` handler (phase 2); dormant with the default one. */
  @On({ event: "interactionCreate" })
  async onEntryPoint([interaction]: ArgsOf<"interactionCreate">) {
    if (!interaction.isPrimaryEntryPointCommand()) return;
    await launchArena(interaction, { settings: this.settings }).catch((err) => {
      logger.error({ err }, "arena: entry point handler failed");
    });
  }
}
