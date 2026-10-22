import { injectable, inject } from "tsyringe";
import { Bot, ButtonComponent, Discord, Guard, Slash, SlashChoice, SlashOption } from "discordx";
import { userTransformer } from "~/lib/slash-user";
import {
  ApplicationCommandOptionType,
  AttachmentBuilder,
  EmbedBuilder,
  MessageFlags,
  type ButtonInteraction,
  type Client,
  type CommandInteraction,
  type Message,
  type User,
} from "discord.js";
import { GuildOnly } from "~/guards/GuildOnly";
import { CommandsChannelOnly } from "~/guards/CommandsChannelOnly";
import { EconomyService } from "~/services/EconomyService";
import { ZENI_GAME_WIN, ZENI_GAME_LOSS_PENALTY } from "~/lib/constants";
import { formatZeni, formatZeniDelta } from "~/lib/zeni";
import { SettingsService } from "~/services/SettingsService";
import { MessageTemplateService } from "~/services/MessageTemplateService";
import { GameRewardService } from "~/services/GameRewardService";
import { buildChallengeMessage, challengeIdPattern, parseChallengeId } from "~/lib/challenge";
import { DBZ_COLORS } from "~/lib/embeds";
import { logger } from "~/lib/logger";
import { renderPenduCard } from "~/lib/game-cards";
import { stakeAllowed } from "~/services/games/anti-farm";
import {
  ActivePlayers,
  ChallengeBoard,
  DUEL_MAX_STAKE_DEFAULT,
  closedChallenge,
  duelStakeError,
  grantLine,
  opponentError,
  resolveChallengeClick,
  runMessageGame,
  stakeSummary,
  statusColor,
  type EndReason,
  type MoveOutcome,
} from "~/services/games/duel";
import { GameSessionsService } from "~/services/games/sessions";
import {
  DIFFICULTY_LABELS,
  parseGameDifficulty,
  type GameDifficulty,
} from "~/services/games/difficulty";
import {
  PENDU_LEVELS,
  PENDU_MAX_ERRORS_DEFAULT,
  createPenduState,
  evaluatePendu,
  guessPenduLetter,
  guessPenduWord,
  maskPenduWord,
  normalizePenduWord,
  penduErrors,
  penduLivesLeft,
  penduMaxErrorsFor,
  penduReward,
  randomPenduEntry,
  type PenduEntry,
  type PenduState,
} from "~/services/games/pendu";

interface PendingChallenge {
  entry: PenduEntry;
  level: GameDifficulty;
  challengerId: string;
  opponentId: string;
  stake: number;
}

interface PenduSession {
  id: string;
  entry: PenduEntry;
  level: GameDifficulty;
  state: PenduState;
  players: string[];
  endsAt: number;
  stake: number;
  winReward: number;
  lossPenalty: number;
  lastMove: string | null;
}

interface PenduConfig {
  maxErrors: number;
  winReward: number;
  lossPenalty: number;
}

type BoardPayload = { embeds: EmbedBuilder[]; files: AttachmentBuilder[] };

const challenges = new ChallengeBoard<PendingChallenge>();
/** Une seule partie de pendu à la fois par joueur (anti parties parallèles). */
const activePlayers = new ActivePlayers();
const GUESS_RE = /^[\p{L}' -]{1,40}$/u;

@Discord()
@Bot("shenron")
@Guard(GuildOnly, CommandsChannelOnly)
@injectable()
export class PenduCommand {
  constructor(
    @inject(EconomyService) private eco: EconomyService,
    @inject(SettingsService) private settings: SettingsService,
    @inject(MessageTemplateService) private msg: MessageTemplateService,
    @inject(GameRewardService) private rewards: GameRewardService,
    @inject(GameSessionsService) private journal: GameSessionsService,
  ) {}

  @Slash({
    name: "pendu",
    description: "Pendu Dragon Ball : trouve le mot avant d'épuiser tes Dragon Balls",
  })
  async pendu(
    @SlashChoice({ name: "bot", value: "bot" })
    @SlashChoice({ name: "joueur", value: "joueur" })
    @SlashOption({
      name: "mode",
      description: "bot/joueur",
      type: ApplicationCommandOptionType.String,
      required: true,
    })
    mode: "bot" | "joueur",
    @SlashOption(
      {
        name: "adversaire",
        description: "Adversaire (mode joueur)",
        type: ApplicationCommandOptionType.User,
        required: false,
      },
      userTransformer,
    )
    opponent: User | undefined,
    @SlashChoice({ name: "facile", value: "facile" })
    @SlashChoice({ name: "normal", value: "normal" })
    @SlashChoice({ name: "difficile", value: "difficile" })
    @SlashOption({
      name: "difficulte",
      description: "Facile, normal (défaut) ou difficile : plus dur, plus de zénis",
      type: ApplicationCommandOptionType.String,
      required: false,
    })
    difficulte: string | undefined,
    @SlashOption({
      name: "mise",
      description: "Mise en zénis, duel uniquement (séquestrée, le gagnant remporte le pot)",
      type: ApplicationCommandOptionType.Integer,
      required: false,
      minValue: 1,
      maxValue: 1_000_000,
    })
    mise: number | undefined,
    interaction: CommandInteraction,
  ) {
    const channel = interaction.channel;
    if (!channel?.isSendable()) {
      await interaction.reply({ content: "Non supporté ici.", flags: MessageFlags.Ephemeral });
      return;
    }
    if (!stakeAllowed(mode, mise)) {
      await interaction.reply({
        content: "Les mises sont réservées aux duels. En solo, le gain dépend de la difficulté.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    const userId = interaction.user.id;
    if (activePlayers.has(userId)) {
      await interaction.reply({
        content: "Tu as déjà une partie de pendu en cours.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    const level = parseGameDifficulty(difficulte);
    const entry = randomPenduEntry(level);
    const config = await this.loadConfig(level);

    if (mode === "joueur") {
      const invalid = opponentError(userId, opponent);
      if (invalid || !opponent) {
        await interaction.reply({
          content: invalid ?? "Adversaire invalide.",
          flags: MessageFlags.Ephemeral,
        });
        return;
      }
      if (activePlayers.has(opponent.id)) {
        await interaction.reply({
          content: `${opponent} a déjà une partie de pendu en cours.`,
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
      challenges.open(interaction.id, {
        entry,
        level,
        challengerId: userId,
        opponentId: opponent.id,
        stake,
      });
      await interaction.reply(
        buildChallengeMessage({
          scope: "pendu",
          key: interaction.id,
          challenger: interaction.user,
          opponent,
          gameTitle: `Pendu · Duel ${DIFFICULTY_LABELS[level].toLowerCase()}`,
          color: DBZ_COLORS.goku,
          stake: stakeSummary(stake, config.winReward, config.lossPenalty),
          extraFields: [
            {
              name: "Mot mystère",
              value: `**${entry.word.replace(/ /g, "").length} lettres**`,
              inline: true,
            },
            { name: "Vies", value: `${config.maxErrors}`, inline: true },
          ],
        }),
      );
      return;
    }

    if (!activePlayers.reserve([userId])) return;
    const session = this.createSession(interaction.id, entry, level, [userId], config, 0);
    this.journal.open({ id: session.id, game: "pendu", players: [userId], stake: 0 });
    try {
      const first = await this.boardPayload(session, "playing");
      const response = await interaction.reply({ ...first, withResponse: true });
      const board = response.resource?.message ?? null;
      this.start(channel, session, board, interaction.client);
    } catch (err) {
      activePlayers.release([userId]);
      this.journal.close(session.id);
      throw err;
    }
  }

  @ButtonComponent({ id: challengeIdPattern("pendu") })
  async onChallengeButton(interaction: ButtonInteraction) {
    const parsed = parseChallengeId(interaction.customId);
    if (!parsed) return;
    const challenge = await resolveChallengeClick(
      interaction,
      challenges,
      parsed.key,
      parsed.action,
      "Pendu",
    );
    if (!challenge) return;

    const channel = interaction.channel;
    const players = [challenge.challengerId, challenge.opponentId];
    if (!channel?.isSendable() || !activePlayers.reserve(players)) {
      await interaction.update(
        closedChallenge(
          "Pendu",
          "cancelled",
          "Un des joueurs a déjà une partie de pendu en cours.",
        ),
      );
      return;
    }

    await interaction.update({
      content: "",
      embeds: [
        new EmbedBuilder()
          .setTitle("Pendu · Duel accepté")
          .setDescription(
            `<@${challenge.opponentId}> relève le défi. Le premier qui trouve le mot gagne.`,
          )
          .setColor(DBZ_COLORS.goku),
      ],
      components: [],
    });
    const escrowed = await this.rewards.escrowStakes(
      challenge.challengerId,
      challenge.opponentId,
      challenge.stake,
    );
    if (!escrowed) {
      activePlayers.release(players);
      await interaction.editReply(
        closedChallenge(
          "Pendu",
          "cancelled",
          "Un des joueurs n'a plus assez de zénis pour couvrir la mise.",
        ),
      );
      return;
    }
    const [config, timeoutMs] = await Promise.all([
      this.loadConfig(challenge.level),
      this.settings.getInt("game.challenge_timeout_ms", 5 * 60_000),
    ]);
    const session = this.createSession(
      parsed.key,
      challenge.entry,
      challenge.level,
      players,
      config,
      challenge.stake,
      timeoutMs,
    );
    this.journal.open({ id: session.id, game: "pendu", players, stake: challenge.stake });
    try {
      const board = await channel.send(await this.boardPayload(session, "playing"));
      this.start(channel, session, board, interaction.client);
    } catch (err) {
      activePlayers.release(players);
      this.journal.close(session.id);
      await this.rewards.payStakes("cancel", players[0]!, players[1]!, challenge.stake);
      throw err;
    }
  }

  private async loadConfig(level: GameDifficulty): Promise<PenduConfig> {
    const [baseErrors, baseWin, baseLoss] = await Promise.all([
      this.settings.getInt("game.pendu.max_errors", PENDU_MAX_ERRORS_DEFAULT),
      this.settings.getInt("zeni.game.win", ZENI_GAME_WIN),
      this.settings.getInt("zeni.game.loss_penalty", ZENI_GAME_LOSS_PENALTY),
    ]);
    return {
      maxErrors: penduMaxErrorsFor(level, baseErrors),
      winReward: penduReward(baseWin, level),
      lossPenalty: Math.max(0, baseLoss),
    };
  }

  private createSession(
    id: string,
    entry: PenduEntry,
    level: GameDifficulty,
    players: string[],
    config: PenduConfig,
    stake: number,
    durationMs = PENDU_LEVELS[level].timeLimitMs,
  ): PenduSession {
    return {
      id,
      entry,
      level,
      state: createPenduState(entry.word, config.maxErrors),
      players,
      endsAt: Date.now() + durationMs,
      stake,
      winReward: config.winReward,
      lossPenalty: config.lossPenalty,
      lastMove: null,
    };
  }

  /** Boucle de jeu commune solo/duel (`runMessageGame`). */
  private start(
    channel: Parameters<typeof runMessageGame>[0]["channel"],
    session: PenduSession,
    firstBoard: Message | null,
    client: Client,
  ): void {
    if (firstBoard) this.journal.board(session.id, firstBoard.channelId, firstBoard.id);
    runMessageGame({
      scope: "pendu",
      channel,
      players: session.players,
      endsAt: session.endsAt,
      firstBoard,
      accepts: (content) => GUESS_RE.test(content),
      play: (m) => this.play(session, m),
      render: (status, result) => this.boardPayload(session, status, result),
      settle: (reason, winnerId) => {
        // Journal fermé avant le versement : jamais de remboursement en double.
        this.journal.close(session.id);
        return session.players.length === 1
          ? this.settleSolo(session, reason, client)
          : this.settleDuel(session, reason, winnerId, client);
      },
      onFinished: () => activePlayers.release(session.players),
      onBoard: (board) => this.journal.board(session.id, board.channelId, board.id),
    });
  }

  private play(session: PenduSession, m: Message): MoveOutcome {
    const { state } = session;
    const guess = normalizePenduWord(m.content);
    const letters = guess.replace(/[^a-z]/g, "");
    if (!letters) return { kind: "ignored" };
    const who = `<@${m.author.id}>`;
    if (guess.length === 1) {
      const r = guessPenduLetter(state, guess);
      if (r.alreadyPlayed) return { kind: "ignored" };
      session.lastMove = r.hit
        ? `${who} : **${guess.toUpperCase()}** est dans le mot.`
        : `${who} : **${guess.toUpperCase()}** n'y est pas, une Dragon Ball de moins.`;
    } else {
      const r = guessPenduWord(state, guess, PENDU_LEVELS[session.level].wordMissCost);
      if (r.ignored) return { kind: "ignored" };
      session.lastMove = r.correct
        ? `${who} trouve le mot entier.`
        : `${who} propose **${guess.toUpperCase()}** : raté, ${r.cost} vie${r.cost > 1 ? "s" : ""} perdue${r.cost > 1 ? "s" : ""}.`;
    }
    const outcome = evaluatePendu(state);
    if (outcome === "won") return { kind: "won", winnerId: m.author.id };
    if (outcome === "lost") return { kind: "lost" };
    return { kind: "playing" };
  }

  private async settleSolo(
    session: PenduSession,
    reason: EndReason,
    client: Client,
  ): Promise<string[]> {
    const userId = session.players[0]!;
    if (reason === "won") {
      const grant = await this.rewards.grantWin({
        userId,
        amount: session.winReward,
        game: "pendu",
      });
      if (grant.paid > 0) {
        await this.msg.publish(
          "zeni_game_win",
          { user: `<@${userId}>`, zeni: grant.paid, game: "pendu" },
          client,
        );
      }
      return [grantLine(grant, userId)];
    }
    const lines = [reason === "timeout" ? "Temps écoulé." : "Plus aucune Dragon Ball."];
    if (session.lossPenalty > 0 && (await this.eco.removeZeni(userId, session.lossPenalty))) {
      lines.push(`<@${userId}> **${formatZeniDelta(-session.lossPenalty)}**`);
    }
    return lines;
  }

  private async settleDuel(
    session: PenduSession,
    reason: EndReason,
    winnerId: string | undefined,
    client: Client,
  ): Promise<string[]> {
    const [a, b] = session.players as [string, string];
    if (reason !== "won" || !winnerId) {
      if (session.stake > 0) await this.rewards.payStakes("draw", a, b, session.stake);
      return [
        reason === "timeout"
          ? "Temps écoulé, personne n'a trouvé."
          : "Plus aucune Dragon Ball, personne n'a trouvé.",
        session.stake > 0 ? "Mises rendues." : "Aucun gain.",
      ];
    }
    const loserId = winnerId === a ? b : a;
    if (session.stake > 0) {
      await this.rewards.payStakes("win", winnerId, loserId, session.stake);
      return [`<@${winnerId}> remporte le pot : **${formatZeniDelta(session.stake * 2)}**.`];
    }
    const grant = await this.rewards.grantWin({
      userId: winnerId,
      amount: session.winReward,
      opponentId: loserId,
      game: "pendu (duel)",
    });
    const lines = [grantLine(grant, winnerId)];
    if (grant.paid === 0) return lines;
    if (session.lossPenalty > 0 && (await this.eco.removeZeni(loserId, session.lossPenalty))) {
      lines.push(`<@${loserId}> **${formatZeniDelta(-session.lossPenalty)}**`);
    }
    await this.msg.publish(
      "zeni_game_win",
      { user: `<@${winnerId}>`, zeni: grant.paid, game: "pendu (duel)" },
      client,
    );
    return lines;
  }

  private async boardPayload(
    session: PenduSession,
    status: "playing" | "won" | "lost",
    result?: string[],
  ): Promise<BoardPayload> {
    const { state, level, entry } = session;
    const config = PENDU_LEVELS[level];
    const category = config.showCategory ? entry.category : null;
    const shown = status === "playing" ? maskPenduWord(state, "_") : [...state.word].join(" ");
    const players =
      session.players.length === 1
        ? `Joueur : <@${session.players[0]}>`
        : `<@${session.players[0]}> contre <@${session.players[1]}>`;

    const description = [players, "", `**Mot :** \`${shown.toUpperCase()}\``];
    if (session.lastMove) description.push(session.lastMove);

    const missed = [...state.missed].toSorted().join(" ").toUpperCase();
    const embed = new EmbedBuilder()
      .setTitle(
        status === "won"
          ? "Pendu · Victoire"
          : status === "lost"
            ? "Pendu · Défaite"
            : `Pendu · ${DIFFICULTY_LABELS[level]}`,
      )
      .setDescription(description.join("\n"))
      .setColor(statusColor(status))
      .addFields(
        { name: "Difficulté", value: DIFFICULTY_LABELS[level], inline: true },
        { name: "Vies", value: `${penduLivesLeft(state)} / ${state.maxErrors}`, inline: true },
        { name: "Indice", value: category ?? "Aucun", inline: true },
      );

    if (status === "playing") {
      embed.addFields(
        {
          name: "Fin de partie",
          value: `<t:${Math.floor(session.endsAt / 1000)}:R>`,
          inline: true,
        },
        {
          name: "Gain",
          value:
            session.stake > 0
              ? `Pot de **${formatZeni(session.stake * 2)}**`
              : `**${formatZeniDelta(session.winReward)}**`,
          inline: true,
        },
        {
          name: "Mot faux",
          value: `-${config.wordMissCost} vie${config.wordMissCost > 1 ? "s" : ""}`,
          inline: true,
        },
      );
      if (missed) embed.addFields({ name: "Lettres ratées", value: missed });
      embed.setFooter({ text: "Envoie une lettre, ou tente le mot entier." });
    } else if (result?.length) {
      embed.addFields({ name: "Résultat", value: result.join("\n") });
    }

    const files: AttachmentBuilder[] = [];
    try {
      const png = await renderPenduCard({
        word: state.word,
        found: state.found,
        missed: state.missed,
        errors: penduErrors(state),
        maxErrors: state.maxErrors,
        status,
        level,
        category,
      });
      if (png.length > 0) {
        files.push(new AttachmentBuilder(png, { name: "pendu.png" }));
        embed.setImage("attachment://pendu.png");
      }
    } catch (err) {
      logger.debug({ err }, "pendu: rendu de la carte indisponible");
    }
    return { embeds: [embed], files };
  }
}
