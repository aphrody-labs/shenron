import { injectable, inject } from "tsyringe";
import { Bot, ButtonComponent, Discord, Guard, Slash, SlashChoice, SlashOption } from "discordx";
import { userTransformer } from "~/lib/slash-user";
import {
  ApplicationCommandOptionType,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  MessageFlags,
  type ButtonInteraction,
  type CommandInteraction,
  type Message,
  type User,
} from "discord.js";
import { GuildOnly } from "~/guards/GuildOnly";
import { CommandsChannelOnly } from "~/guards/CommandsChannelOnly";
import { EconomyService } from "~/services/EconomyService";
import { GameRewardService } from "~/services/GameRewardService";
import { SingleUseTokens, stakeAllowed } from "~/services/games/anti-farm";
import {
  DUEL_MAX_STAKE_DEFAULT,
  duelStakeError,
  grantLine,
  opponentError,
  playerRewardLine,
  rewardText,
  statusColor,
} from "~/services/games/duel";
import { interactionLang } from "~/lib/i18n";
import { formatZeni } from "@aphrody/shenron-config/zeni";
import { SettingsService } from "~/services/SettingsService";
import { MessageTemplateService } from "~/services/MessageTemplateService";
import { ZENI_GAME_WIN, ZENI_GAME_LOSS_PENALTY } from "~/lib/constants";
import { DBZ_COLORS } from "~/lib/embeds";
import { logger } from "~/lib/logger";
import {
  PFC_CHOICES,
  type PfcChoice as Choice,
  decideBotChoice,
  resolvePfc,
} from "~/services/games/pfc";

const EMOJIS: Record<Choice, string> = { pierre: "🪨", feuille: "📄", ciseaux: "✂️" };
const LABELS: Record<Choice, string> = { pierre: "Pierre", feuille: "Feuille", ciseaux: "Ciseaux" };
const TITLE = "Pierre-Feuille-Ciseaux";

interface Duel {
  challenger: string;
  opponent: string;
  stake: number;
  choices: Partial<Record<string, Choice>>;
  message?: Message;
}

const duels = new Map<string, Duel>();
/**
 * Messages contre le robot déjà joués. Le résultat est versé au premier clic ;
 * un double-clic arrivé avant la mise à jour du message ne paie plus deux fois.
 */
const playedBotRounds = new SingleUseTokens();
const BOT_ROUND_TTL_MS = 24 * 60 * 60_000;

function buttons(kind: "bot" | "duel", owner: string): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    ...PFC_CHOICES.map((choice) =>
      new ButtonBuilder()
        .setCustomId(`pfc:${kind}:${choice}:${owner}`)
        .setEmoji(EMOJIS[choice])
        .setLabel(LABELS[choice])
        .setStyle(ButtonStyle.Secondary),
    ),
  );
}

function pfcEmbed(
  status: "playing" | "won" | "lost" | "draw" | "expired",
  description: string,
): EmbedBuilder {
  const suffix =
    status === "won"
      ? " · Victoire"
      : status === "lost"
        ? " · Défaite"
        : status === "draw"
          ? " · Égalité"
          : status === "expired"
            ? " · Expiré"
            : "";
  return new EmbedBuilder()
    .setTitle(`✊ ${TITLE}${suffix}`)
    .setDescription(description)
    .setColor(status === "playing" ? DBZ_COLORS.zeni : statusColor(status))
    .setTimestamp(new Date());
}

@Discord()
@Bot("shenron")
@Guard(GuildOnly, CommandsChannelOnly)
@injectable()
export class PfcCommand {
  constructor(
    @inject(EconomyService) private eco: EconomyService,
    @inject(SettingsService) private settings: SettingsService,
    @inject(MessageTemplateService) private msg: MessageTemplateService,
    @inject(GameRewardService) private rewards: GameRewardService,
  ) {}

  @Slash({ name: "pfc", description: "Pierre-Feuille-Ciseaux" })
  async pfc(
    @SlashChoice({ name: "bot", value: "bot" })
    @SlashChoice({ name: "joueur", value: "joueur" })
    @SlashOption({
      name: "mode",
      description: "bot ou joueur",
      type: ApplicationCommandOptionType.String,
      required: true,
    })
    mode: "bot" | "joueur",
    @SlashOption(
      {
        name: "adversaire",
        description: "Adversaire (si mode=joueur)",
        type: ApplicationCommandOptionType.User,
        required: false,
      },
      userTransformer,
    )
    opponent: User | undefined,
    @SlashOption({
      name: "mise",
      description: "Mise en zénis, duel uniquement (le gagnant remporte le pot)",
      type: ApplicationCommandOptionType.Integer,
      required: false,
      minValue: 1,
      maxValue: 1_000_000,
    })
    mise: number | undefined,
    interaction: CommandInteraction,
  ) {
    const userId = interaction.user.id;
    if (mode === "bot") {
      // Contre le robot, une mise gagnée 1 pour 1 sur un tirage à une chance
      // sur trois de perdre est rentable en boucle : réservée aux duels.
      if (!stakeAllowed("bot", mise)) {
        await interaction.reply({
          content: "Les mises contre le robot sont refusées : défie un joueur pour miser.",
          flags: MessageFlags.Ephemeral,
        });
        return;
      }
      await interaction.reply({
        embeds: [pfcEmbed("playing", "Choisis ton coup :")],
        components: [buttons("bot", userId)],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const invalid = opponentError(userId, opponent);
    if (invalid || !opponent) {
      await interaction.reply({
        content: invalid ?? "Adversaire invalide.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    const stake = mise ?? 0;
    const stakeError = await duelStakeError(
      {
        getBalance: (id) => this.eco.getBalance(id),
        maxStake: () => this.settings.getInt("game.max_stake", DUEL_MAX_STAKE_DEFAULT),
      },
      userId,
      opponent,
      stake,
    );
    if (stakeError) {
      await interaction.reply({ content: stakeError, flags: MessageFlags.Ephemeral });
      return;
    }
    const key = interaction.id;
    const duel: Duel = { challenger: userId, opponent: opponent.id, stake, choices: {} };
    duels.set(key, duel);

    const lines = [`${interaction.user} défie ${opponent} !`, "Chacun choisit en secret."];
    if (stake > 0) {
      lines.push(
        `Mise **${formatZeni(stake)}** par joueur, prélevée au résultat · pot **${formatZeni(stake * 2)}**`,
      );
    }
    const duelTtl = await this.settings.getInt("game.pfc.duel_timeout_ms", 10 * 60_000);
    lines.push(`Fin du duel <t:${Math.floor((Date.now() + duelTtl) / 1000)}:R>`);
    const response = await interaction.reply({
      content: `${opponent}`,
      embeds: [pfcEmbed("playing", lines.join("\n"))],
      components: [buttons("duel", key)],
      withResponse: true,
    });
    duel.message = response.resource?.message ?? undefined;
    // Un duel jamais joué se ferme : plus de boutons actifs ni d'entrée en mémoire.
    setTimeout(() => {
      if (duels.get(key) !== duel) return;
      duels.delete(key);
      const missing = [duel.challenger, duel.opponent]
        .filter((p) => !duel.choices[p])
        .map((p) => `<@${p}>`)
        .join(" et ");
      void duel.message
        ?.edit({
          content: "",
          embeds: [pfcEmbed("expired", `${missing} n'a pas joué à temps. Aucun gain.`)],
          components: [],
        })
        .catch(() => {});
    }, duelTtl).unref();
  }

  @ButtonComponent({ id: /^pfc:bot:(pierre|feuille|ciseaux):\d+$/ })
  async vsBot(interaction: ButtonInteraction) {
    const [, , player, userId] = interaction.customId.split(":") as [
      string,
      string,
      Choice,
      string,
    ];
    if (interaction.user.id !== userId) {
      await interaction.reply({ content: "Pas ta partie.", flags: MessageFlags.Ephemeral });
      return;
    }
    // Synchrone, avant tout `await` : un seul résultat par message.
    if (!playedBotRounds.consume(interaction.message.id, BOT_ROUND_TTL_MS)) {
      await interaction.reply({
        content: "Cette manche est déjà jouée. Relance `/pfc` pour rejouer.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    await interaction.deferUpdate();
    const botChoice = decideBotChoice();
    const result = resolvePfc(player, botChoice);
    const lines = [`Tu joues ${EMOJIS[player]} · le robot joue ${EMOJIS[botChoice]}`, ""];
    // The round is an ephemeral message: it speaks the player's own language.
    const lang = interactionLang(interaction);
    try {
      const [baseWin, baseLoss] = await Promise.all([
        this.settings.getInt("zeni.game.win", ZENI_GAME_WIN),
        this.settings.getInt("zeni.game.loss_penalty", ZENI_GAME_LOSS_PENALTY),
      ]);
      if (result === "win") {
        // Plafonds anti-farm (victoires payées sur 24 h) + journal du salon casino.
        const grant = await this.rewards.grantWin({ userId, amount: baseWin, game: "pfc" });
        lines.push(`**Victoire.** ${grantLine(grant, userId, "Gain", lang)}`);
        if (grant.paid > 0) {
          await this.msg.publish(
            "zeni_game_win",
            { user: `<@${userId}>`, zeni: grant.paid, game: "pfc" },
            interaction.client,
          );
        }
      } else if (result === "lose") {
        const removed = baseLoss > 0 ? await this.eco.removeZeni(userId, baseLoss) : false;
        const xp = await this.rewards.grantGameXp({ userId, outcome: "play", game: "pfc" });
        const gains = rewardText(lang, { xp, zeni: removed ? -baseLoss : 0 });
        lines.push(`**Défaite.**${gains ? ` ${gains}` : ""}`);
      } else {
        const xp = await this.rewards.grantGameXp({ userId, outcome: "draw", game: "pfc" });
        lines.push(`**Égalité.** ${rewardText(lang, { xp }) || "Aucun gain."}`);
      }
    } catch (err) {
      logger.error({ err }, "pfc: règlement contre le robot en échec");
      lines.push("Règlement impossible, réessaie plus tard.");
    }
    await interaction.editReply({
      embeds: [
        pfcEmbed(result === "win" ? "won" : result === "lose" ? "lost" : "draw", lines.join("\n")),
      ],
      components: [],
    });
  }

  @ButtonComponent({ id: /^pfc:duel:(pierre|feuille|ciseaux):\d+$/ })
  async vsPlayer(interaction: ButtonInteraction) {
    const [, , choice, key] = interaction.customId.split(":") as [string, string, Choice, string];
    const duel = duels.get(key);
    if (!duel) {
      await interaction.reply({
        content: "Ce duel est terminé ou a expiré.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    const userId = interaction.user.id;
    if (userId !== duel.challenger && userId !== duel.opponent) {
      await interaction.reply({ content: "Pas ta partie.", flags: MessageFlags.Ephemeral });
      return;
    }
    if (duel.choices[userId]) {
      await interaction.reply({ content: "Tu as déjà joué.", flags: MessageFlags.Ephemeral });
      return;
    }
    duel.choices[userId] = choice;
    const cC = duel.choices[duel.challenger];
    const oC = duel.choices[duel.opponent];
    // Retrait synchrone : seul le clic qui complète la manche la règle. Avant,
    // deux clics simultanés voyaient tous deux les deux choix après leur
    // `await` et versaient le gain deux fois.
    const complete = Boolean(cC && oC) && duels.get(key) === duel;
    if (complete) duels.delete(key);

    await interaction.reply({
      content: `Choix enregistré : ${EMOJIS[choice]}`,
      flags: MessageFlags.Ephemeral,
    });
    if (!complete || !cC || !oC) return;

    const text = await this.settleDuel(duel, cC, oC, interaction).catch((err) => {
      logger.error({ err, key }, "pfc: règlement du duel en échec");
      return "Règlement impossible, réessaie plus tard.";
    });
    const outcome = resolvePfc(cC, oC);
    await interaction.message
      .edit({
        content: "",
        embeds: [pfcEmbed(outcome === "draw" ? "draw" : "won", text)],
        components: [],
      })
      .catch(() => {});
  }

  private async settleDuel(
    duel: Duel,
    cC: Choice,
    oC: Choice,
    interaction: ButtonInteraction,
  ): Promise<string> {
    const head = `<@${duel.challenger}> ${EMOJIS[cC]} contre ${EMOJIS[oC]} <@${duel.opponent}>\n\n`;
    const outcome = resolvePfc(cC, oC);
    // The result is public: it follows the language of the public announcements.
    const lang = await this.settings.getLanguage();
    if (outcome === "draw") {
      const lines: string[] = [];
      for (const userId of [duel.challenger, duel.opponent]) {
        const xp = await this.rewards.grantGameXp({ userId, outcome: "draw", game: "pfc (duel)" });
        const line = playerRewardLine(lang, userId, xp);
        if (line) lines.push(line);
      }
      return `${head}**Égalité.** ${lines.join("\n") || "Aucun gain."}`;
    }
    const winner = outcome === "win" ? duel.challenger : duel.opponent;
    const loser = winner === duel.challenger ? duel.opponent : duel.challenger;

    if (duel.stake > 0) {
      // Mise prélevée aux deux joueurs puis rendue au gagnant : somme nulle,
      // sans multiplicateur ni part de fusion.
      const escrowed = await this.rewards.escrowStakes(duel.challenger, duel.opponent, duel.stake);
      if (!escrowed) {
        return `${head}<@${winner}> gagne — mise annulée, un des joueurs n'a plus le solde.`;
      }
      await this.rewards.payStakes("win", winner, loser, duel.stake);
      const lines = [
        `<@${winner}> remporte le pot de **${formatZeni(duel.stake * 2)}** · <@${loser}> perd sa mise.`,
      ];
      const winnerXp = await this.rewards.grantGameXp({
        userId: winner,
        outcome: "win",
        game: "pfc (duel)",
        opponentId: loser,
      });
      const loserXp = await this.rewards.grantGameXp({
        userId: loser,
        outcome: "play",
        game: "pfc (duel)",
      });
      for (const line of [
        playerRewardLine(lang, winner, winnerXp),
        playerRewardLine(lang, loser, loserXp),
      ]) {
        if (line) lines.push(line);
      }
      return `${head}${lines.join("\n")}`;
    }

    const baseWin = await this.settings.getInt("zeni.game.win", ZENI_GAME_WIN);
    const grant = await this.rewards.grantWin({
      userId: winner,
      amount: baseWin,
      opponentId: loser,
      game: "pfc (duel)",
    });
    if (grant.paid > 0) {
      await this.msg.publish(
        "zeni_game_win",
        { user: `<@${winner}>`, zeni: grant.paid, game: "pfc (duel)" },
        interaction.client,
      );
    }
    const loserXp = await this.rewards.grantGameXp({
      userId: loser,
      outcome: "play",
      game: "pfc (duel)",
    });
    const loserLine = playerRewardLine(lang, loser, loserXp);
    const winnerLine = grantLine(grant, winner, "Gain", lang);
    return `${head}<@${winner}> gagne. ${winnerLine}${loserLine ? `\n${loserLine}` : ""}`;
  }
}
